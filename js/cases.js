'use strict';
// CASES — one entry per event. Only cases with `status: 'ready'` have processed
// flight data. The others carry verified geography + dates so the interface can
// show them, but no flight data is invented for them.
//
// Phase times are minutes since the case's time origin (Heathrow: 2025-03-01 00:00 UTC).

(() => {
  const min = (iso, origin) => (Date.parse(iso) - Date.parse(origin)) / 60000;

  // ---- Heathrow 2025 ----
  const LHR_ORIGIN = '2025-03-01T00:00:00Z';
  const FIRE = min('2025-03-20T23:21:00Z', LHR_ORIGIN);
  // ---- Frankfurt 2025 (same OPDI file and time origin as Heathrow) ----
  // Phases follow Frankfurt LOCAL calendar days (CET = UTC+1). No source gives the exact minute the
  // strike began (reports: stoppages from about 02:00–03:00 local), so no exact start is claimed.
  const FRA_DAY = min('2025-03-09T23:00:00Z', LHR_ORIGIN);    // Mon 10 Mar 00:00 local
  // ---- Dubai 2024 (archived: research and data kept, not in the event selector) ----
  const DXB_ORIGIN = '2024-04-01T00:00:00Z';
  // ---- flydubai 2026 ----
  const FZ_ORIGIN = '2026-09-01T00:00:00Z';
  const FZ_DEP = min('2026-09-30T03:05:00Z', FZ_ORIGIN);   // reported departure of FZ1073 (06:05 Saudi time)

  AD.cases = [
    {
      id: 'fra2025', short: 'Frankfurt 2025', status: 'ready', kind: 'derived',
      title: 'Frankfurt Airport', subtitle: 'Nationwide airport workers\' strike', dates: '10 Mar 2025',
      dataUrl: 'data/frankfurt_2025-03.json',
      desc: 'A nationwide airport workers\' strike brought flight operations at Frankfurt to a near standstill. More than 1,000 scheduled movements were cancelled. Flight activity largely recovered the following day.',
      official: { label: 'Official', value: '1,054 / 1,116', sub: 'scheduled movements cancelled on 10 Mar (dpa, citing airport traffic control) · whole day · not in the flight data' },
      cfg: {
        originMs: Date.parse(LHR_ORIGIN), dataUrl: 'data/frankfurt_2025-03.json',
        rangeStart: 1 * DAY, rangeEnd: 18 * DAY, maxKm: 4000, mapKm: 1e9, lowCoverage: 0.92,
        refPeriods: { before: [1, 7], after: [10, 16] }, refLabels: { before: '2–8 Mar', after: '11–17 Mar' },
      },
      marks: () => [{ t: FRA_DAY, label: 'strike day (local)', dash: [] }, { t: FRA_DAY + DAY, label: 'strike day ends', dash: [2, 2] }],
      sources: [
        'Flights: OPDI flight list v2.0.0 (EUROCONTROL / OPDI), March 2025 (the same file as Heathrow), ADS-B based. Times are first/last ADS-B contact (UTC), not schedule.',
        'Event: Verdi 24-hour warning strike at 13 German airports on Monday 10 March 2025 (AP / dpa; Fraport). Official: 1,054 of 1,116 scheduled movements at FRA cancelled (dpa citing airport traffic control; Fraport earlier: 1,050, "expected to rise"). ADV: ≈ 3,400 flights and 510,000 passengers affected nationwide.',
        'Airport coordinates: airportsdata. Coastlines and country outlines: Natural Earth 1:50m (world-atlas).',
      ],
      limits: [
        'Observed: movements, callsigns, airports where the aircraft was seen (90 on 10 Mar vs ≈ 1,125 on a normal day). Inferred: status (delayed / cancelled*). Unavailable: official schedule, gate times. The official figure is shown separately and is not mixed with the inferred count.',
        'Normal = 2–8 Mar. 9 Mar is not used: Hamburg had its own strike that day, so FRA–HAM flights were already missing.',
        'The strike hit 13 German airports at once (Munich ≈ 21 %, Berlin ≈ 15 % of normal), so domestic links were cut at both ends.',
        'Flights that still operated on 10 Mar are mostly overnight long-haul arrivals, cargo and ferry flights.',
        'No diversions are shown: the callsign method found only rescue helicopters and flights with an unknown destination.',
        '≈ 33 % of FRA flights have an unknown other end (long-haul outside OPDI coverage); they are counted but cannot be placed. Coverage is measured on flights that touch no German airport, because the strike itself reduced German traffic. 12 Mar is a low-coverage day.',
        'Phases are Frankfurt local calendar days (UTC+1). No source gives the exact minute the strike began.',
        'Lines between airports are schematic great circles, not recorded tracks.',
      ],
      geo: {
        countries: ['276'],                         // Germany
        focus: { lat: 50.0333, lon: 8.5706, label: 'FRA' },
        kmRadius: 700, rings: [100, 250, 500, 1000],
        points: [], route: null,
      },
      // three phases of equal real length (24 h): local Sunday, strike Monday, Tuesday
      phases: [
        { key: 'before', label: 'Before', note: 'normal traffic', a: FRA_DAY - DAY, b: FRA_DAY },
        { key: 'disruption', label: 'Disruption', note: 'strike: operations at a near standstill', a: FRA_DAY, b: FRA_DAY + DAY },
        { key: 'after', label: 'After', note: 'recovery', a: FRA_DAY + DAY, b: FRA_DAY + 2 * DAY },
      ],
    },
    {
      id: 'dxb2024', short: 'Dubai 2024', status: 'ready', kind: 'sample',
      title: 'Dubai International', subtitle: 'Record rainfall and flooding', dates: '16–18 Apr 2024',
      dataUrl: 'data/dubai_2024-04.json',
      desc: 'Record rainfall flooded the airfield and access roads. Arrivals were diverted and more than 2,000 flights cancelled over several days.',
      warning: 'Partial ADS-B sample (≈ 30–45 % of flights) · receiver gaps marked',
      cfg: {
        originMs: Date.parse(DXB_ORIGIN), dataUrl: 'data/dubai_2024-04.json',
        rangeStart: 11 * DAY, rangeEnd: 24 * DAY, maxKm: 6000, mapKm: 4200, lowCoverage: 0,
        refPeriods: { before: [11, 13], after: [20, 22] }, refLabels: { before: '12–14 Apr', after: '21–23 Apr' },
      },
      marks: () => [{ t: min('2024-04-17T13:15:00Z', DXB_ORIGIN), label: 'NOTAM: EK / FZ arrivals only', dash: [2, 3] }],
      official: { label: 'Reported totals', value: '2,155 cxl · 115 div', sub: 'Dubai Airports, 23 Apr 2024 · whole event · not in flight data' },
      sources: [
        'Flights: verified sample from MrAirspace aircraft-flight-schedules, 2024 Q2 (ODbL), derived from adsb.lol ADS-B archives (ODbL). Only movements observed near DXB (evidence grades A + B) are used.',
        'Official figures: Dubai Airports press release, 23 Apr 2024 (2,155 cancelled, 115 diverted, 31 to DWC, ≈ 1,400 movements a normal day). Flightradar24 blog, 17 Apr 2024 (832 cancellations on 16–17 Apr; 1,145 by 18 Apr 13:00 UTC). GCAA presentation, ICAO APAC ATM Contingency WS 2024 (92 diversions on 16–18 Apr, 87 from DXB, 34 to DWC).',
        'Airport coordinates: airportsdata. Outlines: Natural Earth 1:50m.',
      ],
      limits: [
        'Observed: DXB movements in the sample, callsigns, registrations, aircraft types. Inferred: the other airport for ≈ 62 % of flights (callsign route lookup, marked *), 8 diversions to DWC. Unavailable: schedule, cancellations and delays per flight.',
        'The sample covers ≈ 30–45 % of the official ≈ 1,400 daily movements, and coverage changes from day to day. Percentages compare the sample with its own normal days (12–14 Apr).',
        'The departure / arrival mix flips between days because receivers change: do not read it as an event.',
        'Receiver gap 15 Apr 17:00 – 16 Apr 03:00 UTC: no positions near DXB while aircraft elsewhere were tracked. Shown as missing data, never as zero flights.',
        'Official totals use different windows and counting rules (e.g. 87 vs 115 diversions). They are shown as reported figures, separate from the observed sample.',
        'No receiver on the airfield: aircraft are first / last seen at ≈ 3,000–4,000 ft, so times are approximate.',
      ],
      geo: {
        countries: ['784'],                         // United Arab Emirates
        focus: { lat: 25.2528, lon: 55.3644, label: 'DXB' },
        kmRadius: 400, rings: [50, 100, 200, 400],
        points: [{ label: 'DWC', lat: 24.8964, lon: 55.1614 }], route: null,
      },
      // three phases of equal real length (48 h)
      phases: [
        { key: 'before', label: 'Before', note: 'normal traffic', a: 13 * DAY, b: 15 * DAY },
        { key: 'disruption', label: 'Disruption', note: 'storm, flooded airfield, diversions', a: 15 * DAY, b: 17 * DAY },
        { key: 'after', label: 'After', note: 'restricted operations and recovery', a: 17 * DAY, b: 19 * DAY },
      ],
    },
    {
      id: 'lhr2025', short: 'Heathrow 2025', status: 'ready', kind: 'derived',
      title: 'London Heathrow', subtitle: 'North Hyde substation fire', dates: '20–22 Mar 2025',
      dataUrl: 'data/heathrow_2025-03.json',
      desc: 'A fire at a nearby electrical substation cut power to Heathrow late on 20 March. The airport closed for most of 21 March and reopened in the evening.',
      cfg: {
        originMs: Date.parse(LHR_ORIGIN), dataUrl: 'data/heathrow_2025-03.json',
        rangeStart: 13 * DAY, rangeEnd: 30 * DAY + 11 * 60, maxKm: 4000, mapKm: 1e9, lowCoverage: 0.92,
        refPeriods: { before: [13, 19], after: [23, 29] }, refLabels: { before: '14–20 Mar', after: '24–30 Mar' },
      },
      // the fire time is reported; the first airline movement after it is read from the data
      marks: D => {
        let first = Infinity;
        for (let i = 0; i < D.n; i++) if (D.airlineCs[i] && D.op[i] >= 0 && !D.heli[i] && D.tm[i] > FIRE) first = Math.min(first, D.tm[i]);
        return [{ t: FIRE, label: 'fire', dash: [] }, { t: first, label: 'first airline', dash: [2, 2] }];
      },
      sources: [
        'Flights: OPDI flight list v2.0.0 (EUROCONTROL / OPDI), March 2025, ADS-B based. Times are first/last ADS-B contact (UTC), not schedule.',
        'Airport coordinates: airportsdata. Coastlines and country outlines: Natural Earth 1:50m (world-atlas).',
      ],
      limits: [
        'Observed: movements, callsigns, airports where the aircraft was seen. Inferred: status (delayed / cancelled* / diverted*). Unavailable: official schedule, gate times, passenger numbers.',
        '≈ 42 % of LHR flights have an unknown other end (long-haul outside OPDI coverage); they are counted but cannot be placed.',
        'Low-coverage days: 10, 12 and 22 Mar. 31 Mar is partial (file ends 10:59 UTC).',
        'Lines between airports are schematic great circles, not recorded tracks.',
      ],
      geo: {
        countries: ['826'],                         // United Kingdom (ISO 3166-1 numeric)
        focus: { lat: 51.4700, lon: -0.4543, label: 'LHR' },
        kmRadius: 700, rings: [100, 250, 500, 1000],
        points: [], route: null,
      },
      // three phases of equal real length (24 h), aligned to the fire (23:21 UTC)
      phases: [
        { key: 'before', label: 'Before', note: 'normal traffic', a: FIRE - DAY, b: FIRE },
        { key: 'disruption', label: 'Disruption', note: 'airport closed after the substation fire', a: FIRE, b: FIRE + DAY },
        { key: 'after', label: 'After', note: 'reopening and recovery', a: FIRE + DAY, b: FIRE + 2 * DAY },
      ],
    },
    {
      id: 'fz2026', short: 'flydubai 2026', status: 'ready', kind: 'airline',
      title: 'flydubai FZ1073', subtitle: 'Attempted terrorist attack · Dubai → Tel Aviv', dates: '30 Sep 2026',
      dataUrl: 'data/flydubai_2026-09.json',
      pendingNote: 'Flight data not processed yet. Route and airports are real coordinates; no flights are drawn.',
      desc: 'On flight FZ1073, the co-pilot attacked the captain and attempted to crash the aircraft. Israeli passengers and crew members intervened and subdued the attacker. The aircraft landed safely in Tabuk, Saudi Arabia. Following Israeli demands, flydubai flights to and from Israel were suspended pending security review.',
      warning: 'flydubai flights only · ADS-B observed · FZ1073 itself not in the data',
      focusRoute: 'LLBG', focusName: 'Tel Aviv',
      cfg: {
        originMs: Date.parse(FZ_ORIGIN), dataUrl: 'data/flydubai_2026-09.json',
        rangeStart: 22 * DAY, rangeEnd: 36 * DAY, maxKm: 6000, mapKm: 4200, lowCoverage: 0,
        refPeriods: { before: [22, 28], after: [33, 35] }, refLabels: { before: '23–29 Sep', after: '4–6 Oct' },
      },
      marks: () => [{ t: FZ_DEP, label: 'FZ1073 departs (reported)', dash: [2, 3] }],
      sources: [
        'Flights: adsb.lol globe_history_2026 daily ADS-B archives (ODbL): every aircraft that used a flydubai (FDB) callsign, 23 Sep – 6 Oct 2026. An airport is assigned only where the aircraft was seen low (< 7,000 ft) within 30 km of it.',
        'Event: flydubai statements "Updates on FZ 1073 DXB-TLV on 30 September 2026" (diversion to Tabuk; flights to and from Israel suspended while the investigation continues, at the authorities\' request).',
        'UAE Attorney General / prosecutors classified the incident as an attempted terrorist attack (Khaleej Times, Al Jazeera, 3 Oct 2026). Reports describe passengers and crew struggling for control and a reserve flydubai pilot landing the aircraft; Israeli reports mention a security review of flights to Israel ordered by the Prime Minister.',
        'Reported times (AeroCorner, citing Flightradar24): departure 06:05 Saudi time (03:05 UTC), landing at Tabuk ≈ 09:45 Saudi time; aircraft A6-FKF (737 MAX 8).',
      ],
      limits: [
        'Observed: flydubai movements where the aircraft was seen, including movements at Tel Aviv (dense receiver coverage there).',
        'FZ1073 itself is not in the open data: A6-FKF was tracked on 29 Sep but not at all on 30 Sep, and no receiver covers Tabuk. The diversion is not drawn; the DXB → TLV line is the scheduled great circle, not the flown track.',
        'On 30 Sep the callsign FDB1073 was used by another aircraft (A6-FKR) that landed in Tel Aviv at 15:26 UTC. The data does not explain this; it is shown as observed.',
        'Inferred: the Dubai end of a leg when only the other end was seen (flydubai operates hub-and-spoke from DXB; marked *). Legs with no airport seen at either end are left out.',
        'Unavailable: schedule, cancellations and delays. The absence of Tel Aviv flights after 30 Sep is observed and matches the announced suspension; no status is assigned per flight.',
      ],
      geo: {
        countries: ['784', '682', '376'],           // UAE, Saudi Arabia, Israel
        focus: { lat: 25.2528, lon: 55.3644, label: 'DXB' },
        kmRadius: 2100, rings: [250, 500, 1000, 2000],
        points: [{ label: 'TUU · landed (reported)', lat: 28.3654, lon: 36.6189 }],   // TLV is a network node already
        route: { from: [25.2528, 55.3644], to: [32.0114, 34.8867], label: 'scheduled DXB → TLV (great circle, not flown track)' },
      },
      // three phases of equal real length (72 h), aligned to the reported departure of FZ1073
      phases: [
        { key: 'before', label: 'Before', note: 'regular flydubai network incl. Tel Aviv', a: FZ_DEP - 3 * DAY, b: FZ_DEP, dates: '27–30 Sep 2026' },
        { key: 'disruption', label: 'Disruption', note: 'attack on FZ1073, Israel flights suspended', a: FZ_DEP, b: FZ_DEP + 3 * DAY, dates: '30 Sep – 3 Oct 2026' },
        { key: 'after', label: 'After', note: 'suspension continues', a: FZ_DEP + 3 * DAY, b: FZ_DEP + 6 * DAY, dates: '3–6 Oct 2026' },
      ],
    },
  ];
  // Dubai 2024 stays defined (research + data intact) but is not in the event selector
  AD.archivedCases = AD.cases.filter(c => c.id === 'dxb2024');
  AD.cases = AD.cases.filter(c => c.id !== 'dxb2024');
  AD.caseById = Object.fromEntries(AD.cases.map(c => [c.id, c]));
  AD.state.caseId = 'lhr2025';     // default event on launch
  AD.state.caseFrom = 'lhr2025';
  AD.state.caseT0 = -1e9;
  AD.state.phaseSec = 12;     // screen seconds per phase
  AD.state.pendingPhase = 0;  // phase shown for a case without flight data (kept across case switches)
  AD.state.pendingF = 0;

  AD.currentCase = () => AD.caseById[AD.state.caseId];
  // 0 → 1 eased progress of the current case transition (~1.2 s)
  AD.caseK = () => {
    const k = Math.min(1, Math.max(0, (performance.now() - AD.state.caseT0) / 1200));
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  };
})();
