import { dragging } from './drag';
import { measureCircle, measureMove, measureSeg } from '../render/measure';
/* Grips: los cuadraditos azules en los puntos de lo seleccionado. Se arrastran para estirar o mover. */
import { arc3 } from '../commands/draw';
import { app } from '../core/app';
import { state } from '../core/state';
import { Tm, arcSpan, dist, midp } from '../geom/math';
import { polyVerts } from '../geom/prims';
import { applyXform, cloneEnt } from '../model/transform';
import { touched } from '../model/undo';
import { toScreen } from '../render/draw';
import { getPt } from '../ui/commandline';

const arcP = (e, a) => ({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) });

export function gripsOf(e): { p: { x: number; y: number }; k: string }[] {
  switch (e.type) {
    case 'LINE': return [{ p: e.vertices[0], k: 'v0' }, { p: e.vertices[1], k: 'v1' }, { p: midp(e.vertices[0], e.vertices[1]), k: 'mid' }];
    case 'LWPOLYLINE': case 'POLYLINE': return polyVerts(e).map((p, i) => ({ p, k: 'v' + i }));
    case 'CIRCLE': return [{ p: e.center, k: 'c' }, ...[0, 1, 2, 3].map(i => ({ p: arcP(e, i * Math.PI / 2), k: 'q' + i }))];
    case 'ARC': return [{ p: e.center, k: 'c' }, { p: arcP(e, e.startAngle), k: 's' }, { p: arcP(e, e.endAngle), k: 'e' },
      { p: arcP(e, e.startAngle + arcSpan(e.startAngle, e.endAngle) / 2), k: 'm' }];
    case 'ELLIPSE': return [{ p: e.center, k: 'c' }];
    case 'TEXT': return [{ p: e.startPoint, k: 't' }];
    case 'MTEXT': return [{ p: e.position, k: 't' }];
    case 'INSERT': return [{ p: e.position, k: 't' }];
    case 'POINT': return [{ p: e.position, k: 't' }];
    case 'XIMAGE': return [{ p: e.p, k: 't' }];
    case 'SOLID': return (e.points || []).filter(Boolean).map((p, i) => ({ p, k: 'p' + i }));
    case 'XDIM': return [{ p: e.p1, k: 'p1' }, { p: e.p2, k: 'p2' }, { p: e.pos, k: 'pos' }];
    case 'XDIMR': return [{ p: e.pos, k: 'pos' }];
    case 'XNORTH': return [{ p: e.p, k: 't' }, { p: { x: e.p.x + Math.cos(e.ang) * e.size, y: e.p.y + Math.sin(e.ang) * e.size }, k: 'n' }];
    case 'XDIMA': { const m = e.a0 + arcSpan(e.a0, e.a1) / 2; return [{ p: { x: e.P.x + e.rad * Math.cos(m), y: e.P.y + e.rad * Math.sin(m) }, k: 'pos' }]; }
    default: return [];
  }
}

/* Mueve el grip k de la entidad e desde gp hasta np */
export function applyGrip(e, k: string, np, gp) {
  const set = (p, q) => { p.x = q.x; p.y = q.y; };
  if (k === 'mid' || k === 'c' || k === 't') { applyXform(e, Tm(np.x - gp.x, np.y - gp.y)); return; }
  switch (e.type) {
    case 'LINE': set(e.vertices[k === 'v0' ? 0 : 1], np); break;
    case 'LWPOLYLINE': case 'POLYLINE': { const v = polyVerts(e)[+k.slice(1)]; if (v) set(v, np); break; }
    case 'CIRCLE': { const r = dist(e.center, np); if (r > 0) e.radius = r; break; }
    case 'ARC': {
      const sp = arcP(e, e.startAngle), ep = arcP(e, e.endAngle), mp = arcP(e, e.startAngle + arcSpan(e.startAngle, e.endAngle) / 2);
      const q = k === 's' ? arc3(np, mp, ep) : k === 'e' ? arc3(sp, mp, np) : arc3(sp, np, ep);
      if (q) { e.center = { x: q.c.x, y: q.c.y }; e.radius = q.r; e.startAngle = q.a0; e.endAngle = q.a1; }
      break;
    }
    case 'SOLID': { const p = e.points[+k.slice(1)]; if (p) set(p, np); break; }
    case 'XDIM': set(e[k], np); break;
    case 'XDIMR': set(e.pos, np); break;
    case 'XNORTH': if (k === 'n') e.ang = Math.atan2(np.y - e.p.y, np.x - e.p.x); break;
    case 'XDIMA': { const r = dist(e.P, np); if (r > 0) e.rad = r; break; }
  }
}

const MAX_SEL = 200;
export function gripAt(sx: number, sy: number) {
  if (app.running || app.req || !state.sel.size) return null;
  let n = 0;
  for (const e of state.sel) {
    if (++n > MAX_SEL) break;
    for (const g of gripsOf(e)) {
      const s = toScreen(g.p);
      if (Math.abs(s.x - sx) <= 6 && Math.abs(s.y - sy) <= 6) return { e, k: g.k, p: { x: g.p.x, y: g.p.y } };
    }
  }
  return null;
}

export function drawGrips(g: CanvasRenderingContext2D) {
  if (app.running || !state.sel.size || dragging()) return;
  const hov = state.mouse ? gripAt(state.mouse.x, state.mouse.y) : null;
  let n = 0;
  for (const e of state.sel) {
    if (++n > MAX_SEL) break;
    for (const gr of gripsOf(e)) {
      const s = toScreen(gr.p), x = Math.round(s.x) - 4, y = Math.round(s.y) - 4;
      const hot = hov && hov.e === e && hov.k === gr.k;
      g.fillStyle = hot ? '#ff5b5b' : '#3d7eff'; g.strokeStyle = '#0d1a33'; g.lineWidth = 1;
      g.fillRect(x, y, 8, 8); g.strokeRect(x + 0.5, y + 0.5, 8, 8);
    }
  }
}

/* "Comando" que se ejecuta al hacer clic en un grip */
export async function cmdGrip() {
  const g = app.gripPending; app.gripPending = null;
  if (!g) return;
  const r = await getPt('** ESTIRAR ** Precise punto de estiramiento:', { base: g.p, ghost: true, rubber: false, preview: q => { const c = cloneEnt(g.e); applyGrip(c, g.k, q, g.p); return [c]; },
    measure: q => g.e.type === 'LINE' && (g.k === 'v0' || g.k === 'v1') ? measureSeg(g.e.vertices[g.k === 'v0' ? 1 : 0], q)
      : g.e.type === 'CIRCLE' && g.k[0] === 'q' ? measureCircle(g.e.center, q) : measureMove(g.p, q) });
  if (r === 'ENTER') return;
  applyGrip(g.e, g.k, r, g.p);
  touched(g.e);
}
