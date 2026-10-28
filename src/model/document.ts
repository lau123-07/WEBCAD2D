import { app } from '../core/app';
import { UNITS } from '../core/constants';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { nice } from '../geom/math';
import { computeBounds } from './bounds';
import { redoStack, undoStack, updateTitle, updateUndoButtons } from './undo';
import { zoomExtents } from '../render/view';
import { cancelAll, log } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';
import { renderProps } from '../ui/props-panel';

export function loadModel(m, name, announce) {
  cancelAll();
  m.images = m.images || {};
  m.linetypes = m.linetypes || new Map();
  app.model = m;
  state.sel.clear(); undoStack.length = 0; redoStack.length = 0; updateUndoButtons();
  state.curLayer = app.model.layers.has('0') ? '0' : [...app.model.layers.keys()][0];
  app.fileName = name; app.fileHandle = null; app.dirty = false; updateTitle();
  zoomExtents();
  const b = computeBounds();
  const span = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : (m.units === 6 ? 10 : m.units === 5 ? 1000 : 10000);
  state.textH = nice(span / 45); state.lastR = nice(span / 20); state.offD = nice(span / 60);
  state.snapStep = nice(span / 100);
  if (!m.ltscale) m.ltscale = nice(span / (150 * 12.7));
  app.hatchScale = nice(span / 120 / 3.175);
  renderLayers(); renderProps(); updateCount();
  $('units').textContent = 'Unidades: ' + (UNITS[m.units] || 'sin definir');
  const sk = Object.entries(m.skipped || {}), skTxt = sk.map(([t, c]) => `${t} (${c})`).join(', ');
  $('unsupported').textContent = sk.length ? 'No se muestran: ' + skTxt : '';
  $('unsupported').title = sk.length ? 'Estos objetos todavía no están soportados. Si guardás, no se incluyen en el archivo nuevo.' : '';
  if (announce) log(`Abierto: ${name}. ${m.entities.length.toLocaleString('es-AR')} objetos en ${m.layers.size} capas.`, 'ok');
  if (sk.length) log(`Atención: hay objetos que este prototipo todavía no muestra: ${skTxt}. No se incluyen al guardar.`, 'warn');
}

export function updateCount() { if (app.model) $('entCount').textContent = app.model.entities.length.toLocaleString('es-AR') + ' objetos'; }
