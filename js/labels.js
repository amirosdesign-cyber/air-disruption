'use strict';
// LABELS — greedy, deterministic label placement (no overlaps).
// Items are placed in priority order. Each tries its candidate offsets in turn;
// the first box that stays inside `bounds` and touches no earlier box wins.
// A label with no free spot is dropped (low-priority labels go first).
//
// item: { x, y, lines: [text, …], color, font, pri, cands: [[dx, dy, align], …] }

AD.labels = (() => {
  const L = { LH: 11 };

  const hits = (b, boxes) => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

  // reserve a box (e.g. a node, the hub label) so labels avoid it
  L.box = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

  L.place = function (ctx, items, bounds, taken = []) {
    const boxes = taken.slice(), out = [];
    items.sort((a, b) => b.pri - a.pri);
    for (const it of items) {
      ctx.font = it.font;
      const w = Math.max(...it.lines.map(t => ctx.measureText(t).width));
      const h = 8 + (it.lines.length - 1) * L.LH;
      for (const [dx, dy, align] of it.cands) {
        const x = it.x + dx, y = it.y + dy;
        const bx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
        const b = { x0: bx - 2, y0: y - 8, x1: bx + w + 2, y1: y - 8 + h + 2 };
        if (bounds && (b.x0 < bounds.x || b.x1 > bounds.x + bounds.w || b.y0 < bounds.y || b.y1 > bounds.y + bounds.h)) continue;
        if (hits(b, boxes)) continue;
        boxes.push(b); out.push({ it, x, y, align });
        break;
      }
    }
    for (const { it, x, y, align } of out) {
      ctx.font = it.font; ctx.textAlign = align; ctx.fillStyle = it.color;
      it.lines.forEach((t, k) => ctx.fillText(t, x, y + k * L.LH));
    }
    return out.length;
  };

  // candidates around a point at clearance r: right, left, above, below, then diagonals
  L.around = r => [
    [r + 3, 3, 'left'], [-r - 3, 3, 'right'], [0, -r - 4, 'center'], [0, r + 10, 'center'],
    [r + 2, -r - 2, 'left'], [r + 2, r + 8, 'left'], [-r - 2, -r - 2, 'right'], [-r - 2, r + 8, 'right'],
  ];

  // candidates for a radial layout: outward first, then a little further out, then sideways
  L.radial = (ox, oy, off) => {
    const al = Math.abs(ox) < 0.25 ? 'center' : ox > 0 ? 'left' : 'right';
    const at = d => [ox * d, oy * d + 3 + (oy > 0.6 ? 4 : oy < -0.6 ? -2 : 0), al];
    return [at(off), at(off + 9), [at(off)[0], at(off)[1] - 10, al], [at(off)[0], at(off)[1] + 10, al], at(off + 20)];
  };

  return L;
})();
