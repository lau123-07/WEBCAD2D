import { newGroupId } from '../model/groups';
import { nice } from '../geom/math';
/* LX y LY: línea horizontal o vertical con una medida exacta (por defecto en metros).
   Ejemplos:  LX 37,5M   LY 40M   LX -12   LY 250cm
   Seguidas, cada línea arranca donde terminó la anterior. */
import { app } from '../core/app';
import { state } from '../core/state';
import { mkLine } from '../model/factory';
import { addEntity } from '../model/undo';
import { fmtM } from '../render/measure';
import { ask, drawingUnitMm, getPt, log, parseLength } from '../ui/commandline';

export const parseMeters = (s: string) => {
  const t = s.replace(/\s+/g, '').toLowerCase();
  return parseLength(/(mm|cm|km|m)$/.test(t) ? t : t + 'm');
};

/* Cota de la línea, del lado derecho del sentido de dibujo: en un contorno antihorario queda afuera */
export function autoDim(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  // si todavía no se eligió "Altura cotas", se toma un tamaño acorde a la medida y se mantiene para las siguientes
  if (!state.dimH) state.dimH = Math.max(state.textH * 0.8, nice(len / 60));
  const h = state.dimH;
  const nx = dy / len, ny = -dx / len, off = h * 3;
  const layer = app.model.layers.has('COTAS') ? 'COTAS' : state.curLayer;
  return { type: 'XDIM', layer, colorIndex: 256, p1: { ...a }, p2: { ...b },
    pos: { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off }, ang: Math.atan2(dy, dx), h };
}

export function cmdAutoDims() {
  app.lxDims = app.lxDims === false;
  log(app.lxDims ? 'LX y LY van a dibujar la cota de cada línea.' : 'LX y LY ya no dibujan cotas.', 'res');
}

export async function cmdLineXY(axis: 'X' | 'Y', args: string[]) {
  const name = axis === 'X' ? 'horizontal' : 'vertical';
  let L: number | null;
  if (args.length) L = parseMeters(args.join(''));
  else {
    const v = await ask('string', `L${axis} Línea ${name}: largo en metros (con - va ${axis === 'X' ? 'a la izquierda' : 'hacia abajo'}):`);
    if (v === 'ENTER') return;
    L = parseMeters(v);
  }
  if (L === null) { log(`Medida no válida. Ejemplos: L${axis} 37,5M   L${axis} -12   L${axis} 250cm`, 'err'); return; }
  if (Math.abs(L) < 1e-12) { log('El largo tiene que ser distinto de cero.', 'err'); return; }

  const endOf = (p, len) => axis === 'X' ? { x: p.x + len, y: p.y } : { x: p.x, y: p.y + len };
  // si la línea anterior fue LX o LY (y sigue siendo lo último dibujado), se continúa desde su extremo
  const last = app.lxLine;
  let start = null;
  if (last && app.lxEdit === app.editCount && (app.prevCmd === 'LX' || app.prevCmd === 'LY')) start = { ...last.vertices[1] };
  if (!start) {
    const p = await getPt(`Precise el punto de inicio de la línea ${name}:`, { preview: q => [mkLine(q, endOf(q, L))] });
    if (p === 'ENTER') return;
    start = p;
  }
  const e = mkLine(start, endOf(start, L));
  if (app.lxDims !== false) { e.group = newGroupId(); addEntity(e); addEntity(Object.assign(autoDim(e.vertices[0], e.vertices[1]), { group: e.group })); }
  else addEntity(e);
  app.lxLine = e;
  app.lxEdit = app.editCount;
  state.lastPt = { ...e.vertices[1] };
  const metros = Math.abs(L) * drawingUnitMm() / 1000;
  log(`Línea ${name} de ${fmtM(metros)} m ${L < 0 ? (axis === 'X' ? 'hacia la izquierda' : 'hacia abajo') : (axis === 'X' ? 'hacia la derecha' : 'hacia arriba')}. Seguí con LX o LY para continuar desde su extremo.`, 'res');
}
