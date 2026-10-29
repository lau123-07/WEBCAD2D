import { northEnts } from './north';
import { app } from '../core/app';
import { ellipsePts, splinePoints } from '../geom/curves';
import { I, mul, xf } from '../geom/math';
import { imageCorners } from '../io/image';
import { textBox } from './text';
import { xdimEnts } from './xdim';
import { insertMatrix } from '../render/draw';
import { entityStyle } from '../render/style';

export const newBox = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export function addB(b, p) {
  if (!isFinite(p.x) || !isFinite(p.y)) return;
  if (p.x < b.minX) b.minX = p.x; if (p.x > b.maxX) b.maxX = p.x;
  if (p.y < b.minY) b.minY = p.y; if (p.y > b.maxY) b.maxY = p.y;
}

export function entPoints(e, m, lay, depth, b, vis) {
  const A = p => p && addB(b, xf(m, p));
  switch (e.type) {
    case 'LINE': case '3DFACE': case 'LWPOLYLINE': case 'POLYLINE': (e.vertices || []).forEach(A); break;
    case 'CIRCLE': case 'ARC': { const c = e.center, r = e.radius; A({ x: c.x - r, y: c.y - r }); A({ x: c.x + r, y: c.y + r }); A({ x: c.x - r, y: c.y + r }); A({ x: c.x + r, y: c.y - r }); break; }
    case 'ELLIPSE': ellipsePts(e).forEach(A); break;
    case 'SPLINE': splinePoints(e).forEach(A); break;
    case 'SOLID': (e.points || []).forEach(A); break;
    case 'POINT': A(e.position); break;
    case 'TEXT': case 'MTEXT': (textBox(e) || []).forEach(A); break;
    case 'INSERT': case 'DIMENSION': {
      const blk = app.model.blocks[e.type === 'DIMENSION' ? e.block : e.name];
      if (blk) boundsWalk(blk.entities, mul(m, insertMatrix(e, blk)), lay, depth + 1, b, vis);
      break;
    }
    case 'XDIM': case 'XDIMR': case 'XDIMA': xdimEnts(e).forEach(s => entPoints(s, m, lay, depth, b, vis)); break;
    case 'XIMAGE': imageCorners(e).forEach(A); break;
    case 'XNORTH': northEnts(e).forEach(s => entPoints(s, m, lay, depth, b, vis)); break;
    case 'XZONE': A({ x: e.x0, y: e.y0 }); A({ x: e.x1, y: e.y1 }); break;
    case 'HATCH': (e.loops || []).forEach(lp => lp.forEach(A)); break;
  }
}

export function boundsWalk(list, m, pL, depth, b, vis) {
  if (!list || depth > 16) return;
  for (const e of list) {
    if (e.inPaperSpace || e.visible === false) continue;
    let lay;
    if (vis) { const st = entityStyle(e, pL, null); if (!st) continue; lay = st.layer; }
    else lay = ((e.layer === '0' || e.layer === undefined) && pL) ? pL : e.layer;
    try { entPoints(e, m, lay, depth, b, vis); } catch (err) { /* se ignora */ }
  }
}

export function entBounds(e) {
  if (e._bb !== undefined) return e._bb;
  const b = newBox();
  try { entPoints(e, I, e.layer, 0, b, false); } catch (err) { /* se ignora */ }
  return (e._bb = isFinite(b.minX) ? b : null);
}

export function computeBounds() {
  if (!app.model) return null;
  const b = newBox();
  boundsWalk(app.model.entities, I, null, 0, b, true);
  return isFinite(b.minX) ? b : null;
}

export function dirtyCache(e) { delete e._bb; delete e._pts; delete e._fp; delete e._hs; }
