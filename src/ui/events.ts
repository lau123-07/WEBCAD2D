import { cancelDrag } from '../edit/drag';
import { app } from '../core/app';
import { $, ov } from '../core/dom';
import { state } from '../core/state';
import { clearSel } from '../edit/selection';
import { updateCursor } from '../edit/snap';
import { fmt } from '../geom/math';
import { requestDraw } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { cancelAll, log } from './commandline';
import { closeColorMenu } from './layers-panel';

export function setToggle(name, on) {
  state[name] = on;
  const id = { grid: 'tgGrid', snap: 'tgSnap', ortho: 'tgOrtho', osnap: 'tgOsnap', lwDisplay: 'tgLw', dyn: 'tgDyn' }[name];
  $(id).setAttribute('aria-pressed', String(on));
  const label = { grid: 'Grilla', snap: `Snap (cada ${fmt(state.snapStep)})`, ortho: 'Ortho', osnap: 'Osnap', lwDisplay: 'Grosores de línea', dyn: 'Medidas en vivo' }[name];
  log(`${label}: ${on ? 'activado' : 'desactivado'}.`);
  if (name === 'grid' || name === 'lwDisplay') requestDraw();
  if (state.mouse) updateCursor(state.mouse.x, state.mouse.y);
}

export function escape() {
  closeColorMenu();
  cancelDrag();
  if (app.winStart) { app.winStart = null; drawOverlay(); return; }
  if (app.req || app.running) { cancelAll(); return; }
  app.lxLine = null; // Esc corta la cadena de LX / LY
  clearSel();
}

export function localPos(e) { const r = ov.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
