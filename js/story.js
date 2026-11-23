'use strict';
// STORY — the three-part narrative loop for C · Flow.
// Before / Disruption / After each get the same screen time (phaseSec), whatever
// their real duration. The timeline is three equal blocks with hourly bars,
// the reference expectation, and a status summary per phase for direct comparison.

AD.story = (() => {
  const ST = { rect: null, blocks: [], sums: [], lastPhase: -1, phaseChangedAt: 0 };

  ST.phaseOf = function (p) {
    const ph = AD.currentCase().phases;
    for (let i = 0; i < ph.length; i++) if (p < ph[i].b) return Math.max(0, i);
    return ph.length - 1;
  };

  // is the playhead inside the case's three phases?
  ST.inside = function (p) {
    const ph = AD.currentCase().phases;
    return ph[0].a !== undefined && p >= ph[0].a && p < ph[ph.length - 1].b;
  };

  // relative position {i, f} of a timestamp: phase index and fraction within it (clamped)
  ST.rel = function (p) {
    const c = AD.currentCase(), S = AD.state;
    if (c.status !== 'ready') return { i: S.pendingPhase, f: S.pendingF };
    const i = ST.phaseOf(p), ph = c.phases[i];
    return { i, f: Math.min(0.999, Math.max(0, (p - ph.a) / (ph.b - ph.a))) };
  };

  ST.advance = function (dt) {
    const c = AD.currentCase(), S = AD.state;
    if (c.status !== 'ready') return;
    const ph = c.phases;
    if (!ST.inside(S.p)) {
      // a timestamp carried over from another mode is kept: run on the normal clock
      // until the playhead reaches the case window (then the phase loop takes over)
      S.p += S.speed * 60 * dt;
      if (S.p >= AD.cfg.rangeEnd) S.p = ph[0].a;
      return;
    }
    const i = ST.phaseOf(S.p);
    S.p += ((ph[i].b - ph[i].a) / S.phaseSec) * dt;
    if (S.p >= ph[ph.length - 1].b) S.p = ph[0].a;      // loop
  };

  // per-phase numbers (recomputed when data filters or the case change).
  // 24 bins per phase whatever its real length (24 h → 1 h bins, 72 h → 3 h bins).
  // Bins inside a receiver gap are MISSING: no bar, excluded from "% of normal".
  ST.recompute = function () {
    const c = AD.currentCase(), D = AD.data;
    const focus = c.focusRoute ? D.apByCode[c.focusRoute] : null;
    ST.sums = c.phases.map(ph => {
      const w = (ph.b - ph.a) / 24;
      const bins = new Uint16Array(24), exp = new Float32Array(24), gapBin = new Uint8Array(24), others = new Set();
      let obs = 0, focusObs = 0;
      for (let i = 0; i < D.n; i++) {
        const t = D.tm[i]; if (t < ph.a || t >= ph.b || !D.passes(i)) continue;
        obs++; bins[Math.min(23, Math.floor((t - ph.a) / w))]++;
        if (D.other[i] >= 0) others.add(D.other[i]);
        if (focus && D.other[i] === focus.i) focusObs++;
      }
      let expTot = 0;
      for (let k = 0; k < 24; k++) {
        const a = ph.a + k * w, b = a + w;
        exp[k] = D.expected(a, b, D.ref.hour);
        gapBin[k] = D.gapOverlap(a, b) > w / 2 ? 1 : 0;
        if (!gapBin[k]) expTot += exp[k];
      }
      const obsCov = obs;   // movements inside gaps cannot exist in the data; obs is already "covered time only"
      const st = c.kind === 'derived' ? AD.schedule.count(AD.schedule.between(ph.a, ph.b)) : null;
      const div = D.div.filter(d => d.t1 >= ph.a && d.t1 < ph.b && D.passesDiv(d)).length;
      const focusExp = focus ? D.expected(ph.a, ph.b, D.ref.apHour, focus.i * 24) : 0;
      const lowCov = [Math.floor(ph.a / DAY), Math.floor((ph.b - 1) / DAY)].some(d => D.daily[d] && D.daily[d].coverage != null && D.daily[d].coverage < AD.cfg.lowCoverage);
      return { bins, exp, gapBin, gapMin: D.gapOverlap(ph.a, ph.b), obs: obsCov, expTot, routes: others.size, st, div, focusObs, focusExp, focus, lowCov };
    });
  };

  // ---------- timeline: three equal blocks ----------
  ST.draw = function (ctx, r, T) {
    ST.rect = r;
    const c = AD.currentCase(), S = AD.state, ready = c.status === 'ready';
    const k = AD.caseK(), gap = 14, bw = (r.w - gap * 2) / 3;
    const cur = ready ? (ST.inside(S.p) ? ST.phaseOf(S.p) : -1) : S.pendingPhase;
    ST.blocks = [];
    ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * k;
    c.phases.forEach((ph, i) => {
      const x = r.x + i * (bw + gap), active = i === cur;
      ST.blocks.push({ x, w: bw, ph });
      const top = r.y + 22, base = r.y + 66, h = base - top;
      // header
      ctx.font = `500 10px ${AD.FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = AD.col(active ? T.ink : T.muted);
      ctx.fillText(`0${i + 1}  ${ph.label.toUpperCase()}`, x, r.y + 8);
      const narrow = bw < 230;                      // phone width: drop the secondary text
      ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'right';
      if (!narrow) ctx.fillText(ph.dates || `${AD.time.short(ph.a)} → ${AD.time.short(ph.b)}`, x + bw, r.y + 8);
      ctx.textAlign = 'left'; if (!narrow) ctx.fillText(ph.note, x, r.y + 18);
      // frame
      ctx.strokeStyle = AD.col(active ? T.ink : T.faint, active ? 0.6 : 1); ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, top - 2.5, bw - 1, h + 3);
      if (!ready) {
        ctx.fillStyle = AD.col(active ? T.ink : T.muted); ctx.textAlign = 'center';
        ctx.fillText('no processed flight data', x + bw / 2, top + h / 2 + 3);
        return;
      }
      const sm = ST.sums[i], max = Math.max(1, ...ST.sums.flatMap(s => [...s.bins, ...s.exp]));
      const cw = (bw - 8) / 24;
      if (sm.lowCov) { ctx.fillStyle = AD.col(T.faint, 0.5); ctx.fillRect(x + 1, top - 2, bw - 2, h + 2); }
      // receiver gaps: hatched, no bar — missing data, not zero flights
      ctx.save(); ctx.beginPath(); ctx.rect(x + 1, top - 2, bw - 2, h + 2); ctx.clip();
      ctx.strokeStyle = AD.col(T.muted, 0.35); ctx.lineWidth = 1;
      for (let b = 0; b < 24; b++) if (sm.gapBin[b]) {
        const gx = x + 4 + b * cw;
        ctx.save(); ctx.beginPath(); ctx.rect(gx, top - 2, cw, h + 2); ctx.clip();
        ctx.beginPath(); for (let o = -h; o < cw; o += 4) { ctx.moveTo(gx + o, base); ctx.lineTo(gx + o + h, top - 2); } ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = AD.col(T.ink, active ? 0.8 : 0.45);
      for (let b = 0; b < 24; b++) { if (sm.gapBin[b]) continue; const hh = (sm.bins[b] / max) * (h - 4); ctx.fillRect(x + 4 + b * cw, base - hh, Math.max(1, cw - 1), hh); }
      ctx.strokeStyle = AD.col(T.dep, 0.8); ctx.beginPath();
      for (let b = 0; b < 24; b++) { const y = base - (sm.exp[b] / max) * (h - 4); b ? ctx.lineTo(x + 4 + b * cw, y) : ctx.moveTo(x + 4, y); ctx.lineTo(x + 4 + (b + 1) * cw, y); }
      ctx.stroke();
      // events inside the block
      for (const mk of AD.data.marks) {
        const t = mk.t;
        if (!isFinite(t) || t < ph.a || t >= ph.b) continue;
        const ex = x + 4 + ((t - ph.a) / (ph.b - ph.a)) * (bw - 8);
        ctx.strokeStyle = AD.col(T.alert, 0.8); ctx.setLineDash(mk.dash);
        ctx.beginPath(); ctx.moveTo(ex, top); ctx.lineTo(ex, base); ctx.stroke(); ctx.setLineDash([]);
      }
      // playhead
      if (active) {
        const px = x + 4 + ((S.p - ph.a) / (ph.b - ph.a)) * (bw - 8);
        ctx.strokeStyle = AD.col(T.ink); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, top - 4); ctx.lineTo(px, base + 2); ctx.stroke();
      }
      // summary — the comparison line
      ctx.font = `10px ${AD.FONT}`; ctx.textAlign = 'left';
      const pct = sm.expTot ? Math.round((sm.obs / sm.expTot) * 100) : 0;
      let sx = x;
      const part = (txt, col) => { ctx.fillStyle = AD.col(col); ctx.fillText(txt, sx, base + 29); sx += ctx.measureText(txt).width + 9; };
      const pctTxt = sm.expTot >= 5 ? `${pct} % of normal` : 'too few expected';
      ctx.fillStyle = AD.col(T.ink);
      ctx.fillText(narrow ? pctTxt : `${sm.obs.toLocaleString('en')} movements · ${pctTxt}${sm.gapMin ? ' (gaps excluded)' : ''}`, x, base + 16);
      if (c.kind === 'derived') {
        const full = `${sm.st.ontime} on time ${sm.st.delayed} delayed ${sm.st.diverted} diverted ${sm.st.cancelled} cancelled*`;
        const short = ctx.measureText(full).width + 27 > bw;
        if (narrow) { ctx.font = `9px ${AD.FONT}`; part(`${sm.st.cancelled} cxl*`, T.alert); part(`${sm.st.diverted} div`, T.diverted); }
        else {
          part(`${sm.st.ontime} ${short ? 'ok' : 'on time'}`, T.ink); part(`${sm.st.delayed} ${short ? 'late' : 'delayed'}`, T.delayed);
          part(`${sm.st.diverted} ${short ? 'div' : 'diverted'}`, T.diverted); part(`${sm.st.cancelled} ${short ? 'cxl*' : 'cancelled*'}`, T.alert);
        }
      } else if (c.kind === 'sample') {
        // observed sample: diversions seen in the data; cancellations do not exist in it
        part(`${sm.div} div* observed`, sm.div ? T.diverted : T.muted); part(narrow ? 'cxl n/a' : 'cancellations n/a', T.muted);
      } else if (sm.focus) {
        // airline case: the focus route (Tel Aviv) against its own normal
        part(`${sm.focus.iata} ${sm.focusObs} obs`, sm.focusObs < 0.3 * sm.focusExp ? T.alert : T.ink); part(`normal ${sm.focusExp.toFixed(0)}`, T.muted);
      }
      const flag = sm.gapMin ? 'receiver gap' : sm.lowCov ? (narrow ? 'low cov.' : 'low data coverage') : '';
      if (flag) { ctx.fillStyle = AD.col(T.muted); ctx.font = `9px ${AD.FONT}`; ctx.textAlign = 'right'; ctx.fillText(flag, x + bw - 4, top + 9); }
    });
    ctx.restore();
  };

  ST.hit = (x, y) => ST.rect && y >= ST.rect.y && y <= ST.rect.y + ST.rect.h && x >= ST.rect.x && x <= ST.rect.x + ST.rect.w;
  ST.scrub = function (x) {
    if (AD.currentCase().status !== 'ready') {        // pending case: choose the phase to compare
      ST.blocks.forEach((b, i) => { if (x >= b.x && x <= b.x + b.w) AD.state.pendingPhase = i; });
      return;
    }
    for (const b of ST.blocks) if (x >= b.x && x <= b.x + b.w) {
      const f = Math.min(0.999, Math.max(0, (x - b.x - 4) / (b.w - 8)));
      AD.state.p = b.ph.a + f * (b.ph.b - b.ph.a);
    }
  };

  // phase title on the canvas (large, thin), with the case identity
  ST.drawTitle = function (ctx, a, T) {
    const c = AD.currentCase(), S = AD.state, k = AD.caseK();
    ctx.save(); ctx.globalAlpha = k;
    ctx.textAlign = 'left';
    if (c.status === 'ready' && !ST.inside(S.p)) {
      ctx.font = `300 28px Inter, system-ui, sans-serif`; ctx.fillStyle = AD.col(T.muted);
      ctx.fillText('Outside the event window', a.x, a.y + 34);
      ctx.font = `11px ${AD.FONT}`;
      ctx.fillText(`${c.geo.focus.label} · ${AD.time.dayLabel(S.p)} · ${AD.time.hm(S.p)} UTC`, a.x, a.y + 52);
    } else if (c.status === 'ready') {
      const i = ST.phaseOf(S.p), ph = c.phases[i];
      if (i !== ST.lastPhase) { ST.lastPhase = i; ST.phaseChangedAt = performance.now(); }
      const fresh = Math.max(0, 1 - (performance.now() - ST.phaseChangedAt) / 2500);
      ctx.fillStyle = AD.col(i === 1 ? T.alert : T.ink, 0.75 + 0.25 * fresh);
      ctx.font = `300 28px Inter, system-ui, sans-serif`;
      ctx.fillText(`0${i + 1} — ${ph.label}`, a.x, a.y + 34);
      ctx.font = `11px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted);
      ctx.fillText(`${c.geo.focus.label} · ${AD.time.dayLabel(S.p)} · ${AD.time.hm(S.p)} UTC · ${ph.note}`, a.x, a.y + 52);
    } else {
      // the selected phase is kept when switching cases, so the comparison stays aligned
      const i = S.pendingPhase, ph = c.phases[i];
      ctx.font = `300 28px Inter, system-ui, sans-serif`; ctx.fillStyle = AD.col(i === 1 ? T.alert : T.ink, 0.75);
      ctx.fillText(`0${i + 1} — ${ph.label}`, a.x, a.y + 34);
      ctx.font = `11px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted);
      ctx.fillText(`${c.geo.focus.label} · ${ph.dates} · no processed flight data`, a.x, a.y + 52);
    }
    ctx.restore();
  };

  return ST;
})();
