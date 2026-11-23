"""Build data/flydubai_2026-09.json (same structure as heathrow_2025-03.json) from
adsb.lol daily extracts of every aircraft that used a flydubai (FDB) callsign.

Usage: python -I build_flydubai.py <dir with fdb_2026-MM-DD.jsonl.gz files>

Rules (no invention):
  • A leg = consecutive positions of one aircraft with a FDB callsign; a new leg starts at
    readsb's new-leg flag or after a gap > 40 min. Traces are stitched across UTC midnight.
  • An airport is assigned to a leg end only if the aircraft was seen low (< 7,000 ft or on the
    ground) within 30 km of an airport with an IATA code (nearest wins). Otherwise: unknown.
  • Hub = DXB (OMDB). Legs with DXB at one end: observed. Legs where only the non-DXB end was
    seen: the DXB end is INFERRED (flydubai flies hub-and-spoke) → inf bit 2. Movement time is
    then the first/last contact, not a runway time. Legs with no airport seen, or between two
    non-DXB airports, are left out (counted in meta).
  • Gaps = UTC hours with no flydubai position anywhere (archive outage): missing data.
  • No schedule, no statuses, no diversions (FZ1073 itself is not in the data)."""
import sys, os, glob, gzip, json, math, datetime as dt, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dubai_2024'))
from legs import nearest_ap, low   # noqa: E402
import airportsdata

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'data', 'flydubai_2026-09.json')
ORIGIN = dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc)
O = ORIGIN.timestamp()
HUB = 'OMDB'
AP = airportsdata.load('ICAO')
src = sys.argv[1]
files = sorted(glob.glob(os.path.join(src, 'fdb_2026-*.jsonl.gz')))

# 1 · stitch every aircraft's positions across days (absolute seconds)
pts = collections.defaultdict(list); meta_ac = {}
hours_seen = set()
for f in files:
    for line in gzip.open(f, 'rt'):
        d = json.loads(line); ts = d['timestamp']
        meta_ac[d['icao']] = (d.get('r'), d.get('t'))
        cs = None
        for p in d['trace']:
            if isinstance(p[8], dict) and (p[8].get('flight') or '').strip(): cs = p[8]['flight'].strip()
            t = ts + p[0]
            pts[d['icao']].append((t, p[1], p[2], p[3], p[6], cs))
            if cs and cs.startswith('FDB'): hours_seen.add(int((t - O) // 3600))

# 2 · legs
def ends(L, rev):
    seq = L[::-1] if rev else L
    for p in seq[:10]:
        if low((None, p[1], p[2], p[3])):
            a = nearest_ap(p[1], p[2])
            if a: return a['icao']
    return None

flights, dropped = [], collections.Counter()
for icao, P in pts.items():
    P.sort()
    legs, cur = [], []
    for q in P:
        if cur and ((q[4] & 2) or q[0] - cur[-1][0] > 2400): legs.append(cur); cur = []
        cur.append(q)
    if cur: legs.append(cur)
    for L in legs:
        css = [q[5] for q in L if q[5]]
        if len(L) < 5 or not css or not css[-1].startswith('FDB'): continue
        cs = collections.Counter(css).most_common(1)[0][0]
        a, b = ends(L, False), ends(L, True)
        t0, t1 = L[0][0], L[-1][0]
        if a == HUB and b != HUB: f = dict(dir=0, other=b, inf=0)
        elif b == HUB and a != HUB: f = dict(dir=1, other=a, inf=0)
        elif a == HUB and b == HUB: dropped['DXB both ends (return / local)'] += 1; continue
        elif a and not b: f = dict(dir=1, other=a, inf=2)        # seen leaving X, end unseen → X → DXB (hub inferred)
        elif b and not a: f = dict(dir=0, other=b, inf=2)        # seen arriving at X, start unseen → DXB → X (hub inferred)
        elif a and b: dropped['between two non-DXB airports'] += 1; continue
        else: dropped['no airport seen at either end'] += 1; continue
        reg, typ = meta_ac.get(icao, (None, None))
        flights.append(dict(icao=icao, reg=reg, type=typ, cs=cs, t0=t0, t1=t1, **f))

# 3 · keep the event window, columnar
lo, hi = (dt.datetime(2026, 9, 23, tzinfo=dt.timezone.utc).timestamp(), dt.datetime(2026, 10, 7, tzinfo=dt.timezone.utc).timestamp())
flights = [f for f in flights if lo <= (f['t0'] if f['dir'] == 0 else f['t1']) < hi]
flights.sort(key=lambda f: f['t0'])
airports, ap_ix = [], {}
def ap_i(c):
    if not c or c not in AP or c == HUB: return -1
    if c not in ap_ix: ap_ix[c] = len(airports); airports.append(c)
    return ap_ix[c]
types, t_ix = [], {}
def ty(v):
    if not v: return -1
    if v not in t_ix: t_ix[v] = len(types); types.append(v)
    return t_ix[v]
m = lambda s: int((s - O) // 60)
cols = collections.defaultdict(list)
for f in flights:
    tm = f['t0'] if f['dir'] == 0 else f['t1']
    cols['day'].append(m(tm) // 1440); cols['t0'].append(m(f['t0'])); cols['t1'].append(m(f['t1']))
    cols['dir'].append(f['dir']); cols['other'].append(ap_i(f['other'])); cols['inf'].append(f['inf'])
    cols['op'].append(0); cols['type'].append(ty(f['type'])); cols['heli'].append(0); cols['cs'].append(f['cs'])
# TLV, TUU always present for the geography / focus route
for c in ('LLBG', 'OETB'): ap_i(c)
airports.append(HUB)
info = {c: [AP[c]['lat'], AP[c]['lon'], AP[c]['name'], AP[c]['iata'], AP[c]['country']] for c in airports}

# gaps: hours inside the window with no flydubai position anywhere
gaps = []
for h in range(int((lo - O) // 3600), int((hi - O) // 3600)):
    if h in hours_seen: continue
    a = h * 60
    if gaps and gaps[-1][1] == a: gaps[-1][1] = a + 60
    else: gaps.append([a, a + 60])

days = [(ORIGIN + dt.timedelta(days=d)).strftime('%Y-%m-%d') for d in range(37)]
daily = []
for d in range(37):
    idx = [k for k, x in enumerate(cols['day']) if x == d]
    daily.append(dict(date=days[d], dep=sum(1 for k in idx if cols['dir'][k] == 0), arr=sum(1 for k in idx if cols['dir'][k] == 1), total=len(idx), coverage=None))
inf_n = collections.Counter(cols['inf'])
tlv = ap_ix.get('LLBG', -1)
tlv_by_day = collections.Counter(cols['day'][k] for k in range(len(cols['day'])) if cols['other'][k] == tlv)
out = dict(
    meta=dict(case='flydubai-2026', title='flydubai network around FZ1073, Sep–Oct 2026', airport=HUB,
              timeOrigin='2026-09-01T00:00:00Z', timeUnit='minutes since timeOrigin, UTC (Dubai = UTC+4)',
              generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
              source='adsb.lol globe_history_2026 daily releases (ODbL), prod-0, 23 Sep – 6 Oct 2026; all aircraft with a FDB callsign',
              airportCoordinates='airportsdata',
              legs={'kept': len(flights), 'hubObserved': inf_n[0], 'hubInferred': inf_n[2], 'dropped': dict(dropped)},
              tlvByDay={days[d]: n for d, n in sorted(tlv_by_day.items())}),
    events=[{'id': 'fz1073', 'label': 'FZ1073 attempted terrorist attack; diversion to Tabuk (reported)', 'start': '2026-09-30T03:05:00Z',
             'sources': ['flydubai statements, 30 Sep 2026', 'AeroCorner citing Flightradar24']}],
    gaps=gaps, days=days, daily=daily, airports=airports, airportInfo=info, missingCoords=[], operators=['FDB'], types=types,
    flights=dict(cols),
    diversions=dict(method='FZ1073 (A6-FKF) is not in the open data; no diversion is drawn.', landedElsewhere={}, flights=[]),
)
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print(OUT, len(flights), 'legs', out['meta']['legs'], 'gaps', gaps, '\nTLV by day', out['meta']['tlvByDay'])
