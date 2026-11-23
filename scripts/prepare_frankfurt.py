"""
AIR DISRUPTION — data preparation: Frankfurt (EDDF), Verdi strike 10 March 2025.
Same method and output format as prepare_heathrow.py (copied, parameters changed).

Reads the OPDI / EUROCONTROL flight list (Parquet) and writes a compact JSON
file for p5.js. Nothing is invented: flights whose other airport is unknown
keep `other = -1`; times are ADS-B first/last seen (UTC), not schedule times.

Usage:
  python prepare_frankfurt.py <flight_list.parquet> <out.json>
Requires: pandas, pyarrow, airportsdata
"""
import json
import sys
from datetime import datetime, timezone

import airportsdata
import pandas as pd

AIRPORT = "EDDF"
EVENT_DAY = "2025-03-10"
BASELINE = ("2025-03-02", "2025-03-08")   # 7 days before 9 Mar (9 Mar: Hamburg strike already cut HAM links)
PERIODS = {                                 # data-selection periods (UI: Before / During / After)
    "before": ["2025-03-02", "2025-03-08"],
    "during": ["2025-03-10", "2025-03-10"],
    "after":  ["2025-03-11", "2025-03-17"],
}

src, out = sys.argv[1], sys.argv[2]
df = pd.read_parquet(src)
ap_db = airportsdata.load("ICAO")

# ---------- coverage of the whole dataset (all of Europe), per day ----------
# The strike removed ~3,400 flights at German airports from the whole file on 10 Mar, so coverage is
# measured on flights that touch no German (ED**/ET**) airport: a receiver/data gap would show there too.
de = df.adep.fillna("").str.match(r"^E[DT]") | df.ades.fillna("").str.match(r"^E[DT]")
ds_daily = df[~de].groupby(df[~de].dof.dt.strftime("%Y-%m-%d")).size()
ds_median = float(ds_daily.median())

# ---------- Frankfurt flights ----------
is_dep = df.adep == AIRPORT
is_arr = df.ades == AIRPORT
e = df[is_dep | is_arr].copy()
e["dir"] = (e.ades == AIRPORT).astype(int)          # 0 = departure from EDDF, 1 = arrival at EDDF
e["other"] = e.ades.where(e.dir == 0, e.adep)       # the airport at the other end (may be None)
e["day"] = e.dof.dt.strftime("%Y-%m-%d")
e = e.sort_values("first_seen")

t0 = pd.Timestamp("2025-03-01")
def minutes(ts):  # minutes since 1 Mar 2025 00:00 UTC
    return ((ts - t0).dt.total_seconds() // 60).astype(int)

# lookup tables (index-encoded to keep the file small)
def table(series):
    vals = sorted(v for v in series.dropna().unique())
    return vals, {v: i for i, v in enumerate(vals)}

airports, ap_idx = table(pd.concat([e.other, pd.Series([AIRPORT])]))
operators, op_idx = table(e.icao_operator)
types, ty_idx = table(e.typecode)

airport_info, missing_coords = {}, []
for code in airports:
    a = ap_db.get(code)
    if a:
        airport_info[code] = [round(a["lat"], 4), round(a["lon"], 4), a["name"], a["iata"] or "", a["country"]]
    else:
        airport_info[code] = None
        missing_coords.append(code)

days = sorted(e.day.unique())
day_idx = {d: i for i, d in enumerate(days)}

flights = {
    "day":   [day_idx[d] for d in e.day],
    "t0":    minutes(e.first_seen).tolist(),
    "t1":    minutes(e.last_seen).tolist(),
    "dir":   e["dir"].tolist(),
    "other": [ap_idx.get(v, -1) if isinstance(v, str) else -1 for v in e.other],
    "op":    [op_idx.get(v, -1) if isinstance(v, str) else -1 for v in e.icao_operator],
    "type":  [ty_idx.get(v, -1) if isinstance(v, str) else -1 for v in e.typecode],
    "heli":  [1 if isinstance(c, str) and c.startswith("H") else 0 for c in e.icao_aircraft_class],
    "cs":    [c.strip() if isinstance(c, str) else "" for c in e.flt_id],
}

# ---------- daily summary ----------
daily = []
for d in days:
    g = e[e.day == d]
    daily.append({
        "date": d,
        "dep": int((g.dir == 0).sum()),
        "arr": int((g.dir == 1).sum()),
        "total": int(len(g)),
        "routes": int(g.other.dropna().nunique()),            # distinct known other airports
        "otherKnownShare": round(float(g.other.notna().mean()), 3),
        "datasetTotal": int(ds_daily.get(d, 0)),               # all flights in file that day
        "coverage": round(float(ds_daily.get(d, 0)) / ds_median, 3),  # vs median day of file
    })

# ---------- inferred diversions on the event day ----------
# Callsigns that arrived at EDDF on >= 4 of the 7 baseline days and that, on the
# event day, arrived somewhere else. This is an inference from callsigns, not a record.
b = df[(df.ades == AIRPORT) & (df.dof >= BASELINE[0]) & (df.dof <= BASELINE[1])]
reg = b.groupby("flt_id").dof.nunique()
regular = set(reg[reg >= 4].index)
ev = df[(df.dof == EVENT_DAY) & df.flt_id.isin(regular) & (df.ades != AIRPORT)]
div_counts = ev.ades.fillna("UNKNOWN").value_counts()
for code in div_counts.index:
    if code != "UNKNOWN" and code not in airport_info:
        a = ap_db.get(code)
        airport_info[code] = [round(a["lat"], 4), round(a["lon"], 4), a["name"], a["iata"] or "", a["country"]] if a else None
diversions = {
    "method": "Callsigns that landed at EDDF on >=4 of 2-8 Mar and on 10 Mar were seen landing elsewhere. Inferred, not an official diversion list.",
    "regularCallsigns": len(regular),
    "seenOnEventDay": int(df[(df.dof == EVENT_DAY) & df.flt_id.isin(regular)].shape[0]),
    "landedElsewhere": {k: int(v) for k, v in div_counts.items()},
    "flights": [
        {"cs": r.flt_id.strip(), "adep": r.adep, "ades": r.ades,
         "t0": int((r.first_seen - t0).total_seconds() // 60), "t1": int((r.last_seen - t0).total_seconds() // 60)}
        for r in ev.itertuples()
    ],
}

# Not applied for the strike: flights were cancelled, not diverted. The callsign method above only
# finds rescue helicopters (CHX…) and flights whose destination is unknown, so no diversion is kept.
diversions = {
    "method": "Not applied: during the strike flights were cancelled, not diverted. The callsign test (regular EDDF arrivals seen landing elsewhere on 10 Mar) only found rescue helicopters and flights with an unknown destination, so no diversions are shown.",
    "candidatesRejected": {k: int(v) for k, v in div_counts.items()},
    "landedElsewhere": {},
    "flights": [],
}

doc = {
    "meta": {
        "case": "frankfurt-2025",
        "title": "Frankfurt, Verdi airport workers' strike",
        "airport": AIRPORT,
        "timeOrigin": "2025-03-01T00:00:00Z",
        "timeUnit": "minutes since timeOrigin, UTC (Frankfurt local time = UTC+1 in March before 30 Mar)",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "OPDI flight list v2.0.0 (EUROCONTROL / OPDI, https://www.opdi.aero/), file flight_list_202503.parquet",
        "airportCoordinates": "airportsdata Python package (MIT), derived from public airport databases",
        "baseline": list(BASELINE),
        "periods": PERIODS,
        "coverageMethod": "daily flights in the file that touch no German airport / median day (the strike itself reduced German traffic)",
        "notes": [
            "Times are ADS-B first_seen / last_seen, not scheduled or wheels-off times.",
            "other = -1 means the other airport is not determined in OPDI (often outside European ADS-B coverage).",
            "Lines between airports are schematic (great-circle), not recorded trajectories.",
            "Official cancellation figures are not in this file; they are reported separately in the interface.",
        ],
    },
    "events": [{
        "id": "verdi-strike",
        "label": "Verdi strike at 13 German airports incl. Frankfurt (24 h, Monday 10 Mar)",
        "day": "2025-03-10",
        "official": "1,054 of 1,116 scheduled movements cancelled at FRA (dpa citing airport traffic control)",
        "sources": ["AP / dpa, 10 Mar 2025", "Fraport press release, Mar 2025"],
    }],
    "days": days,
    "daily": daily,
    "airports": airports,
    "airportInfo": airport_info,
    "missingCoords": missing_coords,
    "operators": operators,
    "types": types,
    "flights": flights,
    "diversions": diversions,
}

with open(out, "w") as f:
    json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
print(f"wrote {out}: {len(e)} flights, {len(airports)} airports, missing coords: {missing_coords}")
