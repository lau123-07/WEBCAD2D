import { clampPath } from '../model/zones';
import { ZONE_MSG, flashInvalid, violates } from '../model/zones';
/* Arrastrar con el mouse lo seleccionado para moverlo (con Ctrl al soltar, deja una copia) */
import { app } from '../core/app';
import { state } from '../core/state';
import { Tm, dist } from '../geom/math';
import { regroup } from '../model/groups';
import { applyXform, cloneEnt } from '../model/transform';
import { pushUndo, snapshot } from '../model/undo';
import { requestDraw, toWorld } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { selectable } from '../render/style';
import { log, previewXf } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';
import { findSnap } from './snap';

let drag: any = null;
export const dragging = () => !!(drag && drag.active);
/* Si en el camino choca con el retiro, se queda en el último lugar permitido */
function stopAt(d, to) {
  const dx = to.x - d.from.x, dy = to.y - d.from.y;
  const t = clampPath(k => previewXf(d.sel, Tm(dx * k, dy * k)));
  return { x: d.from.x + dx * t, y: d.from.y + dy * t };
}

function target(sx: number, sy: number) {
  let w = toWorld(sx, sy);
  if (state.osnap && app.model) { const s = findSnap(sx, sy, drag ? drag.from : null); if (s) w = { x: s.x, y: s.y }; }
  if (drag && state.ortho) { const b = drag.from; w = Math.abs(w.x - b.x) >= Math.abs(w.y - b.y) ? { x: w.x, y: b.y } : { x: b.x, y: w.y }; }
  return w;
}

/* Se llama al apretar sobre algo que ya está seleccionado */
export function dragDown(sx: number, sy: number) {
  const s = state.osnap && app.model ? findSnap(sx, sy, null) : null;
  drag = { down: { x: sx, y: sy }, from: s ? { x: s.x, y: s.y } : toWorld(sx, sy), active: false, sel: [...state.sel].filter(selectable) };
}

export function dragMove(sx: number, sy: number) {
  if (!drag) return false;
  if (!drag.active) {
    if (dist({ x: sx, y: sy }, drag.down) < 6) return true;
    drag.active = true; requestDraw();
  }
  drag.to = stopAt(drag, target(sx, sy));
  drawOverlay();
  return true;
}

export function dragUp(sx: number, sy: number, copy: boolean) {
  if (!drag) return false;
  const d = drag; drag = null;
  if (!d.active) return true;
  const raw = target(sx, sy), to = stopAt(d, raw), M = Tm(to.x - d.from.x, to.y - d.from.y);
  if (dist(raw, to) > 1e-6) log('Se frenó al tocar el retiro.', 'warn');
  if (Math.hypot(to.x - d.from.x, to.y - d.from.y) < 1e-9) { requestDraw(); return true; }
  const moved = d.sel.map(e => { const c = cloneEnt(e); return applyXform(c, M) ? c : null; }).filter(Boolean);
  if (moved.some(c => violates(c))) { flashInvalid(moved.filter(c => violates(c))); log(ZONE_MSG, 'err'); requestDraw(); return true; }
  const snap = snapshot();
  if (copy) {
    const copies = regroup(d.sel.map(e => { const c = cloneEnt(e); return applyXform(c, M) ? c : null; }).filter(Boolean));
    app.model.entities.push(...copies);
  } else for (const e of d.sel) applyXform(e, M);
  app.editCount++; pushUndo(snap); requestDraw(); renderLayers();
  log(`${copy ? 'Copiado' : 'Movido'}: ${d.sel.length} objeto(s).`, 'res');
  return true;
}

export function cancelDrag() { if (drag) { drag = null; requestDraw(); drawOverlay(); } }

/* Vista previa punteada mientras se arrastra, y el tramo desde donde se agarró */
export function drawDrag(g: CanvasRenderingContext2D, setWorld: (c: CanvasRenderingContext2D) => void, drawList: any) {
  if (!drag || !drag.active || !drag.to) return null;
  const M = Tm(drag.to.x - drag.from.x, drag.to.y - drag.from.y);
  const prev = app.G; app.G = g; setWorld(g);
  g.setLineDash([7 / state.scale, 5 / state.scale]);
  const ghost = previewXf(drag.sel, M), bad = ghost.some(c => violates(c));
  drawList(ghost, null, null, 0, bad ? '#ff4d4d' : '#7cc4ff');
  g.setLineDash([]); app.G = prev; g.globalAlpha = 1;
  return { from: drag.from, to: drag.to, bad };
}
