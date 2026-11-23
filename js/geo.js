'use strict';
// GEO — azimuthal equidistant projection centred on the hub airport.
// Every straight line through the centre is a great circle, and distance
// from the centre is true. Coastlines: Natural Earth 1:50m via world-atlas.

AD.geo = (() => {
  const G = {}, R = 6371, rad = Math.PI / 180;
  let lat0 = 51.47 * rad, lon0 = -0.4543 * rad;
  G.rings = null;          // coastline segments, projected (km), Float32Array [x,y,…]
  G.status = 'loading';

  G.setCenter = (lat, lon) => { lat0 = lat * rad; lon0 = lon * rad; };

  G.project = function (lat, lon) {
    const p = lat * rad, dl = lon * rad - lon0;
    const cosc = Math.max(-1, Math.min(1, Math.sin(lat0) * Math.sin(p) + Math.cos(lat0) * Math.cos(p) * Math.cos(dl)));
    const c = Math.acos(cosc), k = c < 1e-9 ? 1 : c / Math.sin(c);
    const x = k * Math.cos(p) * Math.sin(dl);
    const y = k * (Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(dl));
    return { x: x * R, y: -y * R, dist: c * R };   // screen y grows downward
  };

  G.bearing = function (lat, lon) {
    const p = lat * rad, dl = lon * rad - lon0;
    const b = Math.atan2(Math.sin(dl) * Math.cos(p), Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(dl));
    return (b / rad + 360) % 360;
  };

  G.loadLand = async function (url) {
    try {
      const topo = await (await fetch(url)).json();
      const fc = topojson.feature(topo, topo.objects.land);
      const geoms = fc.features ? fc.features.map(f => f.geometry) : [fc.geometry];
      G.raw = [];
      for (const g of geoms) {
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const poly of polys) for (const ring of poly) G.raw.push(ring);
      }
      G.reproject(); G.status = 'ok';
    } catch (e) {
      console.warn('Coastline not loaded:', e);
      G.status = 'failed';
    }
  };

  // project the raw coastline around the current centre (called on load and on case change)
  G.reproject = function () {
    if (!G.raw) return;
    const out = [];
    for (const ring of G.raw) {
      let seg = [], prev = null;
      for (const [lon, lat] of ring) {
        const q = G.project(lat, lon);
        const ok = q.dist < 7000;
        const jump = prev && Math.hypot(q.x - prev.x, q.y - prev.y) > 1500;
        if (!ok || jump) { if (seg.length > 3) out.push(Float32Array.from(seg)); seg = []; }
        if (ok) seg.push(q.x, q.y);
        prev = ok ? q : null;
      }
      if (seg.length > 3) out.push(Float32Array.from(seg));
    }
    G.rings = out; G.cacheKey = '';
  };

  // coastlines are cached in an offscreen canvas; redrawn only on resize/theme change
  let cache = null;
  G.cacheKey = '';
  G.drawLand = function (ctx, area, cx, cy, s, T) {
    if (!G.rings) return;
    const dpr = window.devicePixelRatio > 1 ? 2 : 1;
    const key = [area.w, area.h, cx, cy, s, AD.state.theme, dpr].join('|');
    if (key !== G.cacheKey) {
      cache = cache || document.createElement('canvas');
      cache.width = Math.ceil(area.w * dpr); cache.height = Math.ceil(area.h * dpr);
      const c = cache.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, area.w, area.h);
      c.strokeStyle = AD.col(T.coast, 0.7); c.lineWidth = 0.65; c.lineJoin = 'round';
      c.beginPath();
      for (const r of G.rings) {
        c.moveTo(cx - area.x + r[0] * s, cy - area.y + r[1] * s);
        for (let k = 2; k < r.length; k += 2) c.lineTo(cx - area.x + r[k] * s, cy - area.y + r[k + 1] * s);
      }
      c.stroke();
      G.cacheKey = key;
    }
    ctx.drawImage(cache, area.x, area.y, area.w, area.h);
  };

  return G;
})();
