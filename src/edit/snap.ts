import { app } from '../core/app';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { ellipsePts, splinePoints } from '../geom/curves';
import { add, arcPt, arcSpan, dist, dot, midp, mulv, sub } from '../geom/math';
import { distPrim, interPts, prims } from '../geom/prims';
import { entBounds } from '../model/bounds';
import { toWorld } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { isVisible } from '../render/style';

export function findSnap(sx, sy, base) {
  const tol = 12 / state.scale, w = toWorld(sx, sy), cands = [];
  for (const e of app.model.entities) {
    if (!isVisible(e)) continue;
    const b = entBounds(e);
    if (!b || w.x < b.minX - tol || w.x > b.maxX + tol || w.y < b.minY - tol || w.y > b.maxY + tol) continue;
    cands.push(e);
    if (cands.length > 300) break;
  }
  let best = null, bd = tol;
  const consider = (p, kind) => { if (!p) return; const d = dist(p, w); if (d <= bd + 1e-12) { bd = d; best = { x: p.x, y: p.y, kind }; } };
  const near = [];
  for (const e of cands) {
    if (e.type === 'INSERT') { consider(e.position, 'ins'); continue; }
    if (e.type === 'TEXT') { consider(e.startPoint, 'ins'); continue; }
    if (e.type === 'MTEXT') { consider(e.position, 'ins'); continue; }
    if (e.type === 'POINT') { consider(e.position, 'node'); continue; }
    if (e.type === 'DIMENSION') continue;
    const ps = prims(e);
    if (e.type === 'ELLIPSE' || e.type === 'SPLINE') { const pts = e.type === 'ELLIPSE' ? ellipsePts(e) : splinePoints(e); consider(pts[0], 'end'); consider(pts[pts.length - 1], 'end'); if (e.type === 'ELLIPSE') consider(e.center, 'cen'); }
    for (const q of ps) {
      if (distPrim(w, q) <= tol) near.push(q);
      if (q.s) continue;
      if (q.t === 'L') { consider(q.a, 'end'); consider(q.b, 'end'); consider(midp(q.a, q.b), 'mid'); }
      else {
        consider(q.c, 'cen');
        if (q.t === 'A') { consider(arcPt(q, q.a0), 'end'); consider(arcPt(q, q.a1), 'end'); consider(arcPt(q, q.a0 + arcSpan(q.a0, q.a1) / 2), 'mid'); }
      }
    }
  }
  const nn = near.slice(0, 40);
  for (let i = 0; i < nn.length; i++) for (let j = i + 1; j < nn.length; j++) for (const p of interPts(nn[i], nn[j])) consider(p, 'int');
  if (base) for (const q of nn) {
    if (q.t !== 'L') continue;
    const d = sub(q.b, q.a), L2 = dot(d, d); if (!L2) continue;
    const t = dot(sub(base, q.a), d) / L2;
    if (t >= 0 && t <= 1) consider(add(q.a, mulv(d, t)), 'per');
  }
  return best;
}

export function updateCursor(sx, sy) {
  state.mouse = { x: sx, y: sy };
  let w = toWorld(sx, sy);
  state.snapPt = null;
  const wantPoint = app.req && (app.req.kind === 'point' || ((app.req.kind === 'dist' || app.req.kind === 'angle') && app.req.opts.base));
  if (wantPoint && app.model) {
    if (state.osnap) { const s = findSnap(sx, sy, app.req.opts.base); if (s) { state.snapPt = s; w = { x: s.x, y: s.y }; } }
    if (!state.snapPt) {
      if (state.snap) w = { x: Math.round(w.x / state.snapStep) * state.snapStep, y: Math.round(w.y / state.snapStep) * state.snapStep };
      if (state.ortho && app.req.opts.base) { const b = app.req.opts.base; w = Math.abs(w.x - b.x) >= Math.abs(w.y - b.y) ? { x: w.x, y: b.y } : { x: b.x, y: w.y }; }
    }
  }
  state.world = w;
  updateCoords();
  drawOverlay();
}

export function updateCoords() {
  if (!state.mouse || !state.world) { $('coords').textContent = 'X: —  Y: —'; return; }
  const dec = Math.max(0, Math.min(6, Math.ceil(Math.log10(state.scale))));
  $('coords').textContent = `X: ${state.world.x.toFixed(dec)}  Y: ${state.world.y.toFixed(dec)}`;
}
