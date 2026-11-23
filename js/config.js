'use strict';
// AIR DISRUPTION — shared configuration, state and theme.
// Time everywhere = minutes since 2025-03-01 00:00 UTC (same as the JSON).

const AD = { modes: {} };
const DAY = 1440;

AD.cfg = {
  originMs: Date.UTC(2025, 2, 1),   // time origin of the CURRENT case (set by AD.useCase)
  dataUrl: 'data/heathrow_2025-03.json',
  landUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json',
  countriesUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json',
  rangeStart: 13 * DAY,           // 14 Mar 2025 00:00 UTC
  rangeEnd: 30 * DAY + 11 * 60,   // 31 Mar 2025 11:00 UTC — the file ends 10:59
  maxKm: 4000,                    // furthest known airport ≈ 3,700 km
  lowCoverage: 0.92,              // whole-file daily total / median day
  // reference periods (day index, 0 = 1 Mar), 7 days each so weekdays balance
  refPeriods: { before: [13, 19], after: [23, 29] },
  refLabels: { before: '14–20 Mar', after: '24–30 Mar' },
  periodJump: { before: 13 * DAY, during: 20 * DAY, after: 21 * DAY },
  periodBands: [
    { key: 'before', label: 'BEFORE', a: 13 * DAY, b: 20 * DAY },
    { key: 'during', label: 'DURING', a: 20 * DAY, b: 21 * DAY },
    { key: 'after', label: 'AFTER', a: 21 * DAY, b: 30 * DAY + 11 * 60 },
  ],
};

AD.state = {
  mode: 'flow',
  playing: true,
  speed: 2,              // A/B/C: simulated hours per real second (Flow uses equal-length phases instead)
  p: 19 * DAY + 12 * 60, // playhead: 20 Mar 12:00 UTC — the closure arrives ~12 s after opening
  // DATA selection (changes which flights count)
  dir: 'all',            // all | dep | arr
  airline: false,        // only ICAO airline-format callsigns, no helicopters
  ref: 'before',         // reference period for comparisons
  windowH: 6,            // C: aggregation window (hours), compared at the same hours of day
  // APPEARANCE (changes only how they look)
  weight: 1,
  opacity: 0.7,
  persist: { network: 6, traces: 120 },  // A/B: hours a finished flight stays visible (120 = ∞)
  spanH: 72,             // B: visible time span
  theme: 'dark',
  // C · Flow — motion
  flow: {
    motion: true,        // stop motion = freeze dots AND timeline
    rateH: 3,            // DATA: emission = flights on the link in the last N hours
    density: 1,          // APPEARANCE: dots per second per (flight / hour) × 0.5
    trail: 2.2,          // APPEARANCE: trail length in seconds of travel
    speedPx: 34,         // APPEARANCE: dot speed, px / s
  },
};

AD.themes = {
  dark: {
    bg: [7, 9, 12], ink: [228, 232, 236], muted: [118, 126, 136], faint: [38, 44, 52],
    coast: [70, 80, 92], dep: [104, 190, 214], arr: [226, 166, 110], alert: [236, 84, 76],
    flowDep: [214, 226, 240], flowArr: [150, 170, 196], delayed: [240, 150, 60], diverted: [176, 140, 255],
  },
  light: {
    bg: [244, 243, 239], ink: [18, 22, 26], muted: [112, 116, 122], faint: [214, 213, 207],
    coast: [168, 170, 172], dep: [24, 118, 156], arr: [186, 104, 34], alert: [204, 40, 40],
    flowDep: [30, 40, 56], flowArr: [96, 112, 136], delayed: [206, 108, 10], diverted: [110, 70, 210],
  },
};

AD.col = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
AD.FONT = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

AD.time = {
  date(p) { return new Date(AD.cfg.originMs + p * 60000); },
  dayLabel(p) {
    return this.date(p).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  },
  short(p) {
    return this.date(p).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }) + ' ' + this.hm(p);
  },
  hm(p) {
    const d = this.date(p);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  },
};
