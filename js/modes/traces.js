'use strict';
// B · FLIGHT TRACES — time × distance (no geography).
// Horizontal = time (the playhead is the right edge). Vertical = great-circle
// distance between LHR and the other airport: arrivals above, departures below,
// Heathrow is the centre line. Each flight = one segment from its first to its
// last ADS-B contact. Unknown other end = outer band (a category, not a distance).
// Inferred diversions end at their landing airport's distance — they never reach the line.

AD.modes.traces = {
  key: 'traces', label: 'Traces',
  desc: 'Time × distance. Horizontal = time (the right edge is now). Vertical = distance of the other airport: arrivals above, departures below, the event airport is the centre line. Each flight is one segment from first to last ADS-B contact (a short mark when only one end was seen); the outer band holds flights whose other airport is unknown. Fainter = other airport inferred from the callsign route lookup. Violet = inferred diversions: they stop at their landing airport\'s distance and never reach the line. Shaded = receiver gap (missing data).',
  last: {},

  draw(ctx, a, T) {
    const D = AD.data, S = AD.state, p = S.p, cfg = AD.cfg;
    const left = a.x + 74, right = a.x + a.w - 18, top = a.y + 34, bottom = a.y + a.h - 10;
    const cy = Math.round((top + bottom) / 2) + 0.5, half = (bottom - top) / 2, band = 16;
    const span = S.spanH * 60, tA = p - span;
    const ticks = []; for (let km = 1000; km < cfg.maxKm; km += cfg.maxKm > 4500 ? 2000 : 1000) ticks.push(km);
    const X = t => left + (t - tA) / span * (right - left);
    const dy = km => Math.min(km, cfg.maxKm) / cfg.maxKm * (half - band - 8);   // beyond maxKm: drawn at the edge
    const yUnk = up => cy + (up ? -1 : 1) * (half - band / 2);

    ctx.save(); ctx.beginPath(); ctx.rect(left, top - 4, right - left + 1, bottom - top + 8); ctx.clip();

    // grid: midnights, distance ticks, unknown bands
    ctx.font = `9px ${AD.FONT}`;
    ctx.strokeStyle = AD.col(T.faint); ctx.lineWidth = 1;
    for (let d = Math.floor(tA / DAY) + 1; d * DAY <= p; d++) {
      const x = Math.round(X(d * DAY)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    ctx.setLineDash([2, 4]);
    for (const km of ticks) for (const sgn of [-1, 1]) {
      const y = Math.round(cy + sgn * dy(km)) + 0.5;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = AD.col(T.faint, 0.35);
    ctx.fillRect(left, cy - half, right - left, band); ctx.fillRect(left, cy + half - band, right - left, band);
    // event lines
    for (const { t, dash } of D.marks) {
      if (!isFinite(t) || t < tA || t > p) continue;
      const x = Math.round(X(t)) + 0.5;
      ctx.strokeStyle = AD.col(T.alert, 0.8); ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
    }

    // receiver gaps: shaded + labelled so an empty stretch is not read as "no flights"
    for (const [g0, g1] of D.gaps) {
      if (g1 < tA || g0 > p) continue;
      const xa = X(Math.max(g0, tA)), xb = X(Math.min(g1, p));
      ctx.fillStyle = AD.col(T.faint, 0.45); ctx.fillRect(xa, top, xb - xa, bottom - top);
      ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'center'; ctx.fillText('receiver gap · no data', (xa + xb) / 2, cy - 6);
    }

    // flights — batched by colour and alpha bucket
    const persist = S.persist.traces >= 120 ? Infinity : S.persist.traces * 60;
    const buckets = new Map(), FR = AD.route.get(), fseg = [];   // route focus: its flights drawn on top
    const fdim = FR ? 0.3 : 1;
    const add = (key, x0, y0, x1, y1) => { let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(x0, y0, x1, y1); };
    let shown = 0, unk = 0;
    D.eachActive(tA, p, i => {
      if (D.t0[i] > p) return;
      const live = D.t1[i] >= p;
      const alpha = live ? 1 : Math.exp(-(p - D.t1[i]) / persist);
      if (alpha < 0.03) return;
      const o = D.other[i], up = D.dir[i] === 1;
      const tEnd = Math.min(D.t1[i], p), f = (tEnd - D.t0[i]) / Math.max(1, D.t1[i] - D.t0[i]);
      const yFar = o >= 0 ? cy + (up ? -1 : 1) * dy(D.ap[o].dist) : yUnk(up);
      let y0, y1;
      if (up) { y0 = yFar; y1 = yFar + (cy - yFar) * f; }      // arriving: from far → centre line
      else { y0 = cy; y1 = cy + (yFar - cy) * f; }             // departing: centre line → far
      const q = Math.ceil(alpha * 8) / 8 * (D.inf[i] & 1 ? 0.5 : 1);          // inferred other airport: fainter
      if (FR && o === FR.A.i) fseg.push(up, q, X(D.t0[i]), y0, X(tEnd), y1);
      else add((up ? 'a' : 'd') + q * fdim, X(D.t0[i]), y0, X(tEnd), y1);
      shown++; if (o < 0) unk++;
    });
    ctx.lineWidth = 0.7 * S.weight; ctx.lineCap = 'round';
    for (const [key, arr] of buckets) {
      ctx.strokeStyle = AD.col(key[0] === 'a' ? T.arr : T.dep, 0.4 * S.opacity * parseFloat(key.slice(1)));  // dense: 0.4 keeps overlap readable
      ctx.beginPath();
      for (let k = 0; k < arr.length; k += 4) { ctx.moveTo(arr[k], arr[k + 1]); ctx.lineTo(arr[k + 2], arr[k + 3]); }
      ctx.stroke();
    }

    // focus route: distance guides at the route's distance (arrivals above, departures below) and its flights on top
    if (FR) {
      const yA = cy - dy(FR.A.dist), yD = cy + dy(FR.A.dist), k = FR.k;
      ctx.lineWidth = 1; ctx.setLineDash(k > 0 ? [6, 5] : []);
      ctx.strokeStyle = k > 0 ? AD.col(T.alert, 0.35 + 0.45 * k) : AD.col(T.ink, 0.25);
      for (const y of [yA, yD]) { ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.lineWidth = 1.8 * S.weight;
      for (let k2 = 0; k2 < fseg.length; k2 += 6) {
        ctx.strokeStyle = AD.col(fseg[k2] ? T.arr : T.dep, Math.min(1, 0.35 + fseg[k2 + 1]));
        ctx.beginPath(); ctx.moveTo(fseg[k2 + 2], fseg[k2 + 3]); ctx.lineTo(fseg[k2 + 4], fseg[k2 + 5]); ctx.stroke();
      }
      ctx.font = `500 10px ${AD.FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = AD.col(FR.quiet ? T.alert : T.ink);
      const nm = (AD.currentCase().focusName || FR.A.name).toUpperCase();
      const msg = FR.quiet ? `${nm} · ${AD.route.quietText(FR)}` : `${nm} · ${FR.obs24} movements / 24 h · normal ${FR.exp24.toFixed(0)}`;
      ctx.fillText(msg, right - 4, yA - 6);
      ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted);
      ctx.fillText(`from ${FR.A.iata}`, right - 4, yA + 12); ctx.fillText(`to ${FR.A.iata}`, right - 4, yD - 6);
    }

    // inferred diversions
    let divN = 0;
    ctx.lineWidth = 1.1 * S.weight; ctx.font = `9px ${AD.FONT}`; ctx.textAlign = 'left';
    for (const d of D.div) {
      if (!D.passesDiv(d) || d.t0 > p || d.t1 < tA) continue;
      const tEnd = Math.min(d.t1, p), f = (tEnd - d.t0) / Math.max(1, d.t1 - d.t0);
      const yS = d.from ? cy - dy(d.from.dist) : yUnk(true);
      const yE = d.ap ? cy - dy(d.ap.dist) : yUnk(true);
      ctx.strokeStyle = AD.col(T.diverted, 0.9);
      ctx.beginPath(); ctx.moveTo(X(d.t0), yS); ctx.lineTo(X(tEnd), yS + (yE - yS) * f); ctx.stroke();
      if (d.t1 <= p && d.ap) {
        ctx.fillStyle = AD.col(T.diverted);
        ctx.beginPath(); ctx.arc(X(d.t1), yE, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      divN++;
    }
    ctx.restore();

    // axis labels
    ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'right';
    for (const km of ticks) {
      ctx.fillText(km + ' km', left - 6, cy - dy(km) + 3);
      ctx.fillText(km + ' km', left - 6, cy + dy(km) + 3);
    }
    ctx.fillText('unknown', left - 6, yUnk(true) + 3); ctx.fillText('unknown', left - 6, yUnk(false) + 3);
    ctx.fillStyle = AD.col(T.ink); ctx.fillText(D.hub.iata, left - 6, cy + 3);
    const FR2 = AD.route.get();
    if (FR2) { ctx.fillStyle = AD.col(FR2.quiet ? T.alert : T.ink); ctx.font = `500 9px ${AD.FONT}`; for (const sg of [-1, 1]) ctx.fillText(FR2.A.iata, left - 6, cy + sg * dy(FR2.A.dist) + 3); ctx.font = `9px ${AD.FONT}`; }
    ctx.textAlign = 'left';
    ctx.fillStyle = AD.col(T.arr); ctx.fillText('ARRIVING ↓  origin distance', left, top - 8);
    ctx.fillStyle = AD.col(T.dep); ctx.fillText('DEPARTING ↓  destination distance', left, bottom + 0);
    ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'center';
    for (let d = Math.floor(tA / DAY); d * DAY <= p; d++) {
      const xm = X(d * DAY + DAY / 2);
      if (xm > left + 20 && xm < right - 20) ctx.fillText(AD.time.date(d * DAY).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }), xm, top - 8);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = AD.col(T.ink); ctx.fillText('now ▸', right, top - 8);

    this.last = { shown, unk, divN };
  },

  stats() {
    const L = this.last;
    return [
      [`Flights in the last ${AD.state.spanH} h view`, L.shown],
      ['…of which other end unknown', L.unk],
      ['Inferred diversions in view', L.divN],
    ];
  },
};
