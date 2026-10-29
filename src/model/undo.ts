import { ZONE_MSG, flashInvalid, violates } from './zones';
import { app } from '../core/app';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { dirtyCache } from './bounds';
import { updateCount } from './document';
import { requestDraw } from '../render/draw';
import { log } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';
import { renderProps } from '../ui/props-panel';

export const undoStack = [], redoStack = [];

export function snapshot() {
  return { ents: structuredClone(app.model.entities), layers: structuredClone([...app.model.layers.values()]), cur: state.curLayer, count: app.editCount };
}

export function restore(s) {
  app.model.entities = structuredClone(s.ents);
  app.model.layers = new Map(structuredClone(s.layers).map(L => [L.name, L]));
  state.curLayer = app.model.layers.has(s.cur) ? s.cur : '0';
  state.sel.clear();
  app.editCount++; markDirty(); renderLayers(); renderProps(); updateCount(); requestDraw();
}

export function pushUndo(s) {
  undoStack.push(s); if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0; markDirty(); updateUndoButtons();
}

export function undo() {
  if (!undoStack.length) { log('No hay nada para deshacer.'); return; }
  redoStack.push(snapshot()); restore(undoStack.pop()); log('Deshacer.'); updateUndoButtons();
}

export function redo() {
  if (!redoStack.length) { log('No hay nada para rehacer.'); return; }
  undoStack.push(snapshot()); restore(redoStack.pop()); log('Rehacer.'); updateUndoButtons();
}

export function updateUndoButtons() { $('btnUndo').disabled = !undoStack.length; $('btnRedo').disabled = !redoStack.length; }

export function edit(fn) { const s = snapshot(); fn(); pushUndo(s); }

export function markDirty() { app.dirty = true; updateTitle(); }

export function updateTitle() { $('fileName').textContent = app.fileName + (app.dirty ? ' (sin guardar)' : ''); document.title = app.fileName + ' · Editor DXF'; }

export function addEntity(e) {
  if (violates(e)) { flashInvalid([e]); log(ZONE_MSG, 'err'); return false; }
  app.model.entities.push(e); app.editCount++; requestDraw(); return true;
}

export function removeEntities(list) {
  const s = new Set(list);
  app.model.entities = app.model.entities.filter(e => !s.has(e));
  list.forEach(e => state.sel.delete(e));
  app.editCount++; requestDraw();
}

export function replaceEntity(old, news) {
  const i = app.model.entities.indexOf(old);
  if (i < 0) return;
  app.model.entities.splice(i, 1, ...news);
  state.sel.delete(old); app.editCount++; requestDraw();
}

export function touched(e) { dirtyCache(e); app.editCount++; requestDraw(); }
