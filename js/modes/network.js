'use strict';
// A · FLIGHT NETWORK — geography.
// Azimuthal equidistant map centred on Heathrow. A line = a route flown
// recently (brightness = number of flights, fading with persistence).
// A dot = a flight airborne now; its position is INTERPOLATED between the
// first and last ADS-B contact along the great circle — schematic, not a track.

AD.modes.network = {
  key: 'network', label: 'Network',
  desc: 'Geography. Map centred on the event airport (azimuthal equidistant): straight lines from the centre are great circles, distance is true. Line = route flown recently, brighter = more flights. Dot = flight airborne now, position interpolated between first and last ADS-B contact (not a recorded track). Flights whose other airport is unknown cannot be placed and are counted in the box. Red ring = airport whose link has fewer than 30 % of its normal flights in the last 3 h; violet ring = inferred diversions landed there. Dashed line = the other airport is mostly inferred from the callsign route lookup, not observed. Airports beyond the map edge are drawn in their true direction.',
  inten: null, last: {},

  draw(ctx, a, T) {
    const D = AD.data, S = AD.state, p = S.p;
    // fit the map to the airports that actually appear in the data (LHR stays the projection centre)
    if (!this.bbox) {
      let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
      for (const A of D.ap) if ((D.apBase0[A.i] >= 0.3 || D.divAirports.has(A.i)) && A.dist <= AD.cfg.mapKm) {   // far airports point off-map
        x0 = Math.min(x0, A.x); x1 = Math.max(x1, A.x); y0 = Math.min(y0, A.y); y1 = Math.max(y1, A.y);
      }
      this.bbox = { x0, x1, y0, y1 };
    }
    const B = this.bbox, pad = 36, FR = AD.route.get(), c = AD.currentCase();
    let s, cx, cy;
    if (FR) {
      // route focus: the hub ↔ focus airport line spans ~60 % of the width; frame = Levant → Gulf
      const A = FR.A;
      s = Math.min((0.6 * a.w) / Math.max(1, Math.abs(A.x)), (a.h - 150) / (Math.abs(A.y) + 1100));
      cx = a.x + a.w / 2 - (A.x / 2) * s; cy = a.y + a.h / 2 - 10 - (A.y / 2 + 180) * s;
    } else {
      s = Math.min((a.w - pad * 2) / (B.x1 - B.x0), (a.h - pad * 2 - 40) / (B.y1 - B.y0));
      cx = a.x + a.w / 2 - ((B.x0 + B.x1) / 2) * s; cy = a.y + a.h / 2 - 16 - ((B.y0 + B.y1) / 2) * s;
    }
    if (!(s > 0)) return;                                  // area too small (e.g. mid-resize)
    const X = A => cx + A.x * s, Y = A => cy + A.y * s;

    ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    AD.geo.drawLand(ctx, a, cx, cy, s, T);

    if (FR) {
      // country outlines, true-distance rings and context points (Tabuk) from the case geography
      AD.geoLayer.draw(ctx, c, 1, cx, cy, s * c.geo.kmRadius, T, { route: false });
    } else {
      // range rings (true distance from LHR)
      ctx.strokeStyle = AD.col(T.faint); ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'left';
      for (const km of [1000, 2000, 3000]) {
        ctx.beginPath(); ctx.arc(cx, cy, km * s, 0, Math.PI * 2); ctx.stroke();
        ctx.fillText(km + ' km', cx + 3, cy - km * s - 3);
      }
      ctx.setLineDash([]);
    }
    const dim = FR ? 0.35 : 1;                              // route focus: the rest of the network is context

    // accumulate route intensity + airborne flights
    const persist = S.persist.network * 60;
    if (!this.inten || this.inten.length !== D.ap.length) this.inten = new Float32Array(D.ap.length);
    const inten = this.inten; inten.fill(0);
    if (!this.infW || this.infW.length !== D.ap.length) this.infW = new Float32Array(D.ap.length);
    const infW = this.infW; infW.fill(0);
    const air = [], recent = new Set(); let unkDep = 0, unkArr = 0;
    D.eachActive(p - persist * 5, p, i => {
      const o = D.other[i], live = D.t1[i] >= p;
      const w = live ? 1 : Math.exp(-(p - D.t1[i]) / persist);
      if (o >= 0) { inten[o] += w; if (D.inf[i] & 1) infW[o] += w; if (live) air.push(i); if (live || p - D.t1[i] <= persist) recent.add(o); }
      else if (live) D.dir[i] ? unkArr++ : unkDep++;
    });

    // all known airports, faint
    ctx.fillStyle = AD.col(T.muted, 0.5);
    for (const A of D.ap) if (D.apBase0[A.i] > 0) ctx.fillRect(X(A) - 0.75, Y(A) - 0.75, 1.5, 1.5);

    // routes
    ctx.strokeStyle = AD.col(T.ink); ctx.lineWidth = 0.75 * S.weight;
    for (let o = 0; o < inten.length; o++) {
      if (inten[o] < 0.02 || (FR && o === FR.A.i)) continue;
      const A = D.ap[o];
      ctx.globalAlpha = dim * Math.min(1, S.opacity * (0.08 + 1.05 * (1 - Math.exp(-inten[o] / 2.5))));
      ctx.setLineDash(infW[o] > inten[o] / 2 ? [3, 3] : []);         // dashed = airport mostly inferred (route lookup)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(A), Y(A)); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);

    // airborne flights (interpolated position)
    const r = 1.6 * S.weight;
    ctx.globalAlpha = dim;
    for (const i of air) {
      if (FR && D.other[i] === FR.A.i) continue;            // drawn larger with the focus route
      const A = D.ap[D.other[i]], f = Math.min(1, (p - D.t0[i]) / Math.max(1, D.t1[i] - D.t0[i]));
      const g = D.dir[i] === 0 ? f : 1 - f;
      ctx.fillStyle = AD.col(D.dir[i] === 0 ? T.dep : T.arr);
      ctx.beginPath(); ctx.arc(cx + A.x * s * g, cy + A.y * s * g, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // inferred diversions: rings at the airport where an LHR-regular callsign landed instead
    const divW = new Map(); let divAir = 0, divLanded = 0;
    for (const d of D.div) {
      if (!D.passesDiv(d) || d.t0 > p) continue;
      if (d.t1 > p) { divAir++; continue; }
      if (!d.ap) continue;
      const w = Math.exp(-(p - d.t1) / Math.max(persist, 360));
      if (w < 0.03) continue;
      divLanded++;
      const e = divW.get(d.ap) || { w: 0, n: 0 }; e.w += w; e.n++; divW.set(d.ap, e);
    }
    // affected airports, part 1: links that lost flights — fewer than 30 % of the
    // reference flights at these same hours (last 3 h, airports with ≥ 1 expected)
    const W3 = 180, now = new Float32Array(D.ap.length), lost = [];
    D.eachActive(p - W3, p, i => { const t = D.tm[i]; if (t > p - W3 && t <= p && D.other[i] >= 0) now[D.other[i]]++; });
    for (const A of D.ap) {
      if (A === D.hub || divW.has(A) || (FR && A === FR.A)) continue;
      const e = D.expected(p - W3, p, D.ref.apHour, A.i * 24);
      if (e >= 1 && now[A.i] < 0.3 * e) lost.push({ A, e, o: now[A.i] });
    }
    ctx.lineWidth = 0.8;
    for (const q of lost) {
      ctx.strokeStyle = AD.col(T.alert, 0.6 * dim);
      ctx.beginPath(); ctx.arc(X(q.A), Y(q.A), 2.5 + 0.9 * Math.sqrt(q.e), 0, Math.PI * 2); ctx.stroke();
    }
    // affected airports, part 2: inferred diversions landing there (violet, as on the board)
    for (const [A, e] of divW) {
      ctx.strokeStyle = AD.col(T.diverted, Math.min(1, 0.35 + e.w * 0.35)); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(X(A), Y(A), 4 + 2.2 * Math.sqrt(e.n), 0, Math.PI * 2); ctx.stroke();
    }

    // labels — placed without overlaps; affected airports win space first
    const F9 = `9px ${AD.FONT}`, items = [];
    const taken = [{ x0: cx - 6, y0: cy - 18, x1: cx + 30, y1: cy + 6 }];
    const focus = FR ? this.focus(ctx, a, T, FR, X, Y, cx, cy, s, air) : null;
    if (focus) taken.push(...focus.boxes);
    for (const [A, e] of divW) {
      const r = 4 + 2.2 * Math.sqrt(e.n);
      items.push({ x: X(A), y: Y(A), lines: [`${A.iata} +${e.n} div.`], font: `10px ${AD.FONT}`, color: AD.col(T.diverted), pri: 1e6 + e.n, cands: AD.labels.around(r + 2) });
    }
    // same label set as normal; an affected airport only turns red (no extra text = no extra noise)
    const lostOf = new Map(lost.map(q => [q.A, q]));
    for (const A of D.ap) {
      if (A === D.hub || divW.has(A) || D.apBase0[A.i] < 4 || (FR && A === FR.A)) continue;
      const q = lostOf.get(A), r = q ? 2.5 + 0.9 * Math.sqrt(q.e) + 1 : 2;
      items.push({ x: X(A), y: Y(A), lines: [A.iata], font: F9, color: q ? AD.col(T.alert, 0.85 * dim) : AD.col(T.muted, dim),
        pri: D.apBase0[A.i] + (q ? 0.5 : 0), cands: AD.labels.around(r) });
    }
    AD.labels.place(ctx, items, { x: a.x + 4, y: a.y + 4, w: a.w - 8, h: a.h - 60 }, taken);
    if (FR) {
      ctx.font = F9; ctx.textAlign = 'right'; ctx.fillStyle = AD.col(FR.quiet ? T.alert : T.muted, 0.9);
      ctx.fillText(`red = no ${FR.A.iata} flight observed for longer than the longest normal gap (${AD.route.fmtH(FR.maxGap)}, ${AD.cfg.refLabels.before})`, a.x + a.w - 8, a.y + a.h - 21);
      ctx.fillText('a data threshold, not the official suspension time', a.x + a.w - 8, a.y + a.h - 8);
    } else if (lost.length) {
      ctx.font = F9; ctx.textAlign = 'right'; ctx.fillStyle = AD.col(T.alert, 0.9);
      ctx.fillText('red = below 30 % of normal · violet = diverted*', a.x + a.w - 8, a.y + a.h - 8);
    }
    if (!FR) {
      ctx.strokeStyle = AD.col(T.ink); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = AD.col(T.ink); ctx.font = `10px ${AD.FONT}`; ctx.textAlign = 'left'; ctx.fillText(D.hub.iata, cx + 7, cy - 6);
    }
    ctx.restore();

    // box: airborne flights whose other end is unknown (cannot be placed)
    const bx = a.x + 14, cols = 24, gap = 5, n = unkDep + unkArr, rows = Math.max(1, Math.ceil(n / cols));
    const by = a.y + a.h - 14 - rows * gap - 18;
    ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'left';
    ctx.fillText(`OTHER END UNKNOWN · AIRBORNE NOW · ${n}`, bx, by);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = AD.col(k < unkDep ? T.dep : T.arr);
      ctx.fillRect(bx + (k % cols) * gap, by + 8 + Math.floor(k / cols) * gap, 2.4, 2.4);
    }

    this.last = { routes: recent.size, air: air.length, unk: n, divAir, divLanded, lost: lost.length };
  },

  // the focus route (airline case): one thick line hub ↔ airport. Active = ink, brightness ∝ flights in
  // the last 24 h; quiet (no movement for longer than the longest normal gap) = red, dashed, with the
  // time since the last observed movement. Straight line = great circle (azimuthal projection centred on the hub).
  focus(ctx, a, T, FR, X, Y, cx, cy, s, air) {
    const D = AD.data, S = AD.state, p = S.p, A = FR.A, tx = X(A), ty = Y(A), k = FR.k;
    const act = FR.exp24 > 0 ? Math.min(1, FR.obs24 / FR.exp24) : 0;
    ctx.lineCap = 'round';
    if (k < 1) {
      ctx.strokeStyle = AD.col(T.ink, (1 - k) * (0.25 + 0.75 * act)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    }
    if (k > 0) {
      ctx.strokeStyle = AD.col(T.alert, 0.9 * k); ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    }
    // flights on the route now (interpolated between first and last contact; not a track)
    for (const i of air) {
      if (D.other[i] !== A.i) continue;
      const f = Math.min(1, (p - D.t0[i]) / Math.max(1, D.t1[i] - D.t0[i])), g = D.dir[i] === 0 ? f : 1 - f;
      ctx.fillStyle = AD.col(D.dir[i] === 0 ? T.dep : T.arr);
      ctx.beginPath(); ctx.arc(cx + (tx - cx) * g, cy + (ty - cy) * g, 3.6, 0, Math.PI * 2); ctx.fill();
    }
    // endpoints
    ctx.fillStyle = AD.col(T.ink); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2); ctx.fill();
    if (k > 0) { ctx.strokeStyle = AD.col(T.alert, k); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.stroke(); }
    // labels
    const boxes = [], lab = (x, y, lines, align) => {
      let w = 0; lines.forEach(([t, f]) => { ctx.font = f; w = Math.max(w, ctx.measureText(t).width); });
      ctx.textAlign = align;
      lines.forEach(([t, f, c], j) => { ctx.font = f; ctx.fillStyle = c; ctx.fillText(t, x, y + j * 14); });
      const x0 = align === 'left' ? x : x - w;
      boxes.push({ x0: x0 - 3, y0: y - 12, x1: x0 + w + 3, y1: y + lines.length * 14 - 8 });
    };
    const F11 = `500 11px ${AD.FONT}`, F9 = `9px ${AD.FONT}`, red = AD.col(T.alert), mut = AD.col(T.muted), ink = AD.col(T.ink);
    const tl = [[`${(AD.currentCase().focusName || A.name).toUpperCase()} · ${A.iata}`, F11, k > 0.5 ? red : ink]];
    if (FR.quiet) {
      tl.push([AD.route.quietText(FR), F9, red]);
      if (FR.last != null) tl.push([`last seen ${AD.time.short(FR.last)} UTC`, F9, mut]);
    } else tl.push([`${FR.obs24} movements / 24 h · normal ${FR.exp24.toFixed(0)}`, F9, mut]);
    lab(Math.max(a.x + 8, tx - 70), ty - 22 - (tl.length - 1) * 14, tl, 'left');
    lab(cx + 10, cy + 22, [[`DUBAI · ${D.hub.iata}`, F11, ink], ['flydubai hub', F9, mut]], 'left');
    // route caption at the midpoint, on the side away from the outlines' densest area
    const mx = (cx + tx) / 2, my = (cy + ty) / 2;
    ctx.save(); ctx.translate(mx, my); let ang = Math.atan2(ty - cy, tx - cx); if (Math.abs(ang) > Math.PI / 2) ang += Math.PI; ctx.rotate(ang);
    ctx.textAlign = 'center'; ctx.font = F9;
    ctx.fillStyle = k > 0.5 ? red : mut;
    ctx.fillText(k > 0.5 ? 'NO FLIGHTS OBSERVED BEYOND THE NORMAL INTERVAL' : `${D.hub.iata} ⇄ ${A.iata} · great circle, not the flown track`, 0, -9);
    ctx.restore();
    return { boxes };
  },

  stats() {
    const L = this.last;
    return [
      ['Airborne, placed on map', L.air],
      ['Airborne, other end unknown', L.unk],
      ['Routes flown in last ' + AD.state.persist.network + ' h', L.routes],
      ['Inferred diversions shown', L.divLanded + (L.divAir ? ` (+${L.divAir} airborne)` : '')],
      ['Links below 30 % (last 3 h)', L.lost],
    ];
  },
};
