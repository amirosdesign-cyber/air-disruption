'use strict';
// FOCUS ROUTE — for an airline case (flydubai) the story is one route (DXB ↔ TLV),
// not the whole airport. Shared state for all four views, derived only from
// observed movements:
//   last   = time of the last observed movement on the route before the playhead
//   maxGap = longest gap between consecutive movements in the reference week
//   quiet  = no movement for longer than maxGap → "no flights observed" (red)
// No status is assigned to individual flights; this is an observation about the route.

AD.route = (() => {
  const RT = {};
  let cacheD = null, times = null, maxGap = 0;

  function prep(D, A) {
    times = [];
    for (let i = 0; i < D.n; i++) if (D.other[i] === A.i) times.push(D.tm[i]);
    times.sort((a, b) => a - b);
    const [r0, r1] = AD.cfg.refPeriods.before;
    maxGap = 0;
    for (let k = 1; k < times.length; k++) {
      if (times[k - 1] >= r0 * DAY && times[k] < (r1 + 1) * DAY) maxGap = Math.max(maxGap, times[k] - times[k - 1]);
    }
    cacheD = D;
  }

  RT.get = function (p = AD.state.p) {
    const c = AD.currentCase(), D = AD.data;
    if (!c || !c.focusRoute || c.status !== 'ready' || !D || !D.apByCode) return null;
    const A = D.apByCode[c.focusRoute]; if (!A) return null;
    if (cacheD !== D) prep(D, A);
    let lo = 0, hi = times.length;                       // last movement ≤ p
    while (lo < hi) { const m = (lo + hi) >> 1; times[m] <= p ? lo = m + 1 : hi = m; }
    const last = lo > 0 ? times[lo - 1] : null;
    let obs24 = 0; for (let k = lo - 1; k >= 0 && times[k] > p - DAY; k--) obs24++;
    const exp24 = D.expected(p - DAY, p, D.ref.apHour, A.i * 24);
    const since = last == null ? Infinity : p - last;
    const quiet = since > maxGap;
    // 0 → 1 over the first 2 h after the gap exceeds normal: a visible, not abrupt, change
    const k = quiet ? Math.min(1, (since - maxGap) / 120) : 0;
    return { A, hub: D.hub, last, since, maxGap, obs24, exp24, quiet, k };
  };

  RT.fmtH = m => (m >= 2 * DAY ? `${(m / DAY).toFixed(1)} days` : `${Math.round(m / 60)} h`);
  // red state wording, shared by all views: an observation against the normal interval, not an official time
  RT.quietText = R => `no flight observed for ${RT.fmtH(R.since)} · normal max ${RT.fmtH(R.maxGap)}`;

  return RT;
})();
