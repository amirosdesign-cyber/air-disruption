'use strict';
// FLIGHT BOARD — a curated, rolling departures/arrivals board.
// Rows = regular flights whose usual time falls in the last 90 min before the
// playhead. When space is short, non-normal statuses are kept first, then the
// most recent on-time flights. Status is DERIVED (see schedule.js) and labelled so.

AD.board = (() => {
  const B = {};
  // observed: on time / delayed (flight seen) · inferred (*): cancelled = not seen, diverted = landed elsewhere
  const LABEL = { ontime: 'ON TIME', delayed: 'DELAYED', diverted: 'DIVERTED*', cancelled: 'CANCELLED*' };
  const MAX_ROWS = 10;

  function wrap(ctx, text, x, y, w, lh) {
    let line = '';
    for (const word of text.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
    }
    if (line) ctx.fillText(line, x, y);
    return y + lh;
  }

  B.draw = function (ctx, r, T) {
    const c = AD.currentCase(), S = AD.state, k = AD.caseK();
    const colOf = { ontime: T.muted, delayed: T.delayed, diverted: T.diverted, cancelled: T.alert };   // colour only for exceptions
    ctx.save(); ctx.globalAlpha = k;
    ctx.fillStyle = AD.col(T.bg, 0.82); ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = AD.col(T.faint); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x + 0.5, r.y); ctx.lineTo(r.x + 0.5, r.y + r.h); ctx.stroke();      // one subtle rule, no box
    const x = r.x + 14, w = r.w - 18;
    ctx.textAlign = 'left'; ctx.font = `500 10px ${AD.FONT}`; ctx.fillStyle = AD.col(T.ink);
    ctx.fillText(`FLIGHT BOARD · ${c.geo.focus.label}`, x, r.y + 18);
    if (c.status !== 'ready') {
      ctx.font = `10px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted);
      wrap(ctx, 'No processed flight data for this event yet.', x, r.y + 40, w, 14);
      ctx.restore(); return;
    }
    ctx.textAlign = 'right'; ctx.font = `10px ${AD.FONT}`;
    ctx.fillText(`${AD.time.hm(S.p)} UTC`, x + w, r.y + 18);
    if (c.kind !== 'derived') { observed(ctx, r, T, c, x, w, k); ctx.restore(); return; }

    // columns
    const yH = r.y + 42, cols = [x, x + 44, x + 112, x + w];
    ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'left'; ctx.font = `9px ${AD.FONT}`;
    ctx.fillText('USUAL', cols[0], yH); ctx.fillText('FLIGHT', cols[1], yH); ctx.fillText('TO / FROM', cols[2], yH);
    ctx.textAlign = 'right'; ctx.fillText('STATUS', cols[3], yH);
    ctx.strokeStyle = AD.col(T.faint); ctx.beginPath(); ctx.moveTo(x, yH + 6); ctx.lineTo(x + w, yH + 6); ctx.stroke();

    // curated rows
    const footerH = 48, rowH = 18, maxRows = Math.min(MAX_ROWS, Math.max(1, Math.floor((r.h - (yH - r.y) - 14 - footerH) / rowH)));
    const pool = AD.schedule.between(S.p - 60, S.p + 1).reverse();      // the hour around the playhead
    const odd = pool.filter(q => q.status !== 'ontime'), ok = pool.filter(q => q.status === 'ontime');
    const pick = new Set(odd.slice(0, maxRows));
    for (const q of ok) { if (pick.size >= maxRows) break; pick.add(q); }
    const rows = pool.filter(q => pick.has(q));
    let y = yH + 22;
    ctx.font = `10px ${AD.FONT}`;
    for (const q of rows) {
      const fade = Math.min(1, (S.p - q.E) / 8 + 0.15);            // a new row eases in
      const col = colOf[q.status];
      const D = AD.data, ap = q.other >= 0 ? D.ap[q.other].iata : '···';
      ctx.globalAlpha = k * fade;
      ctx.textAlign = 'left';
      ctx.fillStyle = AD.col(T.muted); ctx.fillText(AD.time.hm(q.E), cols[0], y);
      ctx.fillStyle = AD.col(q.status === 'ontime' ? T.muted : T.ink); ctx.fillText(q.cs, cols[1], y);
      ctx.fillStyle = AD.col(T.muted); ctx.fillText(`${q.dir === 0 ? '→' : '←'} ${ap}`, cols[2], y);
      ctx.textAlign = 'right'; ctx.fillStyle = AD.col(col);
      let st = LABEL[q.status];
      if (q.status === 'delayed') st += ` +${Math.round(q.delay)}′`;
      if (q.status === 'diverted' && q.divAp) st = `DIVERTED ${q.divAp.iata}`;
      ctx.fillText(st, cols[3], y);
      if (q.status !== 'ontime') { ctx.fillRect(x - 7, y - 7, 2, 8); }
      y += rowH;
    }
    ctx.globalAlpha = k;
    if (!rows.length) { ctx.textAlign = 'left'; ctx.fillStyle = AD.col(T.muted); ctx.fillText('no regular flights due in the last hour', x, y); }

    // short footnote; the full method is in the info sheet
    const fy = Math.min(r.y + r.h - 22, yH + 22 + MAX_ROWS * rowH + 6);      // right under the rows
    ctx.textAlign = 'left'; ctx.font = `9px ${AD.FONT}`; ctx.fillStyle = AD.col(T.muted);
    ctx.strokeStyle = AD.col(T.faint); ctx.beginPath(); ctx.moveTo(x, fy - 12); ctx.lineTo(x + w, fy - 12); ctx.stroke();
    ctx.fillText(`USUAL = typical time of this flight (${AD.cfg.refLabels.before})`, x, fy);
    ctx.fillText('* inferred from ADS-B, not official status', x, fy + 13);
    const day = AD.data.daily[Math.floor(S.p / DAY)];
    if (day && day.coverage != null && day.coverage < AD.cfg.lowCoverage) { ctx.fillStyle = AD.col(T.delayed); ctx.fillText('low data coverage on this day', x, fy + 26); }
    ctx.restore();
  };

  // OBSERVED board (cases without a schedule): only movements seen in the data, newest first.
  // No delays or cancellations exist here. DIVERTED* = inferred (route lookup → hub, track ended elsewhere).
  function observed(ctx, r, T, c, x, w, k) {
    const D = AD.data, S = AD.state, p = S.p;
    const yH = r.y + 42, cols = [x, x + 44, x + 120, x + w];
    ctx.fillStyle = AD.col(T.muted); ctx.textAlign = 'left'; ctx.font = `9px ${AD.FONT}`;
    ctx.fillText('SEEN', cols[0], yH); ctx.fillText('FLIGHT', cols[1], yH); ctx.fillText('TO / FROM', cols[2], yH);
    ctx.textAlign = 'right'; ctx.fillText('OBSERVED', cols[3], yH);
    ctx.strokeStyle = AD.col(T.faint); ctx.beginPath(); ctx.moveTo(x, yH + 6); ctx.lineTo(x + w, yH + 6); ctx.stroke();
    const rowH = 18, maxRows = Math.min(MAX_ROWS, Math.max(1, Math.floor((r.h - (yH - r.y) - 14 - 48) / rowH)));
    const focus = c.focusRoute ? D.apByCode[c.focusRoute] : null;
    // pool: movements in the last hour + inferred diversions landing in it
    const pool = [];
    D.eachActive(p - 60, p, i => { const t = D.tm[i]; if (t > p - 60 && t <= p) pool.push({ t, cs: D.cs[i], dir: D.dir[i], o: D.other[i], inf: D.inf[i] }); });
    for (const d of D.div) if (d.t1 > p - 60 && d.t1 <= p && D.passesDiv(d)) pool.push({ t: d.t1, cs: d.cs, dir: 1, div: d.ap });
    pool.sort((a, b) => b.t - a.t);
    // exceptions and the focus route first, then the most recent
    const key = q => (q.div ? 2 : 0) + (focus && q.o === focus.i ? 1 : 0);
    const pick = new Set(pool.filter(q => key(q) > 0).slice(0, maxRows));
    for (const q of pool) { if (pick.size >= maxRows) break; pick.add(q); }
    const rows = pool.filter(q => pick.has(q));
    let y = yH + 22;
    ctx.font = `10px ${AD.FONT}`;
    const gap = D.inGap(p);
    for (const q of rows) {
      const fade = Math.min(1, (p - q.t) / 8 + 0.15), hot = focus && q.o === focus.i;
      ctx.globalAlpha = k * fade; ctx.textAlign = 'left';
      ctx.fillStyle = AD.col(T.muted); ctx.fillText(AD.time.hm(q.t), cols[0], y);
      ctx.fillStyle = AD.col(q.div || hot ? T.ink : T.muted); ctx.fillText(q.cs || '–', cols[1], y);
      const ap = q.o >= 0 ? D.ap[q.o].iata + (q.inf & 1 ? '*' : '') : '···';   // bit 1: other airport inferred
      ctx.fillStyle = AD.col(hot ? T.ink : T.muted); ctx.fillText(q.div ? '→ ' + (D.hub.iata) + '*' : `${q.inf & 2 ? '*' : ''}${q.dir === 0 ? '→' : '←'} ${ap}`, cols[2], y);   // leading * = hub end inferred
      ctx.textAlign = 'right';
      if (q.div) { ctx.fillStyle = AD.col(T.diverted); ctx.fillText(`DIVERTED* ${q.div.iata}`, cols[3], y); ctx.fillRect(x - 7, y - 7, 2, 8); }
      else { ctx.fillStyle = AD.col(T.muted); ctx.fillText(q.dir === 0 ? 'DEPARTED' : 'LANDED', cols[3], y); }
      if (hot) { ctx.fillStyle = AD.col(T.ink); ctx.fillRect(x - 7, y - 7, 2, 8); }
      y += rowH;
    }
    ctx.globalAlpha = k; ctx.textAlign = 'left'; ctx.fillStyle = AD.col(T.muted);
    if (!rows.length) ctx.fillText(gap ? 'receiver gap · no data for this hour' : 'no movements observed in the last hour', x, y);
    const fy = Math.min(r.y + r.h - 22, yH + 22 + MAX_ROWS * rowH + 6);
    ctx.font = `9px ${AD.FONT}`;
    ctx.strokeStyle = AD.col(T.faint); ctx.beginPath(); ctx.moveTo(x, fy - 12); ctx.lineTo(x + w, fy - 12); ctx.stroke();
    ctx.fillText('observed ADS-B movements only · no schedule:', x, fy);
    ctx.fillText('delays and cancellations unavailable', x, fy + 13);
    ctx.fillText(c.kind === 'airline' ? '*→ / *← = Dubai end inferred, not observed' : '* inferred (route lookup), not observed', x, fy + 26);
  }

  return B;
})();
