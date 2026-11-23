'use strict';
// INFO — the secondary layer. Everything methodological lives here instead of the
// main interface: what this view encodes, the event, the live numbers, the method
// (reference period, thresholds, derived statuses, inferred diversions) and the
// data sources / limitations. Content depends on the selected mode AND event.

AD.info = (() => {
  const I = {}, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const dl = rows => `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  // noise floor of the derived status, measured on the 'after' reference days of the current case
  function noise() {
    // per-day shares on all reference days (before + after); median and range, because weekends
    // and partial days differ a lot (an average hides that)
    const days = [];
    for (const [d0, d1] of [AD.cfg.refPeriods.before, AD.cfg.refPeriods.after]) for (let d = d0; d <= d1; d++) {
      const n = AD.schedule.count(AD.schedule.between(d * DAY, (d + 1) * DAY));
      if (n.total) days.push({ c: n.cancelled / n.total * 100, l: n.delayed / n.total * 100 });
    }
    if (!days.length) return '';
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const f = v => Math.round(v), cs = days.map(d => d.c), ls = days.map(d => d.l);
    return `Noise floor: on the ${days.length} reference days (${esc(AD.cfg.refLabels.before)}, ${esc(AD.cfg.refLabels.after)}) a median ${f(med(cs))} % of regular flights show as cancelled* (daily ${f(Math.min(...cs))}–${f(Math.max(...cs))} %) and ${f(med(ls))} % as delayed (${f(Math.min(...ls))}–${f(Math.max(...ls))} %). Weekends and partial days are higher.`;
  }

  // static part — rebuilt when mode or case changes
  I.render = function () {
    const S = AD.state, c = AD.currentCase(), m = AD.modes[S.mode], ready = c.status === 'ready';
    const ref = AD.cfg.refLabels[S.ref];
    let h = '';
    h += `<h4>${esc(m.label)}</h4><p>${esc(m.desc)}</p>`;
    h += `<h4>${esc(c.title)} · ${esc(c.dates)}</h4><p>${esc(c.subtitle)}.</p><ul>`;
    for (const ph of c.phases) h += `<li><b>${esc(ph.label)}</b> — ${esc(ph.note)} · ${esc(ph.dates || `${AD.time.short(ph.a)} → ${AD.time.short(ph.b)} UTC`)}</li>`;
    h += '</ul>';
    if (!ready) {
      h += `<p class="flag">${esc(c.pendingNote)}</p>`;
    } else {
      h += `<h4>Live numbers</h4><div id="info-live"></div>`;
      const hub = AD.data.hub.iata;
      h += `<h4>Metrics in the sidebar</h4><ul>
        <li><b>Traffic vs expected</b> — movements observed in the last 3 h ÷ the reference period (${esc(ref)}) at the same hours of day.${c.kind === 'sample' ? ' Both come from the same partial sample, so the ratio is relative, not a share of real traffic.' : ''}</li>
        <li><b>Active links</b> — airports with ≥ 1 movement in the last 3 h, out of those that normally have ≥ 0.5 movements in those hours. Flights with an unknown other end are not a link.</li>`;
      if (c.kind === 'derived') h += `<li><b>Cancelled* / diverted*</b> — regular flights due in the last 3 h that were not observed / that landed elsewhere. Both are inferred, never confirmed cancellations.</li>`;
      if (c.kind === 'sample') h += `<li><b>${esc(c.official.label)}</b> — official figures, shown separately because the sample has no schedule: ${esc(c.official.value)} (${esc(c.official.sub)}).</li>`;
      if (c.kind === 'airline') {
        const R = AD.route.get();
        h += `<li><b>Tel Aviv route</b> — flydubai movements observed at TLV in the last 24 h vs the reference period at the same hours.</li>`;
        if (R) h += `<li><b>Route focus (all views)</b> — the DXB ⇄ TLV route is drawn on top and the rest of the network is dimmed context. It turns <b>red</b> when no movement has been observed on the route for longer than the longest gap between movements in ${esc(AD.cfg.refLabels.before)} (${esc(AD.route.fmtH(R.maxGap))}). This is a data threshold, not the time the suspension officially began, and not a per-flight status. The last observed TLV movement is ${esc(AD.time.short(AD.route.get(1e9).last))} UTC; flights continued for most of 30 Sep after FZ1073 departed.</li>`;
      }
      h += `<li>Receiver gaps (hatched in the timeline) are missing data: metrics show "–" there, never 0.</li></ul>`;
      if (c.kind === 'derived') {
        h += `<h4>Flight board · derived status</h4><ul>
        <li>The source has no schedule or status. A <b>regular flight</b> is an airline callsign seen at ${hub} in the same direction on ≥ 6 of the 7 reference days (${esc(AD.cfg.refLabels.before)}); its <b>usual time</b> is the circular median of its time of day.</li>
        <li><b>On time / delayed</b>: the flight was observed within −2 h … +10 h of its usual time; delayed = more than 30 min later. Times are first/last ADS-B contact, not gate times.</li>
        <li><b>Cancelled*</b>: not observed at ${hub} in that window — it may also be a data gap.</li>
        ${c.id === 'lhr2025' ? '<li><b>Diverted*</b>: the callsign landed at another airport (inferred for 21 Mar only).</li>' : '<li>No diversions are inferred for this event.</li>'}
        <li>${noise()}</li></ul>`;
        if (c.official) h += `<p class="flag">Official, kept separate: ${esc(c.official.value)} ${esc(c.official.sub)}.</p>`;
      } else {
        h += `<h4>Flight board · observed only</h4><ul>
        <li>Rows are movements actually seen in the data in the last hour (time = approximate runway time from ADS-B). There is no schedule, so no delays or cancellations are shown per flight.</li>
        <li>An airport marked <b>*</b> is inferred from the callsign route lookup, not observed.</li>
        ${c.kind === 'airline' ? '<li><b>*→ / *←</b>: only the non-Dubai end was seen; the Dubai end is inferred (flydubai flies hub-and-spoke) and the time is first / last contact, not a runway time.</li>' : ''}${c.kind === 'sample' ? '<li><b>Diverted*</b>: the callsign route lookup ends at DXB but the observed track ended at DWC (8 flights on 16 Apr). Official totals are larger (31–34 to DWC, 87–115 in all).</li>' : '<li>Tel Aviv rows are highlighted: that is the route this case is about.</li>'}</ul>`;
      }
      h += `<h4>Thresholds</h4><ul>
        <li>Red ring / red label = link below 30 % of its normal flights at these hours.</li>
        <li>Reference ("normal") = ${esc(ref)}, hour-of-day profile.</li>
        <li>Flow emits dots ∝ flights per link in the last ${S.flow.rateH} h; dots are not aircraft positions.</li></ul>`;
    }
    h += `<h4>Data &amp; limitations</h4><ul>${(c.sources || []).map(x => `<li>${esc(x)}</li>`).join('')}${(c.limits || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    h += `<h4>Keys</h4><p>space play / pause · ←/→ one hour · shift = one day · 1 Flow · 2 Network · 3 Traces · 4 Field.</p>`;
    $('info-body').innerHTML = h;
  };

  // live part — called with the UI tick while the sheet is open
  I.update = function () {
    const el = $('info-live'); if (!el) return;
    const S = AD.state, D = AD.data, p = S.p, di = Math.floor(p / DAY), ds = D.dayStats[di], daily = D.daily[di];
    if (!ds || !D.ref) { el.innerHTML = ''; return; }
    const pct = (v, r) => (r > 0 ? Math.round((v / r) * 100) + ' %' : '–');
    const rows = [
      [`${AD.time.dayLabel(p)} · movements`, ds.total.toLocaleString('en')],
      ['departures / arrivals', `${ds.dep} / ${ds.arr}`],
      [`vs reference day (${AD.cfg.refLabels[S.ref]})`, `${pct(ds.total, D.ref.total)} of ${Math.round(D.ref.total)}`],
      ['known routes this day', `${ds.nRoutes} (ref ${Math.round(D.ref.routes)})`],
      ['other end unknown', ds.total ? Math.round((ds.unknown / ds.total) * 100) + ' %' : '–'],
      ...AD.modes[S.mode].stats().map(([k, v]) => [k, v]),
    ];
    const flags = [];
    if (AD.state.caseId === 'lhr2025' && di === 30) flags.push('31 Mar is partial: the file ends at 10:59 UTC.');
    else if (daily && daily.coverage != null && daily.coverage < AD.cfg.lowCoverage) flags.push(`Low-coverage day: the whole file has ${Math.round(daily.coverage * 100)} % of a median day. A dip may be a data gap, not an event.`);
    if (D.inGap(p)) flags.push('Receiver gap at this time: no positions near the airport. Missing data, not zero flights.');
    if (AD.state.caseId === 'fra2025' && di === 8) flags.push('9 Mar: Hamburg had its own strike this day, so Hamburg flights are already missing (9 Mar is not part of the normal reference).');
    if (AD.state.caseId === 'lhr2025' && di === 20) flags.push('Most movements left on 21 Mar before the evening are helicopters / general aviation (try "Airline callsigns only" in Settings).');
    el.innerHTML = dl(rows) + flags.map(f => `<p class="flag">${esc(f)}</p>`).join('');
  };

  return I;
})();
