# AIR DISRUPTION — When the Sky Changes

An interactive p5.js research prototype about what an airport disruption looks like from inside the data. Each event plays as a story in three phases of equal length — **Before → Disruption → After** — and the same flights can be read in four ways. Every number comes from observed flight data or from a cited official source. The two are always kept apart: values inferred from the data are marked `*`, and official figures are labelled as such.

## The three events

| Event | What happened | Flight data |
|---|---|---|
| **Frankfurt (FRA)** · 10 Mar 2025 | A nationwide airport workers' strike (Verdi, 13 German airports) brought flight operations at Frankfurt to a near standstill. Officially 1,054 of 1,116 scheduled movements were cancelled (dpa). Traffic recovered the next day. | OPDI, March 2025. Observed movements: ≈ 1,125 on a normal day → 90 on 10 Mar → 1,123 on 11 Mar. |
| **London Heathrow (LHR)** · 20–22 Mar 2025 | A fire at the North Hyde electrical substation cut power late on 20 March. The airport closed for most of 21 March and reopened in the evening. | OPDI, March 2025 |
| **flydubai FZ1073** · 30 Sep 2026 | An attempted terrorist attack on a Dubai → Tel Aviv flight; the aircraft landed in Tabuk. flydubai then suspended its flights to and from Israel. Shown as a disruption of one *route*, not of an airport. | adsb.lol ADS-B archive: all flydubai-callsign aircraft, 23 Sep – 6 Oct 2026 |

The app opens on Heathrow. Selecting an event restarts its story in Flow from the beginning of Before and plays it.

## The four views

- **Flow** (main view): motion shows connection intensity. Every link to the airport emits dots at a rate proportional to the flights observed on it in the last few hours. When there are no flights, there are no dots. The dots are not aircraft positions.
- **Network**: a geographic map (azimuthal equidistant projection, centred on the airport, with true-distance rings). Lines are routes flown recently. Red rings mark links below 30 % of normal. For flydubai the map zooms to the Dubai–Tel Aviv route.
- **Traces**: time × distance. Each flight is a segment from its first to its last ADS-B contact; arrivals are drawn above the centre line, departures below.
- **Field**: the network as a system. Each node is an airport, and its outline shows what is normal at these hours. A solid shape is what actually happened.

These sit alongside each view:
- a flight board: Frankfurt and Heathrow show a derived status (on time / delayed / CANCELLED\*); flydubai shows observed movements only;
- three live metrics;
- the shared three-panel timeline.

The **i** button opens the method, the live numbers and the data limitations for the current event and view.

## Data, and what it can and cannot say

- **Observed**: movements, callsigns, the airports where an aircraft was seen, and first/last ADS-B contact times (UTC). These are not schedule or gate times.
- **Inferred (`*`)**: per-flight status. A "regular flight" is a callsign seen on ≥ 6 of the 7 reference days. If it is not seen at its usual time, it counts as cancelled\*. Diverted\* (Heathrow only) means the callsign landed elsewhere. For flydubai, a Dubai end that was not seen is inferred.
- **Official (kept separate)**: Frankfurt's 1,054 / 1,116 cancellations; flydubai's statements and the UAE prosecutors' classification of the incident. These are cited in the Info sheet.
- **Not available**: official schedules and passenger numbers. About a third of Frankfurt flights and about 40 % of Heathrow flights have an unknown other end (long-haul flights outside receiver coverage). They are counted, but they cannot be placed on the map.
- **flydubai's red route state** means: no flight was observed for longer than the longest gap in the normal week (≈ 9 h). It is a data threshold, not the official suspension time. FZ1073 itself is not in the open data, and its diversion is not drawn.

Full notes are in [`DATA_NOTES.md`](DATA_NOTES.md) (Hebrew) and in the Info sheet.

### Sources

- Flights: [OPDI flight list v2.0.0](https://www.opdi.aero/) (EUROCONTROL / OPDI), March 2025; [adsb.lol globe_history](https://github.com/adsblol) (ODbL).
- Airport coordinates: [airportsdata](https://github.com/mborsetti/airportsdata).
- Coastlines and country outlines: Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas).
- Events: AP / dpa and Fraport (Frankfurt); NESO investigation and AP / Reuters (Heathrow); flydubai statements, Khaleej Times, Al Jazeera and AeroCorner (flydubai). Each claim is attributed in the Info sheet.

## Run it

**Live:** https://amirosdesign-cyber.github.io/air-disruption/

To run it locally, serve the folder over HTTP: browsers block loading the JSON data from `file://`.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

An internet connection is needed for p5.js 1.11.1, topojson-client 3.1.0 and the world-atlas outlines (all loaded from jsDelivr), and for the Google Fonts typefaces (IBM Plex Mono, Inter). There is no build step.

**Keys:** space = play/pause · ←/→ = one hour (shift = one day) · 1 = Flow, 2 = Network, 3 = Traces, 4 = Field.

## Files

```
index.html, css/, js/       the app (js/modes/ = the four views, js/cases.js = the events)
data/*.json                 processed flight data, one file per event
scripts/                    how each data file was built (Python: pandas, pyarrow, airportsdata)
DATA_NOTES.md               method and data notes (Hebrew)
```

The raw source files (the OPDI parquet and the adsb.lol daily archives) are not included. To rebuild Frankfurt, download `flight_list_202503.parquet` from OPDI and run:

```bash
python3 scripts/prepare_frankfurt.py flight_list_202503.parquet data/frankfurt_2025-03.json
```

`js/cases.js` also keeps the configuration of an archived Dubai 2024 case. It is not shown in the app, and its data is not published here.

## Data licences

- `data/flydubai_2026-09.json` is derived from the adsb.lol globe_history archive and is made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution: © adsb.lol contributors.
- `data/frankfurt_2025-03.json` and `data/heathrow_2025-03.json` are derived from the OPDI flight list (EUROCONTROL / OPDI); see [opdi.aero](https://www.opdi.aero/) for its terms of use.
- Natural Earth outlines are in the public domain.
