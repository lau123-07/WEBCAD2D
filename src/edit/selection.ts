import { expandGroups } from '../model/groups';
import { app } from '../core/app';
import { TAU } from '../core/constants';
import { state } from '../core/state';
import { arcPt, arcSpan } from '../geom/math';
import { distPrim, lineParamsWith, prims } from '../geom/prims';
import { imageCorners } from '../io/image';
import { entBounds } from '../model/bounds';
import { pointInPoly, textBox } from '../model/text';
import { explodeEnt } from '../model/transform';
import { requestDraw, toWorld } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { selectable } from '../render/style';
import { log } from '../ui/commandline';
import { renderProps } from '../ui/props-panel';

export function flatPrims(e, depth = 0) {
  if (depth === 0 && e._fp) return e._fp;
  let out;
  if (e.type === 'INSERT' || e.type === 'DIMENSION') out = depth > 4 ? [] : (explodeEnt(e) || []).flatMap(c => flatPrims(c, depth + 1));
  else if (e.type === 'TEXT' || e.type === 'MTEXT') { const bx = textBox(e) || []; out = bx.map((p, i) => ({ t: 'L', a: p, b: bx[(i + 1) % 4] })); }
  else if (e.type === 'POINT') out = e.position ? [{ t: 'L', a: e.position, b: e.position }] : [];
  else if (e.type === 'HATCH') { out = []; for (const lp of e.loops || []) lp.forEach((p, i) => out.push({ t: 'L', a: p, b: lp[(i + 1) % lp.length] })); }
  else if (e.type === 'XIMAGE') { const c = imageCorners(e); out = c.map((p, i) => ({ t: 'L', a: p, b: c[(i + 1) % 4] })); }
  else out = prims(e);
  if (depth === 0) e._fp = out;
  return out;
}

export function hitDist(e, w) {
  if (e.type === 'TEXT' || e.type === 'MTEXT') { const bx = textBox(e); if (bx && pointInPoly(w, bx)) return 0; }
  let d = Infinity;
  for (const q of flatPrims(e)) d = Math.min(d, distPrim(w, q));
  return d;
}

export function hatchContains(e, w) {
  let inside = false;
  for (const lp of e.loops || []) if (pointInPoly(w, lp)) inside = !inside;
  return inside;
}

export function pickAt(w) {
  const tol = 6 / state.scale;
  let best = null, bd = tol;
  for (let i = app.model.entities.length - 1; i >= 0; i--) {
    const e = app.model.entities[i];
    if (!selectable(e)) continue;
    const b = entBounds(e);
    if (!b || w.x < b.minX - tol || w.x > b.maxX + tol || w.y < b.minY - tol || w.y > b.maxY + tol) continue;
    let d = hitDist(e, w);
    // un sombreado también se elige haciendo clic adentro, pero con menos prioridad que las líneas
    if (e.type === 'HATCH') d = (d > tol && hatchContains(e, w)) ? tol * 0.999 : d + tol * 0.5;
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

export function primTouchesRect(q, r) {
  const inR = p => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
  let segs;
  if (q.t === 'L') segs = [[q.a, q.b]];
  else {
    const a0 = q.t === 'C' ? 0 : q.a0, span = q.t === 'C' ? TAU : arcSpan(q.a0, q.a1), pts = [];
    for (let i = 0; i <= 64; i++) pts.push(arcPt(q, a0 + span * i / 64));
    segs = pts.slice(1).map((p, i) => [pts[i], p]);
  }
  const corners = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];
  const edges = corners.map((c, i) => ({ t: 'L', a: c, b: corners[(i + 1) % 4] }));
  return segs.some(([a, b]) => inR(a) || inR(b) || edges.some(ed => lineParamsWith(a, b, ed).some(t => t >= 0 && t <= 1)));
}

export function setSel(list, mode) {
  list = expandGroups(list);
  if (mode === 'remove') list.forEach(e => state.sel.delete(e));
  else list.forEach(e => state.sel.add(e));
  requestDraw(); renderProps(); drawOverlay();
}

export function clearSel() { if (state.sel.size) { state.sel.clear(); requestDraw(); renderProps(); drawOverlay(); } }

export function finishWindow(p, shift) {
  const a = toWorld(app.winStart.x, app.winStart.y), b = toWorld(p.x, p.y);
  const r = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
  const crossing = p.x < app.winStart.x;
  app.winStart = null;
  const found = app.model.entities.filter(e => {
    if (!selectable(e)) return false;
    const bb = entBounds(e); if (!bb) return false;
    if (bb.minX >= r.minX && bb.maxX <= r.maxX && bb.minY >= r.minY && bb.maxY <= r.maxY) return true;
    if (!crossing || bb.maxX < r.minX || bb.minX > r.maxX || bb.maxY < r.minY || bb.minY > r.maxY) return false;
    return flatPrims(e).some(q => primTouchesRect(q, r));
  });
  setSel(found, shift ? 'remove' : 'add');
  if (app.req && app.req.kind === 'select') log(`${found.length} encontrado(s), ${state.sel.size} en total.`);
  drawOverlay();
}
