'use strict';
// DERIVED FLIGHT STATUS — the source has no schedule, cancellations or delays.
// Status is derived transparently from each callsign's own regular pattern:
//
//  • Regular flight = an airline-format callsign seen at LHR in the same direction
//    on ≥ 6 of the 7 reference days (14–20 Mar). Its usual time = circular median
//    of its movement time-of-day (departure = first ADS-B contact, arrival = last).
//  • For every day, each regular flight is EXPECTED at its usual time E.
//  • Matched = the same callsign + direction seen at LHR within E −2 h … E +10 h.
//      ON TIME  : seen no later than E + 30 min
//      DELAYED  : seen more than 30 min after E
//  • Not matched at LHR:
//      DIVERTED : the callsign landed elsewhere (inferred diversions, 21 Mar only)
//      CANCELLED*: not seen at all — "not observed"; it may also be a data gap.

AD.schedule = (() => {
  const SC = { MIN_DAYS: 6, LATE: 30, BEFORE: 120, AFTER: 600 };

  function circMedian(v) {
    const s = [...v].sort((a, b) => a - b);
    if (s[s.length - 1] - s[0] > 720) for (let i = 0; i < s.length; i++) if (s[i] < 720) s[i] += 1440;
    s.sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)]) % 1440;
  }

  SC.build = function () {
    const D = AD.data, [r0, r1] = AD.cfg.refPeriods.before;
    const groups = new Map();
    for (let i = 0; i < D.n; i++) {
      if (!D.airlineCs[i] || D.heli[i] || D.day[i] < r0 || D.day[i] > r1) continue;
      const key = D.cs[i] + '|' + D.dir[i];
      let g = groups.get(key);
      if (!g) groups.set(key, g = { cs: D.cs[i], dir: D.dir[i], days: new Set(), tods: [], others: new Map() });
      g.days.add(D.day[i]); g.tods.push(((D.tm[i] % DAY) + DAY) % DAY);
      g.others.set(D.other[i], (g.others.get(D.other[i]) || 0) + 1);
    }
    SC.regular = [];
    for (const g of groups.values()) {
      if (g.days.size < SC.MIN_DAYS) continue;
      const other = [...g.others.entries()].sort((a, b) => b[1] - a[1])[0][0];
      SC.regular.push({ cs: g.cs, dir: g.dir, tod: circMedian(g.tods), other });
    }

    // observed flights at the airport, by callsign
    const byCs = new Map();
    for (let i = 0; i < D.n; i++) { if (!D.cs[i]) continue; (byCs.get(D.cs[i]) || byCs.set(D.cs[i], []).get(D.cs[i])).push(i); }

    let dataEnd = 0; for (let i = 0; i < D.n; i++) dataEnd = Math.max(dataEnd, D.tm[i]);   // last movement in the file
    const rows = [];
    for (let d = Math.floor(AD.cfg.rangeStart / DAY) - 1; d <= Math.floor(AD.cfg.rangeEnd / DAY); d++) for (const r of SC.regular) {
      const E = d * DAY + r.tod;
      if (E < AD.cfg.rangeStart - DAY || E > dataEnd - SC.AFTER) continue;   // need the full matching window
      rows.push({ E, cs: r.cs, dir: r.dir, other: r.other });
    }
    rows.sort((a, b) => a.E - b.E);
    const used = new Uint8Array(D.n), divUsed = new Set();
    for (const r of rows) {
      let best = -1, bd = Infinity;
      for (const i of byCs.get(r.cs) || []) {
        if (used[i] || D.dir[i] !== r.dir) continue;
        const dt = D.tm[i] - r.E;
        if (dt < -SC.BEFORE || dt > SC.AFTER) continue;
        if (Math.abs(dt) < bd) { bd = Math.abs(dt); best = i; }
      }
      if (best >= 0) {
        used[best] = 1; r.actual = D.tm[best]; r.delay = D.tm[best] - r.E;
        r.status = r.delay > SC.LATE ? 'delayed' : 'ontime';
        if (D.other[best] >= 0) r.other = D.other[best];
        continue;
      }
      const dv = r.dir === 1 && D.div.find(x => !divUsed.has(x) && x.cs === r.cs && x.t1 >= r.E - SC.BEFORE && x.t1 <= r.E + SC.AFTER);
      if (dv) { divUsed.add(dv); r.status = 'diverted'; r.divAp = dv.ap; r.actual = dv.t1; continue; }
      r.status = 'cancelled';
    }
    AD.data.sched = rows;            // stored with the dataset (cases of kind 'derived')
  };

  SC.passes = r => AD.state.dir === 'all' || (AD.state.dir === 'dep') === (r.dir === 0);

  // rows whose usual time falls in [a, b)
  SC.between = function (a, b) {
    const R = AD.data.sched || []; let lo = 0, hi = R.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (R[m].E < a) lo = m + 1; else hi = m; }
    const out = [];
    for (let i = lo; i < R.length && R[i].E < b; i++) if (SC.passes(R[i])) out.push(R[i]);
    return out;
  };

  SC.count = rows => {
    const c = { ontime: 0, delayed: 0, diverted: 0, cancelled: 0, total: rows.length };
    for (const r of rows) c[r.status]++;
    return c;
  };

  return SC;
})();
