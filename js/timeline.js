'use strict';
// TIMELINE — hourly movements at LHR (bars) against the reference
// hour-of-day profile (thin line). Event markers, period bands,
// low-coverage days and the playhead. Click / drag to scrub.

AD.timeline = (() => {
  const TL = { rect: null };

  TL.xOf = t => TL.rect.x + (t - AD.cfg.rangeStart) / (AD.cfg.rangeEnd - AD.cfg.rangeStart) * TL.rect.w;
  TL.tOf = x => AD.cfg.rangeStart + (x - TL.rect.x) / TL.rect.w * (AD.cfg.rangeEnd - AD.cfg.rangeStart);

  TL.draw = function (ctx, r, T) {
    TL.rect = r;
    const D = AD.data, S = AD.state, cfg = AD.cfg;
    const top = r.y + 30, base = r.y + r.h - 20, barH = base - top;
    const H = D.hours.length, bw = r.w / H;
    let max = 0; for (const v of D.hours) max = Math.max(max, v);
    for (const v of D.ref.hour) max = Math.max(max, v);
    max = Math.max(max, 1);

    ctx.font = `10px ${AD.FONT}`; ctx.textBaseline = 'alphabetic';

    // low-coverage + partial days (data limitation, shown, not hidden)
    for (let d = 13; d < D.days.length; d++) {
      const cov = D.daily[d].coverage, x0 = TL.xOf(d * DAY), x1 = TL.xOf(Math.min((d + 1) * DAY, cfg.rangeEnd));
      if (cov < cfg.lowCoverage) {
        ctx.fillStyle = AD.col(T.faint, 0.75); ctx.fillRect(x0, top - 2, x1 - x0, barH + 2);
      }
    }

    // period bands
    ctx.textAlign = 'left';
    for (const b of cfg.periodBands) {
      const x0 = TL.xOf(b.a) + 1, x1 = TL.xOf(b.b) - 1;
      ctx.strokeStyle = AD.col(T.muted, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, r.y + 24); ctx.lineTo(x1, r.y + 24); ctx.stroke();
      ctx.fillStyle = AD.col(b.key === 'during' ? T.alert : T.muted, 1);
      ctx.textAlign = b.key === 'during' ? 'right' : 'left';
      ctx.fillText(b.label, b.key === 'during' ? x1 : x0, r.y + 20);
    }

    // hourly bars
    ctx.fillStyle = AD.col(T.ink, 0.75);
    for (let h = 0; h < H; h++) {
      const v = D.hours[h]; if (!v) continue;
      const hh = v / max * barH;
      ctx.fillRect(r.x + h * bw, base - hh, Math.max(1, bw - 0.6), hh);
    }
    // expected (reference hour-of-day mean)
    ctx.strokeStyle = AD.col(T.dep, 0.9); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let h = 0; h < H; h++) {
      const hod = (h + 0) % 24, y = base - D.ref.hour[hod] / max * barH;
      const x = r.x + h * bw;
      h === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); ctx.lineTo(x + bw, y);
    }
    ctx.stroke();

    // baseline + day ticks
    ctx.strokeStyle = AD.col(T.muted, 0.6);
    ctx.beginPath(); ctx.moveTo(r.x, base + 0.5); ctx.lineTo(r.x + r.w, base + 0.5); ctx.stroke();
    ctx.textAlign = 'center';
    for (let d = 13; d <= 30; d++) {
      const x = TL.xOf(d * DAY);
      ctx.strokeStyle = AD.col(T.muted, 0.6);
      ctx.beginPath(); ctx.moveTo(x + 0.5, base); ctx.lineTo(x + 0.5, base + 4); ctx.stroke();
      const lx = TL.xOf(d * DAY + DAY / 2);
      if (lx < r.x + r.w) {
        ctx.fillStyle = d === 20 ? AD.col(T.alert) : AD.col(T.muted);
        ctx.fillText((d === 13 ? 'MAR ' : '') + (d + 1), lx, base + 15);
      }
    }

    // events — fire (news-verified) and first airline movement after (from data)
    const mark = (t, label, dash, align) => {
      const x = Math.round(TL.xOf(t)) + 0.5;
      ctx.strokeStyle = AD.col(T.alert); ctx.setLineDash(dash); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, r.y + 26); ctx.lineTo(x, base); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'left';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = AD.col(T.bg, 0.85); ctx.fillRect(x + 3, align - 9, tw + 4, 12);
      ctx.fillStyle = AD.col(T.alert); ctx.fillText(label, x + 5, align);
    };
    mark(D.fire, 'FIRE 23:21', [], top + 10);
    if (isFinite(D.firstAirline)) mark(D.firstAirline, 'FIRST AIRLINE ' + AD.time.hm(D.firstAirline), [2, 3], top + 24);

    // playhead
    const px = Math.round(TL.xOf(S.p)) + 0.5;
    ctx.strokeStyle = AD.col(T.ink); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, r.y + 27); ctx.lineTo(px, base + 4); ctx.stroke();
    ctx.fillStyle = AD.col(T.ink);
    ctx.beginPath(); ctx.moveTo(px - 4, r.y + 26); ctx.lineTo(px + 4, r.y + 26); ctx.lineTo(px, r.y + 31); ctx.fill();

    // legend
    ctx.textAlign = 'left'; let lx = r.x;
    const item = (txt, c) => { ctx.fillStyle = AD.col(c); ctx.fillText(txt, lx, r.y + 6); lx += ctx.measureText(txt).width + 16; };
    const narrow = r.w < 560;
    item(narrow ? '▮ per hour' : '▮ movements per hour at LHR', T.ink);
    item(narrow ? '— ref. mean' : `— ref. mean ${AD.cfg.refLabels[S.ref]}, same hour`, T.dep);
    item(narrow ? '▨ low cov.' : '▨ low coverage / partial day', T.muted);
  };

  TL.hit = (x, y) => TL.rect && x >= TL.rect.x - 6 && x <= TL.rect.x + TL.rect.w + 6 && y >= TL.rect.y && y <= TL.rect.y + TL.rect.h;
  TL.scrub = x => { AD.state.p = Math.max(AD.cfg.rangeStart, Math.min(AD.cfg.rangeEnd - 1, TL.tOf(x))); };

  return TL;
})();
