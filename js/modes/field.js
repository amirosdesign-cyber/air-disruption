'use strict';
// C · DISRUPTION FIELD — the network as a system, measured against a reference.
// Node = airport. Order around the ring = compass bearing from LHR, but spacing
// is equal (topology, not geography). Radius = strength of the normal link
// (strong = inner). For every link: OUTLINE / thin grey = what the reference
// period has at these same hours of day; SOLID = what actually happened in the
// selected window. Red outline = link below 30 % of expected.

AD.modes.field = {
  key: 'field', label: 'Field',
  desc: 'System. Each airport is a node; order = compass bearing from the event airport, spacing equal (not a map). Strong normal links sit inside. Grey outline / thin line = expected from the reference period at these same hours of day. Solid = what happened in the selected window. Red outline = link below 30 % of expected. Violet dashed = inferred diversions landing there. Dashed lower-left node = flights whose other end is unknown (not a route; its width is capped at the strongest real link).',
  nodes: null, last: {},

  layout() {
    const D = AD.data;
    const nodes = D.ap.filter(A => A !== D.hub && (D.apBase0[A.i] >= 0.3 || D.divAirports.has(A.i)));
    nodes.sort((x, y) => x.bearing - y.bearing);
    const maxB = Math.max(...nodes.map(A => D.apBase0[A.i]));
    nodes.forEach((A, k) => {
      A.fAng = -Math.PI / 2 + (2 * Math.PI * k) / nodes.length;
      A.fRad = 1 - Math.log1p(D.apBase0[A.i]) / Math.log1p(maxB);
    });
    this.nodes = nodes;
  },

  draw(ctx, a, T) {
    const D = AD.data, S = AD.state, p = S.p;
    if (!this.nodes) this.layout();
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const R = Math.min(a.w, a.h) * 0.41, rIn = R * 0.24;
    const W = S.windowH * 60, perDay = DAY / W;

    // observed in window (by movement time at LHR)
    const cur = new Float32Array(D.ap.length); let curUnk = 0;
    D.eachActive(p - W, p, i => {
      const t = D.tm[i]; if (t <= p - W || t > p) return;
      D.other[i] >= 0 ? cur[D.other[i]]++ : curUnk++;
    });
    // expected in the same window from the reference hour-of-day profile
    const exp = A => D.expected(p - W, p, D.ref.apHour, A.i * 24);
    const lw = v => S.weight * 0.45 * Math.sqrt(v);
    const nr = v => 1.2 + S.weight * 0.85 * Math.sqrt(v);

    const pos = A => [cx + Math.cos(A.fAng) * (rIn + A.fRad * (R - rIn)), cy + Math.sin(A.fAng) * (rIn + A.fRad * (R - rIn))];

    // diversions landed in window
    const divN = new Map(); let divTot = 0;
    for (const d of D.div) if (D.passesDiv(d) && d.ap && d.t1 > p - W && d.t1 <= p) { divN.set(d.ap, (divN.get(d.ap) || 0) + 1); divTot++; }

    let refLinks = 0, active = 0, weak = 0, sumE = 0, sumC = 0;
    const draws = [];
    for (const A of this.nodes) {
      const e = exp(A) * perDay, c = cur[A.i] * perDay;
      const [x, y] = pos(A);
      sumE += e; sumC += c;
      const isRef = e >= 0.5;
      if (isRef) { refLinks++; if (c > 0) active++; }
      const isWeak = isRef && c < 0.3 * e;
      if (isWeak) weak++;
      draws.push({ A, x, y, e, c, isWeak });
    }
    // unknown other end (no position possible: separate node, not on the ring)
    const eU = D.expected(p - W, p, D.ref.unkHour) * perDay, cU = curUnk * perDay;
    // placed just outside the ring (lower left), kept inside the drawing area
    const ux = Math.max(a.x + 24, cx + Math.cos(Math.PI * 0.78) * R * 1.12), uy = Math.min(a.y + a.h - 30, cy + Math.sin(Math.PI * 0.78) * R * 1.12);
    // This aggregate (~40 % of all flights) is not one route. Drawn at full scale its
    // stroke was ~13 px wide and dominated the view, so line width and node size are
    // capped at the strongest real link; the true numbers are printed beside it.
    let maxV = 0; for (const d of draws) maxV = Math.max(maxV, d.e, d.c);
    const capped = Math.max(eU, cU) > maxV, cap = v => Math.min(v, maxV);

    const FR = AD.route.get(), fd = d => (FR && d.A !== FR.A ? 0.35 : 1);   // route focus: other links are context
    ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    // ghost links (expected)
    ctx.lineCap = 'round';
    ctx.strokeStyle = AD.col(T.muted, 0.35);
    for (const d of draws) if (d.e > 0.05) { ctx.globalAlpha = fd(d); ctx.lineWidth = Math.max(0.5, lw(d.e)); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    if (eU > 0.05) { ctx.lineWidth = lw(cap(eU)); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ux, uy); ctx.stroke(); ctx.setLineDash([]); }
    // actual links
    ctx.strokeStyle = AD.col(T.ink, S.opacity);
    for (const d of draws) if (d.c > 0) { ctx.globalAlpha = fd(d); ctx.lineWidth = Math.max(0.5, lw(d.c)); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(d.x, d.y); ctx.stroke(); }
    ctx.globalAlpha = FR ? 0.35 : 1;
    if (cU > 0) { ctx.lineWidth = lw(cap(cU)); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ux, uy); ctx.stroke(); ctx.setLineDash([]); }
    // diversion links (violet, as on the board and in Flow)
    ctx.setLineDash([3, 3]); ctx.strokeStyle = AD.col(T.diverted, 0.9); ctx.lineWidth = 1;
    for (const [A] of divN) { const [x, y] = pos(A); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.setLineDash([]);

    // nodes
    const node = (x, y, e, c, weakFlag) => {
      ctx.fillStyle = AD.col(T.bg); ctx.beginPath(); ctx.arc(x, y, nr(Math.max(e, c)), 0, Math.PI * 2); ctx.fill();
      if (e > 0.05) {
        ctx.strokeStyle = weakFlag ? AD.col(T.alert) : AD.col(T.muted, 0.8); ctx.lineWidth = weakFlag ? 1.2 : 0.8;
        ctx.beginPath(); ctx.arc(x, y, nr(e), 0, Math.PI * 2); ctx.stroke();
      }
      if (c > 0) { ctx.fillStyle = AD.col(T.ink, S.opacity); ctx.beginPath(); ctx.arc(x, y, nr(c), 0, Math.PI * 2); ctx.fill(); }
    };
    for (const d of draws) { ctx.globalAlpha = fd(d); node(d.x, d.y, d.e, d.c, d.isWeak); }
    ctx.globalAlpha = FR ? 0.35 : 1;
    node(ux, uy, cap(eU), cap(cU), eU >= 0.5 && cU < 0.3 * eU);
    ctx.globalAlpha = 1;
    // focus route: drawn on top, thicker; red dashed once no movement for longer than the longest normal gap
    let fBox = null;
    const fdr = FR && draws.find(d => d.A === FR.A);
    if (fdr) {
      const k = FR.k;
      ctx.strokeStyle = AD.col(T.muted, 0.6); ctx.lineWidth = Math.max(1.5, lw(fdr.e)); ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fdr.x, fdr.y); ctx.stroke(); ctx.setLineDash([]);
      if (fdr.c > 0) { ctx.strokeStyle = AD.col(T.ink, 1 - k * 0.7); ctx.lineWidth = Math.max(2.5, lw(fdr.c)); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fdr.x, fdr.y); ctx.stroke(); }
      if (k > 0) { ctx.strokeStyle = AD.col(T.alert, 0.9 * k); ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fdr.x, fdr.y); ctx.stroke(); ctx.setLineDash([]); }
      node(fdr.x, fdr.y, fdr.e, fdr.c, fdr.isWeak || FR.quiet);
      if (k > 0) { ctx.strokeStyle = AD.col(T.alert, k); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(fdr.x, fdr.y, nr(Math.max(fdr.e, fdr.c)) + 6, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const [A, n] of divN) {
      const [x, y] = pos(A);
      ctx.strokeStyle = AD.col(T.diverted); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, Math.min(nr(n * perDay), nr(maxV)) + 3, 0, Math.PI * 2); ctx.stroke();
    }

    // labels — placed without overlaps; diversions and weak links win space first
    const items = [], taken = [AD.labels.box(cx, cy - 10, 14)];
    const F9 = `9px ${AD.FONT}`;
    for (const d of draws) {
      const div = divN.get(d.A);
      if (fdr && d === fdr) {
        const out = nr(Math.max(d.e, d.c)) + 10, red = FR.k > 0.5;
        items.push({ x: d.x, y: d.y, font: `500 11px ${AD.FONT}`, color: AD.col(red ? T.alert : T.ink), pri: 1e7,
          lines: [`${(AD.currentCase().focusName || d.A.name).toUpperCase()} · ${d.A.iata}`,
            FR.quiet ? AD.route.quietText(FR) : `${Math.round(d.c)} / ${Math.round(d.e)} per day (window)`],
          // radial first; fallbacks so the focus label is never dropped near the crowded hub
          cands: [...AD.labels.radial(Math.cos(d.A.fAng), Math.sin(d.A.fAng), out), ...AD.labels.around(out),
            ...AD.labels.radial(Math.cos(d.A.fAng), Math.sin(d.A.fAng), out + 40), ...AD.labels.around(out + 30)] });
        continue;
      }
      taken.push(AD.labels.box(d.x, d.y, nr(Math.min(maxV, Math.max(d.e, d.c)))));
      if (D.apBase0[d.A.i] < 5 && !div) continue;
      const out = Math.max(nr(Math.max(d.e, d.c)), 2) + 4;
      items.push({
        x: d.x, y: d.y, lines: [d.A.iata + (div ? ` +${div} div.` : '')], font: F9,
        color: div ? AD.col(T.diverted) : AD.col(d.isWeak ? T.alert : T.muted, fd(d)),
        pri: (div ? 1e4 : 0) + (d.isWeak ? 1e3 : 0) + D.apBase0[d.A.i],
        cands: AD.labels.radial(Math.cos(d.A.fAng), Math.sin(d.A.fAng), out),
      });
    }
    const ur = nr(cap(Math.max(eU, cU))) + 6;
    items.push({ x: ux, y: uy, lines: ['OTHER END UNKNOWN', `${Math.round(cU)} / ${Math.round(eU)} per day${capped ? ' · width capped' : ''}`],
      font: F9, color: AD.col(T.muted), pri: 1e6, cands: [[ur, -2, 'left'], [0, ur + 8, 'center'], [-ur, -2, 'right']] });
    AD.labels.place(ctx, items, { x: a.x, y: a.y, w: a.w, h: a.h }, taken);

    // hub
    ctx.fillStyle = AD.col(T.ink); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = `10px ${AD.FONT}`; ctx.textAlign = 'center'; ctx.fillText(D.hub.iata, cx, cy - 8);
    ctx.restore();

    this.last = { refLinks, active, weak, flow: sumE + eU > 0 ? (sumC + cU) / (sumE + eU) : null, divTot };
  },

  stats() {
    const L = this.last;
    return [
      ['Links expected (≥0.5/day)', L.refLinks],
      ['…active in window', L.active],
      ['…below 30 % of expected', L.weak],
      ['Total flow vs expected', L.flow == null ? '–' : Math.round(L.flow * 100) + ' %'],
      ['Inferred diversions in window', L.divTot],
    ];
  },
};
