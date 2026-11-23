'use strict';
// C · FLOW — the field (C) set in continuous motion (B's behaviour).
//
// What moves, and why:
//  • Every link LHR ↔ airport has two lanes (departures / arrivals), drawn as
//    curved arcs that bend to opposite sides so the lanes separate.
//  • Each lane EMITS dots at a rate proportional to the flights actually observed
//    on that link in the last `rateH` hours before the playhead (flights / hour).
//    No flights → no dots. Fewer flights → fewer dots. Flights return → dots return.
//  • Dots travel at one calm constant speed; their trail fades behind them.
//  • Emission is deterministic (an accumulator per lane, phases staggered by the
//    golden ratio). There is no randomness anywhere.
//  • Pausing the timeline freezes the DATA (rates stay fixed), but the dots keep
//    looping at those rates. "Stop motion" freezes everything.
//  • The dots illustrate connection intensity — they are NOT aircraft positions.

AD.modes.flow = {
  key: 'flow', label: 'Flow',
  desc: 'Motion = connection intensity. Each link to the event airport has two lanes (departures / arrivals). Dots are emitted at a rate proportional to the flights observed on that link in the last few hours before the playhead, then travel at one calm speed and leave a fading trail. No flights, no dots. Thin grey arcs and rings = what the reference period has at these same hours; red labels = links that lost flights (−n = derived cancellations). Violet dots arriving from outside = inferred diversions (origin unknown). The country outline and the large rings (true km from the airport) give the place; the node ring itself is ordered by bearing, not a map. Time runs as three equal-length phases: Before, Disruption, After. This illustrates connections; it is not a reconstruction of flight paths.',
  last: {}, built: false,

  build() {
    const D = AD.data;
    // flights / day in the reference period to get a node of its own: 4, or lower for a partial
    // sample so that the ~40 strongest links still get a node (the rest = "smaller airports")
    const ranked = D.ap.filter(A => A !== D.hub).map(A => D.apBase0[A.i]).sort((a, b) => b - a);
    const MIN = Math.min(4, Math.max(0.5, ranked[39] || 0.5));
    this.labelMin = Math.min(12, Math.max(1, ranked[14] || 1));   // ~15 strongest links get a label
    const keep = D.ap.filter(A => A !== D.hub && (D.apBase0[A.i] >= MIN || D.divAirports.has(A.i)));
    keep.sort((x, y) => x.bearing - y.bearing);
    const maxB = Math.max(...keep.map(A => D.apBase0[A.i]));
    // group index: every airport → its node (own node, or the aggregate "smaller airports")
    this.nodes = keep.map((A, k) => ({
      ap: A, label: A.iata, ang: -Math.PI / 2 + (2 * Math.PI * k) / keep.length,
      rad: 0.22 + 0.78 * (1 - Math.sqrt(D.apBase0[A.i] / maxB)),   // strong links inside, spread by sqrt
    }));
    const SMALL = this.nodes.length, UNK = SMALL + 1;
    this.nodes.push({ ap: null, label: 'SMALLER AIRPORTS', fixed: 'br' });
    this.nodes.push({ ap: null, label: 'OTHER END UNKNOWN', fixed: 'bl' });
    this.nodeOf = new Int16Array(D.ap.length).fill(SMALL);
    this.nodes.forEach((n, k) => { if (n.ap) this.nodeOf[n.ap.i] = k; });
    this.SMALL = SMALL; this.UNK = UNK;
    const nn = this.nodes.length;
    // lanes: 2 per node (0 = departure, 1 = arrival) + 1 diversion lane per node
    this.acc = new Float32Array(nn * 3);
    for (let k = 0; k < this.acc.length; k++) this.acc[k] = (k * 0.6180339887) % 1;   // deterministic stagger
    this.rate = new Float32Array(nn * 3);    // smoothed dots-per-hour-of-flights
    this.obs = new Float32Array(nn * 3);
    this.expd = new Float32Array(nn);
    this.dots = [];                          // {lane, born}
    this.vt = 0;                             // visual clock (seconds), runs only while motion is on
    this.built = true;
  },

  // node position in px for the current layout
  pos(n, g) {
    // the two aggregate nodes sit just outside the ring (lower left / lower right): no bearing exists for them
    if (n.fixed) { const ang = n.fixed === 'bl' ? Math.PI * 0.78 : Math.PI * 0.22, r = g.R * 1.12; return [g.cx + Math.cos(ang) * r, g.cy + Math.sin(ang) * r]; }
    const r = g.rIn + n.rad * (g.R - g.rIn);
    return [g.cx + Math.cos(n.ang) * r, g.cy + Math.sin(n.ang) * r];
  },

  // quadratic arc from P0 to P1, bent to one side; lane side keeps dep/arr apart
  arc(x0, y0, x1, y1, side) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1, bend = 0.16 * len * side;
    return { x0, y0, x1, y1, cx: mx - (dy / len) * bend, cy: my + (dx / len) * bend, len: len * 1.04 };
  },
  pt(c, u) {
    const v = 1 - u;
    return [v * v * c.x0 + 2 * v * u * c.cx + u * u * c.x1, v * v * c.y0 + 2 * v * u * c.cy + u * u * c.y1];
  },

  update(dt) {
    const D = AD.data, S = AD.state, F = S.flow, p = S.p, nn = this.nodes.length;
    // 1 · observed flights per lane in the last rateH hours (by movement time at LHR)
    const W = F.rateH * 60;
    this.obs.fill(0); this.expd.fill(0);
    D.eachActive(p - W, p, i => {
      const t = D.tm[i]; if (t <= p - W || t > p) return;
      const k = D.other[i] >= 0 ? this.nodeOf[D.other[i]] : this.UNK;
      this.obs[k * 3 + D.dir[i]]++;
    });
    for (const d of D.div) {
      if (!D.passesDiv(d) || !d.ap || d.t1 <= p - W || d.t1 > p) continue;
      this.obs[this.nodeOf[d.ap.i] * 3 + 2]++;
    }
    // expected (reference period, same hours of day) per node — for the grey structure
    for (const A of D.ap) {
      if (A === D.hub) continue;
      this.expd[this.nodeOf[A.i]] += D.expected(p - W, p, D.ref.apHour, A.i * 24) / F.rateH;
    }
    this.expd[this.UNK] = D.expected(p - W, p, D.ref.unkHour) / F.rateH;

    if (!F.motion) return;
    this.vt += dt;
    // 2 · smooth rates (visual easing only, ~0.8 s) and emit dots deterministically
    const ease = Math.min(1, dt / 0.8), k0 = F.density * 0.5;    // dots / s per (flight / hour)
    for (let k = 0; k < nn * 3; k++) {
      const target = this.obs[k] / F.rateH;                       // flights / hour
      this.rate[k] += (target - this.rate[k]) * ease;
      if (this.rate[k] < 0.02) continue;
      this.acc[k] += this.rate[k] * k0 * dt;
      while (this.acc[k] >= 1) { this.acc[k] -= 1; this.dots.push({ lane: k, born: this.vt - this.acc[k] / (this.rate[k] * k0) }); }
    }
  },

  draw(ctx, a, T) {
    const D = AD.data, S = AD.state, F = S.flow;
    if (!this.built) this.build();
    // R leaves room for the aggregate nodes (1.12 R) and their labels inside the area
    const g = { a, cx: a.x + a.w / 2, cy: a.y + 62 + (a.h - 62 - 16) / 2, R: Math.min(a.w * 0.5 - 30, (a.h - 62 - 16) * 0.5 - 20) * 0.9 };
    g.rIn = g.R * 0.2;

    // geographic identity: outgoing case fades out, incoming fades in (~1.2 s)
    const k = AD.caseK(), from = AD.caseById[S.caseFrom], to = AD.currentCase();
    ctx.save(); ctx.beginPath(); ctx.rect(a.x - 18, a.y + 60, a.w + 18, a.h - 76); ctx.clip();
    if (from !== to) AD.geoLayer.draw(ctx, from, 1 - k, g.cx, g.cy, g.R, T);
    AD.geoLayer.draw(ctx, to, from !== to ? k : 1, g.cx, g.cy, g.R, T);
    ctx.restore();
    const rdy = c => (c.status === 'ready' ? 1 : 0);
    const netA = from !== to ? (rdy(from) && rdy(to) ? k : rdy(from) * (1 - k) + rdy(to) * k) : rdy(to);   // a new network fades in
    if (netA <= 0.01) { this.last = {}; return; }
    ctx.save(); ctx.globalAlpha = netA;
    ctx.beginPath(); ctx.rect(a.x - 18, a.y + 60, a.w + 18, a.h - 76); ctx.clip();   // nothing leaves the area
    const nn = this.nodes.length;
    const P = this.nodes.map(n => this.pos(n, g));
    const FR = AD.route.get(), fj = FR && !this.nodes[this.nodeOf[FR.A.i]].fixed ? this.nodeOf[FR.A.i] : -1, fdim = FR ? 0.35 : 1;   // route focus
    // route focus: the focus airport sits at its TRUE position (same projection and scale as the outline),
    // so its lanes run along the scheduled great circle; every other node stays schematic
    if (fj >= 0) { const sc = g.R / to.geo.kmRadius; P[fj] = [g.cx + FR.A.x * sc, g.cy + FR.A.y * sc]; }
    // geometry per lane
    const lanes = new Array(nn * 3);
    for (let j = 0; j < nn; j++) {
      const [x, y] = P[j];
      lanes[j * 3] = this.arc(g.cx, g.cy, x, y, 1);           // departure: hub → node
      lanes[j * 3 + 1] = this.arc(x, y, g.cx, g.cy, 1);       // arrival: node → hub (bends to the other side)
      const ox = x - g.cx, oy = y - g.cy, ol = Math.hypot(ox, oy) || 1;
      const dl = Math.min(70, g.R * 0.3);                                           // stays inside the area
      lanes[j * 3 + 2] = this.arc(x + (ox / ol) * dl, y + (oy / ol) * dl, x, y, 0.4);   // diversion: from outside, origin unknown
    }

    // structure: expected links as hairline arcs (brightness ∝ expected flights/hour)
    ctx.lineWidth = 0.5;
    for (let j = 0; j < nn; j++) {
      const e = this.expd[j]; if (e < 0.01) continue;
      ctx.strokeStyle = j === fj ? (FR.k > 0 ? AD.col(T.alert, 0.3 + 0.5 * FR.k) : AD.col(T.ink, 0.45)) : AD.col(T.muted, Math.min(0.35, 0.06 + e * 0.04));
      ctx.lineWidth = j === fj ? 1.2 : 0.5; ctx.setLineDash(j === fj && FR.k > 0 ? [5, 5] : []);
      for (const c of [lanes[j * 3], lanes[j * 3 + 1]]) {
        ctx.beginPath(); ctx.moveTo(c.x0, c.y0); ctx.quadraticCurveTo(c.cx, c.cy, c.x1, c.y1); ctx.stroke();
      }
    }
    ctx.setLineDash([]); ctx.lineWidth = 0.5;

    // dots + trails (analytic: the trail is the arc segment just behind the dot)
    const speed = F.speedPx, trail = F.trail, STEPS = 6;
    const paths = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };   // 3–5 = focus route lanes
    const alive = [];
    for (const d of this.dots) {
      const c = lanes[d.lane], age = this.vt - d.born, u = (age * speed) / c.len;
      if (u - (trail * speed) / c.len > 1) continue;            // fully arrived, trail gone
      alive.push(d);
      paths[(fj >= 0 && Math.floor(d.lane / 3) === fj ? 3 : 0) + d.lane % 3].push([c, u]);
    }
    this.dots = alive;
    const cols = [T.flowDep, T.flowArr, T.diverted];
    ctx.lineCap = 'round';
    for (const lt of [0, 1, 2, 3, 4, 5]) {
      const list = paths[lt]; if (!list.length) continue;
      const type = lt % 3, foc = lt >= 3, al = foc ? 1 : fdim;
      for (let s = 0; s < STEPS; s++) {                         // trail in STEPS fading pieces
        ctx.strokeStyle = AD.col(cols[type], al * Math.min(1, S.opacity * (foc ? 0.9 : 0.55)) * (1 - s / STEPS) ** 1.6);
        ctx.lineWidth = (foc ? 1.4 : 0.6) * S.weight;
        ctx.beginPath();
        for (const [c, u] of list) {
          const du = (trail * speed) / c.len / STEPS;
          const ua = Math.min(1, u - s * du), ub = Math.max(0, u - (s + 1) * du);
          if (ua <= 0 || ub >= 1 || ua <= ub) continue;
          const [x0, y0] = this.pt(c, ua), [x1, y1] = this.pt(c, (ua + ub) / 2), [x2, y2] = this.pt(c, ub);
          ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      }
      ctx.fillStyle = AD.col(cols[type], al * Math.min(1, S.opacity + 0.2));
      const ds = (foc ? 1.6 : 0.9) * S.weight;
      for (const [c, u] of list) {
        if (u > 1 || u < 0) continue;
        const [x, y] = this.pt(c, u);
        ctx.fillRect(x - ds, y - ds, 2 * ds, 2 * ds);
      }
    }

    // nodes: hairline ring = expected, dot = observed now
    let flowing = 0, expectedLinks = 0, obsTot = 0, expTot = 0;
    // derived cancellations per node in the same window (links that lost flights)
    const cxl = new Map();
    for (const r of AD.schedule.between(S.p - F.rateH * 60, S.p + 1)) if (r.status === 'cancelled') {
      const kk = r.other >= 0 ? this.nodeOf[r.other] : this.UNK; cxl.set(kk, (cxl.get(kk) || 0) + 1);
    }
    const items = [], taken = [AD.labels.box(g.cx + 18, g.cy - 9, 16)], F9 = `9px ${AD.FONT}`;
    for (let j = 0; j < nn; j++) {
      const n = this.nodes[j], [x, y] = P[j];
      const e = this.expd[j], o = (this.obs[j * 3] + this.obs[j * 3 + 1]) / F.rateH;
      obsTot += o; expTot += e;
      if (e >= 0.1) { expectedLinks++; if (o > 0) flowing++; }
      const weak = e >= 0.5 && o < 0.3 * e, foc = j === fj, na = foc || fj < 0 ? 1 : fdim;
      ctx.strokeStyle = (weak || (foc && FR.quiet)) ? AD.col(T.alert, 0.8) : AD.col(T.muted, 0.5 * na); ctx.lineWidth = foc ? 1.2 : 0.6;
      ctx.beginPath(); ctx.arc(x, y, (foc ? 3 : 1.5) + 1.6 * Math.sqrt(e), 0, Math.PI * 2); ctx.stroke();
      if (o > 0) { ctx.fillStyle = AD.col(T.ink, 0.9 * na); ctx.beginPath(); ctx.arc(x, y, (foc ? 2 : 0.8) + 1.6 * Math.sqrt(o), 0, Math.PI * 2); ctx.fill(); }
      if (foc && FR.k > 0) { ctx.strokeStyle = AD.col(T.alert, FR.k); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 9 + 1.6 * Math.sqrt(e), 0, Math.PI * 2); ctx.stroke(); }
      const nr = 1.6 * Math.sqrt(Math.max(e, o));
      taken.push(AD.labels.box(x, y, 2 + nr));
      const div = this.obs[j * 3 + 2];
      const nc = cxl.get(j) || 0;
      const show = n.fixed || (n.ap && D.apBase0[n.ap.i] >= this.labelMin * (g.R < 170 ? 2.5 : 1)) || div > 0 || nc > 1 || j === fj;
      if (!show) continue;
      if (j === fj) {
        const fo = this.obs[j * 3] + this.obs[j * 3 + 1];
        items.push({ x, y, font: `500 11px ${AD.FONT}`, color: AD.col(FR.k > 0.5 ? T.alert : T.ink), pri: 1e7,
          lines: [`${(to.focusName || n.ap.name).toUpperCase()} · ${n.label}`,
            FR.quiet ? AD.route.quietText(FR) : `${fo} / ${(e * F.rateH).toFixed(0)} in the last ${F.rateH} h`],
          cands: (() => { const dx = x - g.cx, dy = y - g.cy, l = Math.hypot(dx, dy) || 1; return [...AD.labels.radial(dx / l, dy / l, 12 + nr), [14 + nr, 18, 'left'], [0, 24 + nr, 'center'], [14 + nr, -4, 'left']]; })() });
        continue;
      }
      const color = div > 0 ? AD.col(T.diverted) : nc > 0 ? AD.col(T.alert) : AD.col(T.muted, fj >= 0 ? 0.6 : 1);
      if (n.fixed) {
        // aggregate nodes: label outward (left node → text to its left, right node → to its right)
        const side = n.fixed === 'bl' ? -1 : 1, al = side < 0 ? 'right' : 'left', off = 10 + nr;
        items.push({ x, y, lines: [n.label, `${o.toFixed(1)} / ${e.toFixed(1)} per h`], font: F9, color, pri: 1e6,
          cands: [[side * off, -2, al], [0, off + 8, 'center'], [-side * off, -2, side < 0 ? 'left' : 'right']] });
      } else {
        items.push({ x, y, lines: [n.label + (div ? ` +${div} div.` : '') + (nc ? ` −${nc}` : '')], font: F9, color,
          pri: (div ? 1e5 : 0) + (nc ? 1e4 + nc : 0) + (n.ap ? D.apBase0[n.ap.i] : 0),
          cands: AD.labels.radial(Math.cos(n.ang), Math.sin(n.ang), 6 + nr) });
      }
    }
    AD.labels.place(ctx, items, { x: a.x, y: a.y + 60, w: a.w, h: a.h - 76 }, taken);

    // hub
    ctx.fillStyle = AD.col(T.ink); ctx.beginPath(); ctx.arc(g.cx, g.cy, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `10px ${AD.FONT}`; ctx.textAlign = 'left'; ctx.fillText(to.geo.focus.label, g.cx + 7, g.cy - 6);

    ctx.restore();
    // method note, always visible (and in exported PNGs)
    ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted, 0.8); ctx.textAlign = 'left';
    ctx.fillText('dots ∝ flights per link · schematic, not aircraft positions', a.x, a.y + a.h - 4);
    if (!F.motion) { ctx.fillStyle = AD.col(T.ink); ctx.textAlign = 'right'; ctx.fillText('MOTION STOPPED', a.x + a.w, a.y + 34); }

    this.last = { dots: this.dots.length, obsTot, expTot, flowing, expectedLinks };
  },

  stats() {
    const L = this.last;
    return [
      ['Flights / hour now (window)', `${(L.obsTot || 0).toFixed(1)}`],
      ['Expected at these hours', `${(L.expTot || 0).toFixed(1)}`],
      ['Flow vs expected', L.expTot ? Math.round((L.obsTot / L.expTot) * 100) + ' %' : '–'],
      ['Links flowing / expected', `${L.flowing} / ${L.expectedLinks}`],
      ['Dots on screen', L.dots],
    ];
  },
};
