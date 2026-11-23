'use strict';
// GEOGRAPHIC IDENTITY LAYER — country outlines (Natural Earth 1:50m via
// world-atlas, ISO numeric ids), large concentric distance rings and, where
// relevant, a great-circle route. Projection: azimuthal equidistant centred on
// the case's focal point, so the focal airport sits exactly on the network hub
// and ring radii are true distances.

AD.geoLayer = (() => {
  const GL = { status: 'loading' }, R = 6371, rad = Math.PI / 180;

  GL.load = async function (url) {
    try {
      const topo = await (await fetch(url)).json();
      GL.topo = topo;
      GL.byId = new Map(topo.objects.countries.geometries.map(g => [String(g.id), g]));
      GL.status = 'ok';
    } catch (e) { console.warn('Country outlines not loaded', e); GL.status = 'failed'; }
  };

  function makeProj(lat, lon) {
    const l0 = lat * rad, g0 = lon * rad;
    return (la, lo) => {
      const p = la * rad, dl = lo * rad - g0;
      const cosc = Math.max(-1, Math.min(1, Math.sin(l0) * Math.sin(p) + Math.cos(l0) * Math.cos(p) * Math.cos(dl)));
      const c = Math.acos(cosc), k = c < 1e-9 ? 1 : c / Math.sin(c);
      return { x: k * Math.cos(p) * Math.sin(dl) * R, y: -k * (Math.cos(l0) * Math.sin(p) - Math.sin(l0) * Math.cos(p) * Math.cos(dl)) * R, dist: c * R };
    };
  }

  // great circle between two points, n samples (spherical interpolation)
  function greatCircle([la1, lo1], [la2, lo2], n = 64) {
    const v = (la, lo) => [Math.cos(la * rad) * Math.cos(lo * rad), Math.cos(la * rad) * Math.sin(lo * rad), Math.sin(la * rad)];
    const a = v(la1, lo1), b = v(la2, lo2);
    const w = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s1 = Math.sin((1 - t) * w) / Math.sin(w), s2 = Math.sin(t * w) / Math.sin(w);
      const x = s1 * a[0] + s2 * b[0], y = s1 * a[1] + s2 * b[1], z = s1 * a[2] + s2 * b[2];
      out.push([Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad]);
    }
    return out;
  }

  // project once per case and cache (km units)
  GL.prep = function (c) {
    if (c._geo || GL.status !== 'ok') return c._geo || null;
    const proj = makeProj(c.geo.focus.lat, c.geo.focus.lon), segs = [];
    for (const id of c.geo.countries) {
      const g = GL.byId.get(id); if (!g) { console.warn('missing country', id); continue; }
      const f = topojson.feature(GL.topo, g), polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) {
        const s = [];
        for (const [lo, la] of ring) { const q = proj(la, lo); s.push(q.x, q.y); }
        segs.push(Float32Array.from(s));
      }
    }
    const pts = c.geo.points.map(p => ({ ...proj(p.lat, p.lon), label: p.label }));
    const route = c.geo.route ? greatCircle(c.geo.route.from, c.geo.route.to).map(([la, lo]) => proj(la, lo)) : null;
    c._geo = { segs, pts, route };
    return c._geo;
  };

  GL.draw = function (ctx, c, alpha, cx, cy, R, T, opt = {}) {
    if (alpha <= 0.01) return;
    const s = R / c.geo.kmRadius, g = GL.prep(c);
    ctx.save();
    // concentric distance rings (true km from the focal point)
    ctx.lineWidth = 0.6; ctx.font = `9px ${AD.FONT}`; ctx.textAlign = 'left';
    for (const km of c.geo.rings) {
      const r = km * s;
      ctx.strokeStyle = AD.col(T.ink, 0.07 * alpha);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = AD.col(T.muted, 0.55 * alpha);
      ctx.fillText(`${km} km`, cx + r * Math.cos(-0.95) + 3, cy + r * Math.sin(-0.95));
    }
    if (g) {
      // country outlines — thin, unfilled
      ctx.strokeStyle = AD.col(T.coast, 0.75 * alpha); ctx.lineWidth = 0.7; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const r of g.segs) {
        ctx.moveTo(cx + r[0] * s, cy + r[1] * s);
        for (let k = 2; k < r.length; k += 2) ctx.lineTo(cx + r[k] * s, cy + r[k + 1] * s);
      }
      ctx.stroke();
      if (g.route && opt.route !== false) {
        ctx.setLineDash([3, 4]); ctx.strokeStyle = AD.col(T.ink, 0.5 * alpha); ctx.lineWidth = 0.8;
        ctx.beginPath(); g.route.forEach((q, i) => (i ? ctx.lineTo(cx + q.x * s, cy + q.y * s) : ctx.moveTo(cx + q.x * s, cy + q.y * s))); ctx.stroke();
        ctx.setLineDash([]);
        const mid = g.route[Math.floor(g.route.length * 0.35)];
        ctx.fillStyle = AD.col(T.muted, 0.8 * alpha); ctx.fillText(c.geo.route.label, cx + mid.x * s + 8, cy + mid.y * s - 8);
      }
      for (const q of g.pts) {
        ctx.fillStyle = AD.col(T.ink, 0.9 * alpha);
        ctx.beginPath(); ctx.arc(cx + q.x * s, cy + q.y * s, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.font = `10px ${AD.FONT}`; ctx.fillText(q.label, cx + q.x * s + 6, cy + q.y * s + 4);
      }
    } else if (GL.status === 'failed') {
      ctx.fillStyle = AD.col(T.muted, alpha); ctx.fillText('country outline unavailable (offline)', cx + 8, cy + R + 14);
    }
    ctx.restore();
  };

  return GL;
})();
