/* =========================================================================
   Retiros (zona límite): dentro del rectángulo del terreno se define la franja
   de retiro de cada lado. Lo que invada esa franja no se permite: se marca en
   rojo y no se agrega (las cotas y los textos sí se permiten).
   ========================================================================= */
import { app } from '../core/app';
import { state, DPR } from '../core/state';
import { polyVerts } from '../geom/prims';
import { flatPrims } from '../edit/selection';
import { entBounds } from './bounds';
import { newGroupId } from './groups';
import { ensureLayer } from '../io/image';
import { addEntity } from './undo';
import { requestDraw } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { ask, log, parseLength } from '../ui/commandline';
import { fmtM } from '../render/measure';
import { drawingUnitMm } from '../ui/commandline';

const EXEMPT = new Set(['XNORTH', 'XZONE', 'XDIM', 'XDIMR', 'XDIMA', 'TEXT', 'MTEXT', 'XIMAGE', 'POINT', 'DIMENSION']);

export const inner = z => ({ x0: z.x0 + z.l, y0: z.y0 + z.b, x1: z.x1 - z.r, y1: z.y1 - z.t });
export const zones = () => (app.model ? app.model.entities.filter(e => e.type === 'XZONE') : []);

/* Recorta el segmento a al rectángulo R (Liang-Barsky). Devuelve los extremos recortados o null */
function clip(a, b, R) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy], q = [a.x - R.x0, R.x1 - a.x, a.y - R.y0, R.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-15) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
}

function segsOf(e) {
  const out = [];
  for (const q of flatPrims(e)) {
    if (q.t === 'L') { out.push([q.a, q.b]); continue; }
    const a0 = q.t === 'C' ? 0 : q.a0;
    let span = q.t === 'C' ? Math.PI * 2 : ((q.a1 - q.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (span < 1e-12) span = Math.PI * 2;
    const n = Math.max(12, Math.ceil(span / (Math.PI / 24)));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = a0 + span * i / n, p = { x: q.c.x + q.r * Math.cos(t), y: q.c.y + q.r * Math.sin(t) };
      if (prev) out.push([prev, p]); prev = p;
    }
  }
  return out;
}

/* ¿La entidad invade la franja de retiro de la zona z? */
function invades(e, z) {
  const lot = { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 }, I = inner(z);
  const eps = Math.max(z.x1 - z.x0, z.y1 - z.y0) * 1e-7;
  const b = entBounds(e);
  if (!b) return false;
  if (b.maxX < lot.x0 || b.minX > lot.x1 || b.maxY < lot.y0 || b.minY > lot.y1) return false;
  if (b.minX >= I.x0 - eps && b.maxX <= I.x1 + eps && b.minY >= I.y0 - eps && b.maxY <= I.y1 + eps) return false;
  const inI = p => p.x >= I.x0 - eps && p.x <= I.x1 + eps && p.y >= I.y0 - eps && p.y <= I.y1 + eps;
  for (const [a, c] of segsOf(e)) {
    const s = clip(a, c, lot);
    if (s && (!inI(s[0]) || !inI(s[1]))) return true;
  }
  return false;
}

export function violates(e, zs = zones()) {
  if (app.zoneOff || !zs.length || EXEMPT.has(e.type)) return false;
  for (const z of zs) {
    if (e.group && e.group === z.group) continue; // el propio terreno
    if (invades(e, z)) return true;
  }
  return false;
}
export function violators(list = app.model ? app.model.entities : []) {
  const zs = zones();
  if (!zs.length || app.zoneOff) return [];
  return list.filter(e => violates(e, zs));
}

/* Marca en rojo, por un momento, lo que no se permitió */
export function flashInvalid(ents: any[]) {
  app.flash = { ents, until: Date.now() + 2200 };
  drawOverlay();
  setTimeout(() => { if (app.flash && Date.now() >= app.flash.until) { app.flash = null; drawOverlay(); } }, 2300);
}
export const ZONE_MSG = 'No se puede: invade el retiro (la franja roja entre el terreno y la línea límite). Para dibujar ahí igual, escribí CONTROLRETIROS.';

/* Dibujo de la zona: franja sombreada, línea límite punteada y medidas de cada retiro */
export function drawZone(G: CanvasRenderingContext2D, e, col: string, override: string | undefined, drawText) {
  // el retiro se ve siempre en rojo, sin importar el color de la capa ni si está seleccionado
  const I = inner(e), c = app.printMode ? col : '#ff3b30';
  G.save();
  G.globalAlpha *= 0.24; G.fillStyle = c;
  G.beginPath(); G.rect(e.x0, e.y0, e.x1 - e.x0, e.y1 - e.y0); G.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0); G.fill('evenodd');
  G.globalAlpha /= 0.24;
  if (override) { G.lineWidth *= 1.5; }
  const m = G.getTransform(), px = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / DPR();
  G.setLineDash([9 / px, 6 / px]); G.strokeStyle = c;
  G.strokeRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
  G.setLineDash([]);
  // cada medida, del tamaño que entra en su franja
  const big = Math.max(e.x1 - e.x0, e.y1 - e.y0) / 60, hOf = w => Math.min(w * 0.35, big);
  const lab = v => fmtM(v * drawingUnitMm() / 1000) + ' m';
  if (e.l > 0) drawText(lab(e.l), e.x0 + e.l / 2, (e.y0 + e.y1) / 2, hOf(e.l), 90, 'center', 'middle', c);
  if (e.r > 0) drawText(lab(e.r), e.x1 - e.r / 2, (e.y0 + e.y1) / 2, hOf(e.r), 90, 'center', 'middle', c);
  if (e.t > 0) drawText(lab(e.t), (e.x0 + e.x1) / 2, e.y1 - e.t / 2, hOf(e.t), 0, 'center', 'middle', c);
  if (e.b > 0) drawText(lab(e.b), (e.x0 + e.x1) / 2, e.y0 + e.b / 2, hOf(e.b), 0, 'center', 'middle', c);
  G.restore();
}
export const zoneInnerPrims = e => { const I = inner(e), c = [{ x: I.x0, y: I.y0 }, { x: I.x1, y: I.y0 }, { x: I.x1, y: I.y1 }, { x: I.x0, y: I.y1 }]; return c.map((p, i) => ({ t: 'L', a: p, b: c[(i + 1) % 4] })); };

/* Al transformar: se recalcula el rectángulo del terreno y el de la zona edificable */
export function xformZone(e, xf) {
  const box = pts => ({ x0: Math.min(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), x1: Math.max(...pts.map(p => p.x)), y1: Math.max(...pts.map(p => p.y)) });
  const corners = R => [{ x: R.x0, y: R.y0 }, { x: R.x1, y: R.y0 }, { x: R.x1, y: R.y1 }, { x: R.x0, y: R.y1 }].map(xf);
  const L = box(corners(e)), I = box(corners(inner(e)));
  Object.assign(e, L, { l: I.x0 - L.x0, b: I.y0 - L.y0, r: L.x1 - I.x1, t: L.y1 - I.y1 });
}

/* RETIROS: elegir el rectángulo del terreno y escribir los retiros */
export async function cmdSetbacks() {
  const r = await ask('entity', 'RETIROS Designe el rectángulo del terreno:');
  if (r === 'ENTER') return;
  const lot = r.e;
  const v = (lot.type === 'LWPOLYLINE' || lot.type === 'POLYLINE') && lot.shape ? polyVerts(lot) : [];
  const xs = v.map(p => p.x), ys = v.map(p => p.y);
  const axisRect = v.length === 4 && v.every(p => (Math.abs(p.x - Math.min(...xs)) < 1e-6 || Math.abs(p.x - Math.max(...xs)) < 1e-6) && (Math.abs(p.y - Math.min(...ys)) < 1e-6 || Math.abs(p.y - Math.max(...ys)) < 1e-6));
  if (!axisRect) { log('Por ahora los retiros funcionan con un rectángulo derecho (hecho con REC).', 'warn'); return; }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const meters = s => parseLength(/(mm|cm|km|m)$/i.test(s.replace(/\s+/g, '')) ? s.replace(/\s+/g, '') : s.replace(/\s+/g, '') + 'm');
  const askSide = async (name: string) => {
    while (true) {
      const s = await ask('string', `Retiro ${name} en metros <0>:`);
      if (s === 'ENTER') return 0;
      const n = meters(s);
      if (n !== null && n >= 0) return n;
      log('Escribí una medida, por ejemplo 3 o 1,2 (metros) o 120cm.', 'err');
    }
  };
  const l = await askSide('izquierdo'), t = await askSide('de arriba'), rr = await askSide('derecho'), b = await askSide('de abajo');
  if (l + rr >= x1 - x0 || t + b >= y1 - y0) { log('Los retiros son más grandes que el terreno.', 'err'); return; }
  if (!lot.group) lot.group = newGroupId();
  const layer = ensureLayer('RETIROS', 1);
  addEntity({ type: 'XZONE', layer, colorIndex: 256, group: lot.group, x0, y0, x1, y1, l, t, r: rr, b });
  const m = n => fmtM(n * drawingUnitMm() / 1000);
  log(`Retiros: izquierda ${m(l)} m, arriba ${m(t)} m, derecha ${m(rr)} m, abajo ${m(b)} m. Lo que invada la franja roja no se va a permitir.`, 'res');
  const bad = violators();
  if (bad.length) { flashInvalid(bad); log(`Atención: ya hay ${bad.length} objeto(s) dentro del retiro (marcados en rojo).`, 'warn'); }
  requestDraw();
}

export function cmdZoneToggle() {
  app.zoneOff = !app.zoneOff;
  log(app.zoneOff ? 'Control de retiros desactivado: se puede dibujar en la franja de retiro.' : 'Control de retiros activado.', app.zoneOff ? 'warn' : 'res');
  requestDraw();
}

/* Para mover o rotar sin entrar al retiro: recorre el camino de t=0 a t=1 y devuelve hasta dónde se puede llegar.
   mk(t) arma las copias en la posición t. Si ya arranca invadiendo, no frena (para no trabar lo que ya estaba). */
export function clampPath(mk: (t: number) => any[], steps = 48) {
  if (app.zoneOff || !zones().length) return 1;
  const bad = t => mk(t).some(e => violates(e));
  if (bad(0)) return 1;
  let last = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (bad(t)) {
      let lo = last, hi = t;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (bad(m)) hi = m; else lo = m; }
      return lo;
    }
    last = t;
  }
  return 1;
}
