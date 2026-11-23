"""Split adsb.lol traces into flight legs and infer each leg's start/end airport.
A leg starts at readsb's new-leg flag (flags & 2) or after a gap > 40 min.
An end is attributed to an airport only if the aircraft is seen low (< 7,000 ft or on
ground) within 30 km of an airport with an IATA code; nearest such airport wins.
Otherwise that end is 'unknown' (not invented)."""
import gzip, json, math, airportsdata
AP = [a for a in airportsdata.load('ICAO').values() if a['iata'] and a['lat'] is not None]
GRID = {}
for a in AP: GRID.setdefault((int(a['lat']), int(a['lon'])), []).append(a)
R = 6371
def dist(a, b, c, d):
    return R*math.acos(max(-1, min(1, math.sin(math.radians(a))*math.sin(math.radians(c))+math.cos(math.radians(a))*math.cos(math.radians(c))*math.cos(math.radians(b-d)))))
def nearest_ap(lat, lon, maxkm=30):
    best, bd = None, maxkm
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for a in GRID.get((int(lat)+i, int(lon)+j), []):
                d = dist(lat, lon, a['lat'], a['lon'])
                if d < bd: best, bd = a, d
    return best
def low(p): return p[3] == 'ground' or (isinstance(p[3], (int, float)) and p[3] < 7000)
def legs(d):
    ts, tr = d['timestamp'], d['trace']
    out, cur = [], []
    for k, p in enumerate(tr):
        if cur and ((p[6] & 2) or p[0] - cur[-1][0] > 2400):
            out.append(cur); cur = []
        cur.append(p)
    if cur: out.append(cur)
    res = []
    for L in out:
        if len(L) < 5: continue
        cs = None
        for p in L:
            if p[8] and isinstance(p[8], dict) and p[8].get('flight', '').strip(): cs = p[8]['flight'].strip(); break
        def end(pts):
            for p in pts[:8]:                    # first few points near this end
                if low(p):
                    a = nearest_ap(p[1], p[2])
                    if a: return a['icao']
            return None
        res.append(dict(icao=d['icao'], reg=d.get('r'), type=d.get('t'), cs=cs,
                        t0=ts+L[0][0], t1=ts+L[-1][0], adep=end(L), ades=end(L[::-1]),
                        p0=(round(L[0][1],3), round(L[0][2],3), L[0][3]), p1=(round(L[-1][1],3), round(L[-1][2],3), L[-1][3])))
    return res
if __name__ == '__main__':
    import sys, collections
    focus = sys.argv[2]
    mv = collections.Counter(); other = collections.Counter(); n = 0
    for line in gzip.open(sys.argv[1], 'rt'):
        for g in legs(json.loads(line)):
            if g['adep'] == focus: mv['dep'] += 1; other[g['ades'] or '?'] += 1
            if g['ades'] == focus: mv['arr'] += 1; other[g['adep'] or '?'] += 1
            for k in ('adep', 'ades'):
                if g[k] in ('OMSJ', 'OMDW'): mv[g[k]] += 1
    print(mv, 'unknown other end:', other['?'], 'top:', other.most_common(12))
