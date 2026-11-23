'use strict';
// INTERFACE — DOM controls and the numeric readout. Reads/writes AD.state only.

AD.ui = (() => {
  const U = {}, $ = id => document.getElementById(id);
  const S = AD.state;

  const dataChanged = () => { AD.data.recompute(); AD.story.recompute(); U.syncControls(); };

  U.init = function () {
    $('modes').onclick = e => {
      const m = e.target.dataset.mode;
      if (m && (m === 'flow' || AD.currentCase().status === 'ready')) U.setMode(m);
    };
    $('cases').onclick = e => { const id = e.target.closest('button')?.dataset.case; if (id) U.setCase(id); };
    $('phasesec').onchange = e => { S.phaseSec = +e.target.value; };
    $('play').onclick = () => { S.playing = !S.playing; U.syncControls(); };
    $('speed').onchange = e => { S.speed = +e.target.value; };
    $('period').onclick = e => {
      const k = e.target.dataset.period; if (!k) return;
      const c = AD.currentCase(), i = { before: 0, during: 1, after: 2 }[k];
      if (c.status !== 'ready') { S.pendingPhase = i; S.pendingF = 0; U.syncControls(); return; }
      S.p = c.phases[i].a;
      S.periodKey = k; U.syncControls();
    };
    $('dir').onclick = e => { const d = e.target.dataset.dir; if (d) { S.dir = d; dataChanged(); } };
    $('airline').onchange = e => { S.airline = e.target.checked; dataChanged(); };
    $('ref').onchange = e => { S.ref = e.target.value; dataChanged(); };
    const slider = (id, key, out, fmt) => {
      const el = $(id); el.value = S[key];
      const show = () => { $(out).textContent = fmt(S[key]); };
      el.oninput = () => { S[key] = +el.value; show(); };
      show();
    };
    slider('window', 'windowH', 'o-window', v => v + ' h');
    slider('weight', 'weight', 'o-weight', v => v.toFixed(1));
    slider('opacity', 'opacity', 'o-opacity', v => Math.round(v * 100) + ' %');
    const pe = $('persist'), showP = () => { const v = S.persist[S.mode]; $('o-persist').textContent = v >= 120 ? '∞' : v + ' h'; };
    pe.oninput = () => { if (S.mode in S.persist) { S.persist[S.mode] = +pe.value; showP(); } };
    U.syncPersist = () => { if (S.mode in S.persist) { pe.value = S.persist[S.mode]; showP(); } };
    slider('span', 'spanH', 'o-span', v => v + ' h');
    const fslider = (id, key, out, fmt) => {
      const el = $(id); el.value = S.flow[key];
      const show = () => { $(out).textContent = fmt(S.flow[key]); };
      el.oninput = () => { S.flow[key] = +el.value; show(); };
      show();
    };
    fslider('rate', 'rateH', 'o-rate', v => v + ' h');
    fslider('trail', 'trail', 'o-trail', v => v.toFixed(1) + ' s');
    fslider('density', 'density', 'o-density', v => '× ' + v);
    fslider('dspeed', 'speedPx', 'o-dspeed', v => v + ' px/s');
    $('motion').onclick = () => { S.flow.motion = !S.flow.motion; U.syncControls(); };
    $('theme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; U.syncControls(); };
    $('export').onclick = () => AD.exportPNG();
    // secondary layers: one open at a time
    const sheet = (id, open) => {
      for (const k of ['info', 'settings']) { const on = k === id && open; $(k).hidden = !on; $(k + '-btn').classList.toggle('on', on); }
      if (id === 'info' && open) { AD.info.render(); AD.info.update(); }
    };
    $('info-btn').onclick = () => sheet('info', $('info').hidden);
    $('settings-btn').onclick = () => sheet('settings', $('settings').hidden);
    document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => sheet(b.dataset.close, false); });
    U.sheet = sheet;

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') { U.sheet('info', false); return; }
      if (e.code === 'Space') { e.preventDefault(); S.playing = !S.playing; U.syncControls(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const step = (e.shiftKey ? DAY : 60) * (e.key === 'ArrowRight' ? 1 : -1);
        S.p = Math.max(AD.cfg.rangeStart, Math.min(AD.cfg.rangeEnd - 1, Math.round(S.p / 60) * 60 + step));
      }
      if (['1', '2', '3', '4'].includes(e.key)) U.setMode(['flow', 'network', 'traces', 'field'][+e.key - 1]);
    });
    U.syncCase();
    U.setMode(S.mode);
  };

  // switch case: the story restarts — Flow, start of BEFORE, playing. Geography crossfades,
  // network fades in, title / timeline / board / metrics all follow the new start time.
  // (Switching MODE within an event keeps the playhead: see U.setMode.)
  U.setCase = async function (id) {
    if (id === S.caseId || U.loading) return;
    const prev = S.caseId, c = AD.caseById[id];
    S.pendingPhase = 0; S.pendingF = 0;
    if (c.status === 'ready') {
      // load (once) and switch the dataset; drawing pauses for the few frames this takes
      U.loading = true; AD.ready = false; S.caseId = id;
      try { await AD.useCase(id); }
      catch (e) { console.error(e); S.caseId = prev; await AD.useCase(prev); U.loading = false; AD.ready = true; return; }
      U.loading = false; AD.ready = true;
      S.p = c.phases[0].a;
    } else { S.caseId = id; }
    S.playing = true;
    U.setMode('flow');
    S.caseFrom = prev; S.caseT0 = performance.now();
    document.querySelector('h1').textContent = c.title;
    U.syncCase();
    if (!$('info').hidden) AD.info.render();
    U.syncControls();
  };

  // reference-period labels follow the case
  U.syncRef = function () {
    const r = AD.cfg.refLabels;
    $('ref').options[0].textContent = `Before · ${r.before}`; $('ref').options[1].textContent = `After · ${r.after}`;
  };

  U.syncCase = function () {
    const c = AD.currentCase();
    $('case-warn').textContent = c.status === 'ready' ? (c.warning || '') : '';
    document.querySelector('h1').textContent = c.title;
    document.querySelector('.case').textContent = `${c.subtitle} · ${c.dates}`;
    $('case-desc').textContent = c.desc || '';
  };

  U.setMode = function (m) {
    S.mode = m;
    if (!$('info').hidden) AD.info.render();
    U.syncPersist();
    U.syncControls();
  };

  U.syncControls = function () {
    document.documentElement.dataset.theme = S.theme;
    $('theme').textContent = S.theme === 'dark' ? 'Light mode' : 'Dark mode';
    $('play').textContent = S.playing ? 'Pause' : 'Play';
    $('play').classList.toggle('primary', S.playing);
    $('motion').textContent = S.flow.motion ? 'Stop motion' : 'Start motion';
    $('motion').classList.toggle('on', !S.flow.motion);
    document.querySelectorAll('#modes button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === S.mode);
      b.disabled = b.dataset.mode !== 'flow' && AD.currentCase().status !== 'ready';
    });
    document.querySelectorAll('#cases button').forEach(b => b.classList.toggle('on', b.dataset.case === S.caseId));
    document.querySelectorAll('#dir button').forEach(b => b.classList.toggle('on', b.dataset.dir === S.dir));
    document.querySelectorAll('[data-for]').forEach(el => { el.style.display = el.dataset.for.split(' ').includes(S.mode) ? '' : 'none'; });
  };

  // three live metrics — all over the last 3 h before the playhead
  const W = 180;
  U.metrics = function () {
    const D = AD.data, S = AD.state, p = S.p;
    let obs = 0; const seen = new Uint8Array(D.ap.length);
    D.eachActive(p - W, p, i => { const t = D.tm[i]; if (t <= p - W || t > p) return; obs++; if (D.other[i] >= 0) seen[D.other[i]] = 1; });
    const exp = D.expected(p - W, p, D.ref.hour);
    let links = 0, active = 0;
    for (const A of D.ap) {
      if (A === D.hub) continue;
      if (D.expected(p - W, p, D.ref.apHour, A.i * 24) >= 0.5) { links++; if (seen[A.i]) active++; }
    }
    const c = AD.currentCase();
    const st = c.kind === 'derived' ? AD.schedule.count(AD.schedule.between(p - W, p)) : null;
    const gap = D.gapOverlap(p - W, p) > W / 3;
    // airline case: the focus route over the last 24 h against its own normal
    let focus = null;
    if (c.focusRoute && D.apByCode[c.focusRoute]) {
      const A = D.apByCode[c.focusRoute]; let n = 0;
      D.eachActive(p - DAY, p, i => { const t = D.tm[i]; if (t > p - DAY && t <= p && D.other[i] === A.i) n++; });
      focus = { A, obs: n, exp: D.expected(p - DAY, p, D.ref.apHour, A.i * 24) };
    }
    const div = D.div.filter(d => d.t1 > p - W && d.t1 <= p && D.passesDiv(d)).length;
    return { obs, exp, links, active, st, gap, focus, div };
  };

  const metric = (k, v, s) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

  // called ~10×/s
  U.update = function () {
    const c = AD.currentCase();
    if (c.status !== 'ready') {
      const na = '<span title="unavailable">—</span>';
      $('metrics').innerHTML = metric('Traffic vs expected', na, 'no processed flight data') + metric('Active links', na, 'no processed flight data') + metric('Cancelled* · diverted*', na, 'no processed flight data');
      return;
    }
    const m = U.metrics();
    const sampleNote = c.kind === 'sample' ? ' · sample' : '';
    let m1, m2;
    if (m.gap) {
      // receiver gap: missing data, never zero
      m1 = metric('Traffic vs expected', '–', 'receiver gap · no data for this time');
      m2 = metric('Active links', '–', 'receiver gap · no data for this time');
    } else {
      // a percentage of almost nothing is not a finding (e.g. the night curfew): say so instead
      const quiet = m.exp < 5;
      const pct = quiet ? null : Math.round((m.obs / m.exp) * 100);
      m1 = metric('Traffic vs expected', pct == null ? '–' : `${pct}<small>%</small>`, quiet ? `${m.obs} of ${m.exp.toFixed(1)} movements · too few expected at this hour` : `${m.obs} of ${Math.round(m.exp)} movements · last 3 h${sampleNote}`);
      m2 = metric('Active links', m.links ? `${m.active}<small>/ ${m.links}</small>` : '–', m.links ? `routes flown vs normal · last 3 h${sampleNote}` : 'no routes normally active at this hour');
    }
    let m3;
    if (c.kind === 'derived') {
      m3 = metric('Cancelled* · diverted*', `${m.st.cancelled}<small>· ${m.st.diverted}</small>`,
        `of ${m.st.total} regular flights due · last 3 h<br>* inferred from ADS-B, not confirmed` +
        (c.official ? `<br>official, whole day: ${c.official.value} cancelled (dpa) · separate from the data` : ''));
    } else if (c.kind === 'sample') {
      // official totals stay separate from the observed sample
      m3 = metric(c.official.label, c.official.value.replace(' · ', '<small> · ') + '</small>', `${c.official.sub}<br>observed in sample: ${m.div} diverted* in the last 3 h`);
    } else if (m.focus) {
      const low = m.focus.exp >= 1 && m.focus.obs < 0.3 * m.focus.exp;
      m3 = metric(`Tel Aviv route (${m.focus.A.iata})`, `${m.focus.obs}<small>/ ${m.focus.exp.toFixed(0)}</small>`,
        `<span class="${low ? 'alert' : ''}">flydubai movements at ${m.focus.A.iata}, last 24 h vs normal</span>`);
    }
    $('metrics').innerHTML = m1 + m2 + (m3 || '');
    if (!$('info').hidden) AD.info.update();
  };

  return U;
})();
