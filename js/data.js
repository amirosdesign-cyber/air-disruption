'use strict';
// DATA LAYER — loads the JSON, builds typed arrays, applies data filters,
// and computes reference statistics. Nothing here draws.

AD.makeData = () => {
  const D = {};
  const AIRLINE_CS = /^[A-Z]{3}[0-9]/;   // ICAO airline callsign format, e.g. BAW35JG

  D.load = async function (url) {
    const res = await fetch(url, { cache: 'no-cache' });   // revalidate: datasets are rebuilt during development
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    const raw = await res.json();
    D.meta = raw.meta; D.events = raw.events; D.days = raw.days; D.daily = raw.daily;

    const f = raw.flights;
    const n = D.n = f.t0.length;
    D.t0 = Int32Array.from(f.t0); D.t1 = Int32Array.from(f.t1);
    D.dir = Uint8Array.from(f.dir); D.other = Int16Array.from(f.other);
    D.day = Uint8Array.from(f.day); D.op = Int16Array.from(f.op); D.heli = Uint8Array.from(f.heli);
    D.cs = f.cs;
    D.inf = f.inf ? Uint8Array.from(f.inf) : new Uint8Array(n);   // 1 = other airport INFERRED (callsign route lookup)
    D.gaps = raw.gaps || [];                                       // receiver gaps [a, b): missing data, not zero flights
    D.official = raw.official || null;
    D.airlineCs = Uint8Array.from(f.cs, c => (AIRLINE_CS.test(c) ? 1 : 0));
    // movement time at Heathrow: departure ≈ first ADS-B contact, arrival ≈ last
    D.tm = new Int32Array(n);
    D.maxDur = 0;
    for (let i = 0; i < n; i++) {
      D.tm[i] = D.dir[i] === 0 ? D.t0[i] : D.t1[i];
      D.maxDur = Math.max(D.maxDur, D.t1[i] - D.t0[i]);
    }

    // airports (+ airports that appear only as diversion landings)
    D.ap = []; D.apByCode = {};
    const addAp = code => {
      const a = raw.airportInfo[code];
      if (!a || D.apByCode[code]) return;
      const A = { i: D.ap.length, code, lat: a[0], lon: a[1], name: a[2], iata: a[3] || code, country: a[4] };
      D.ap.push(A); D.apByCode[code] = A;
    };
    raw.airports.forEach(addAp);
    // file index → D.ap index (they differ when an airport has no coordinates; its flights become "other end unknown")
    const remap = Int16Array.from(raw.airports, c => (D.apByCode[c] ? D.apByCode[c].i : -1));
    for (let i = 0; i < n; i++) if (D.other[i] >= 0) D.other[i] = remap[D.other[i]];
    Object.keys(raw.diversions.landedElsewhere).forEach(c => c !== 'UNKNOWN' && addAp(c));
    D.hub = D.apByCode[D.meta.airport];
    AD.geo.setCenter(D.hub.lat, D.hub.lon);
    for (const A of D.ap) Object.assign(A, AD.geo.project(A.lat, A.lon), { bearing: AD.geo.bearing(A.lat, A.lon) });

    // inferred diversions (event day): flights that usually land at LHR, landed elsewhere
    D.divMeta = raw.diversions;
    D.div = raw.diversions.flights.map(d => ({
      cs: d.cs, t0: d.t0, t1: d.t1,
      ap: d.ades ? D.apByCode[d.ades] || null : null,
      from: d.adep ? D.apByCode[d.adep] || null : null,
      airline: AIRLINE_CS.test(d.cs),
    }));
    D.divAirports = new Set(D.div.filter(d => d.ap).map(d => d.ap.i));

    // events (timeline markers) — defined per case; some are read from the data
    D.marks = (AD.currentCase().marks || (() => []))(D);

    // stable, unfiltered baseline per airport (used for layouts so they don't jump)
    D.apBase0 = new Float32Array(D.ap.length);
    const [b0, b1] = AD.cfg.refPeriods.before, nb = b1 - b0 + 1;
    for (let i = 0; i < n; i++) if (D.day[i] >= b0 && D.day[i] <= b1 && D.other[i] >= 0) D.apBase0[D.other[i]] += 1 / nb;
  };

  function minutesOf(iso) { return (Date.parse(iso) - AD.cfg.originMs) / 60000; }
  D.minutesOf = minutesOf;

  // minutes of [a, b) that fall inside receiver gaps
  D.gapOverlap = function (a, b) {
    let s = 0;
    for (const [g0, g1] of D.gaps) s += Math.max(0, Math.min(b, g1) - Math.max(a, g0));
    return s;
  };
  D.inGap = t => D.gaps.some(([g0, g1]) => t >= g0 && t < g1);

  // ---- data filters (DATA selection, not appearance) ----
  D.passes = i => {
    const S = AD.state;
    if (S.dir === 'dep' && D.dir[i] !== 0) return false;
    if (S.dir === 'arr' && D.dir[i] !== 1) return false;
    if (S.airline && (!D.airlineCs[i] || D.heli[i])) return false;
    return true;
  };
  D.passesDiv = d => AD.state.dir !== 'dep' && (!AD.state.airline || d.airline);

  // flights overlapping [a, b] that pass the filter (flights are sorted by t0)
  D.eachActive = function (a, b, fn) {
    let lo = 0, hi = D.n, target = a - D.maxDur;
    while (lo < hi) { const m = (lo + hi) >> 1; if (D.t0[m] < target) lo = m + 1; else hi = m; }
    for (let i = lo; i < D.n && D.t0[i] <= b; i++) if (D.t1[i] >= a && D.passes(i)) fn(i);
  };

  // ---- per-filter aggregates: daily stats, hourly series, reference ----
  D.recompute = function () {
    const S = AD.state, cfg = AD.cfg, na = D.ap.length;
    D.dayStats = D.days.map(() => ({ dep: 0, arr: 0, total: 0, unknown: 0, routes: new Set() }));
    const H = Math.ceil((cfg.rangeEnd - cfg.rangeStart) / 60);
    D.hours = new Uint16Array(H);
    const [r0, r1] = cfg.refPeriods[S.ref], nr = r1 - r0 + 1;
    const ref = D.ref = { total: 0, routes: 0, unknown: 0, hour: new Float32Array(24), apHour: new Float32Array(na * 24), unkHour: new Float32Array(24), ap: new Float32Array(na) };

    for (let i = 0; i < D.n; i++) {
      if (!D.passes(i)) continue;
      const ds = D.dayStats[D.day[i]], o = D.other[i];
      ds.total++; D.dir[i] ? ds.arr++ : ds.dep++;
      if (o < 0) ds.unknown++; else ds.routes.add(o);
      const h = Math.floor((D.tm[i] - cfg.rangeStart) / 60);
      if (h >= 0 && h < H) D.hours[h]++;
      if (D.day[i] >= r0 && D.day[i] <= r1) {
        const hod = Math.floor((D.tm[i] % DAY) / 60);
        ref.hour[hod] += 1 / nr;
        if (o >= 0) { ref.apHour[o * 24 + hod] += 1 / nr; ref.ap[o] += 1 / nr; } else ref.unkHour[hod] += 1 / nr;
      }
    }
    D.dayStats.forEach(ds => { ds.nRoutes = ds.routes.size; delete ds.routes; });
    for (let d = r0; d <= r1; d++) {
      const ds = D.dayStats[d];
      ref.total += ds.total / nr; ref.routes += ds.nRoutes / nr; ref.unknown += ds.unknown / nr;
    }
  };

  // expected count in window (a, b] from the reference hour-of-day profile
  D.expected = function (a, b, profile, offset = 0) {
    let sum = 0;
    for (let t = a; t < b;) {
      const hod = Math.floor((((t % DAY) + DAY) % DAY) / 60);
      const next = Math.min(b, Math.floor(t / 60) * 60 + 60);
      sum += profile[offset + hod] * (next - t) / 60;
      t = next;
    }
    return sum;
  };

  // movements in the 24 h ending at p (by movement time), from the hourly series
  D.last24 = function (p) {
    const h = Math.floor((p - AD.cfg.rangeStart) / 60);
    let s = 0;
    for (let k = Math.max(0, h - 23); k <= Math.min(h, D.hours.length - 1); k++) s += D.hours[k];
    return s;
  };

  return D;
};
AD.data = AD.makeData();   // replaced per case by AD.useCase
