'use strict';
// MAIN — p5 lifecycle: load, clock, layout, draw, input, export.

const TL_H = 120;
let lastUi = 0, scrubbing = false;

function setup() {
  const st = document.getElementById('stage');
  const c = createCanvas(st.clientWidth, st.clientHeight);
  c.parent(st);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  AD.ready = false;
  init();
}

async function init() {
  const msg = document.getElementById('msg');
  try {
    await AD.useCase(AD.state.caseId);
  } catch (e) {
    msg.textContent = `Could not load ${AD.currentCase().dataUrl}. Open this page through a local server (not file://). ` + e.message;
    noLoop();
    return;
  }
  AD.state.p = AD.currentCase().phases[0].a;     // open at the start of "Before", in motion
  AD.ui.init();
  AD.ready = true;
  msg.remove();
  AD.geoLayer.load(AD.cfg.countriesUrl);         // async; outlines appear when ready
  AD.geo.loadLand(AD.cfg.landUrl);
}

// ---- one dataset per case; switching re-centres the map and resets per-case caches ----
AD.datasets = {};
AD.useCase = async function (id) {
  const c = AD.caseById[id];
  if (c.status !== 'ready') return false;
  Object.assign(AD.cfg, c.cfg);
  AD.geo.setCenter(c.geo.focus.lat, c.geo.focus.lon);
  if (!AD.datasets[id]) {
    const D = AD.makeData();
    AD.data = D;
    await D.load(c.dataUrl);
    AD.datasets[id] = D;
  }
  AD.data = AD.datasets[id];
  AD.geo.setCenter(AD.data.hub.lat, AD.data.hub.lon);
  AD.geo.reproject();
  AD.data.recompute();
  if (c.kind === 'derived' && !AD.data.sched) AD.schedule.build();
  AD.story.recompute();
  AD.modes.network.bbox = null; AD.modes.network.inten = null;
  AD.modes.field.nodes = null; AD.modes.flow.built = false;
  if (AD.ui && AD.ui.syncRef) AD.ui.syncRef();
  return true;
};

function layout() {
  const pad = 18;
  return {
    viz: { x: pad, y: 26, w: width - pad * 2, h: height - TL_H - 34 },
    tl: { x: pad + 6, y: height - TL_H + 4, w: width - pad * 2 - 12, h: TL_H - 10 },
  };
}

// C · Flow: network on the left, flight board on the right (or below on narrow screens)
function flowLayout(v) {
  if (v.w >= 820) {
    const bw = Math.min(330, Math.max(280, v.w * 0.3));
    return { net: { x: v.x, y: v.y - 16, w: v.w - bw - 20, h: v.h + 16 }, board: { x: v.x + v.w - bw, y: v.y + 6, w: bw, h: v.h - 6 } };
  }
  const bh = Math.min(250, v.h * 0.42);
  return { net: { x: v.x, y: v.y - 16, w: v.w, h: v.h - bh - 4 }, board: { x: v.x, y: v.y + v.h - bh, w: v.w, h: bh } };
}

function draw() {
  if (!AD.ready) return;
  const S = AD.state, cfg = AD.cfg, T = AD.themes[S.theme];
  const dt = Math.min(deltaTime, 100) / 1000;
  const flow = S.mode === 'flow';
  // every mode runs the same clock: three phases with equal screen time (shared timeline)
  if (S.playing && !scrubbing && (!flow || S.flow.motion)) AD.story.advance(dt);   // "Stop motion" is a Flow control
  const ctx = drawingContext, L = layout();
  ctx.save();
  ctx.fillStyle = AD.col(T.bg); ctx.fillRect(0, 0, width, height);
  // one layout for all four modes: phase title, visualization, flight board, three-panel timeline
  const FL = flowLayout(L.viz);
  if (flow) {
    if (!AD.modes.flow.built) AD.modes.flow.build();
    AD.modes.flow.update(dt);
    if (FL.net.w > 120 && FL.net.h > 120) AD.modes.flow.draw(ctx, FL.net, T);
  } else if (AD.currentCase().status === 'ready') {
    const v = { x: FL.net.x, y: FL.net.y + 66, w: FL.net.w, h: FL.net.h - 66 };   // below the phase title
    if (v.w > 120 && v.h > 120) AD.modes[S.mode].draw(ctx, v, T);
  }
  if (AD.currentCase().status === 'ready' && AD.data.inGap(S.p)) {
    ctx.fillStyle = AD.col(T.bg, 0.55); ctx.fillRect(FL.net.x, FL.net.y + 60, FL.net.w, FL.net.h - 60);
    ctx.font = `11px ${AD.FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = AD.col(T.ink);
    ctx.fillText('RECEIVER GAP — NO DATA FOR THIS TIME', FL.net.x + FL.net.w / 2, FL.net.y + FL.net.h / 2);
    ctx.fillStyle = AD.col(T.muted); ctx.fillText('missing coverage, not zero flights', FL.net.x + FL.net.w / 2, FL.net.y + FL.net.h / 2 + 16);
  }
  AD.story.drawTitle(ctx, FL.net, T);
  AD.board.draw(ctx, FL.board, T);
  AD.story.draw(ctx, L.tl, T);
  ctx.restore();

  if (millis() - lastUi > 100) { AD.ui.update(); lastUi = millis(); }
}

function windowResized() {
  const st = document.getElementById('stage');
  resizeCanvas(st.clientWidth, st.clientHeight);
}

const activeTimeline = () => AD.story;          // the shared three-panel timeline in every mode
function mousePressed() {
  if (AD.ready && activeTimeline().hit(mouseX, mouseY)) { scrubbing = true; activeTimeline().scrub(mouseX); }
}
function mouseDragged() { if (scrubbing) activeTimeline().scrub(mouseX); }
function mouseReleased() { scrubbing = false; }

AD.exportPNG = function () {
  const S = AD.state, d = AD.time.date(S.p).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  saveCanvas(`air-disruption_${S.caseId}_${S.mode}_${d}`, 'png');
};
