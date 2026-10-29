import './style.css';
import { closeContextMenu, initContextMenu, openContextMenu } from './ui/context-menu';
import { offerRecovery, startAutosave, autosaveNow } from './io/autosave';
import { gripAt } from './edit/grips';
import { editTextEntity, initTextDialog } from './ui/text-dialog';
import { runCommand } from './commands/index';
import { app } from './core/app';
import { $, ov, view } from './core/dom';
import { state } from './core/state';
import { finishWindow, pickAt, setSel } from './edit/selection';
import { updateCoords, updateCursor } from './edit/snap';
import { angOf, dist, norm } from './geom/math';
import { openFile } from './io/open';
import { redo, undo, updateUndoButtons } from './model/undo';
import { requestDraw, toWorld } from './render/draw';
import { drawOverlay } from './render/overlay';
import { resize, zoomAt, zoomExtents } from './render/view';
import { loadSample } from './sample';
import { cancelAll, finish, handleSubmit, input, log } from './ui/commandline';
import { escape, localPos, setToggle } from './ui/events';
import { closeColorMenu, colorMenu, newLayer, renderLayers } from './ui/layers-panel';


document.addEventListener('pointerdown', e => { if (!colorMenu.contains(e.target)) closeColorMenu(); });

$('tgGrid').addEventListener('click', () => setToggle('grid', !state.grid));

$('tgSnap').addEventListener('click', () => setToggle('snap', !state.snap));

$('tgOrtho').addEventListener('click', () => setToggle('ortho', !state.ortho));

$('tgLw').addEventListener('click', () => setToggle('lwDisplay', !state.lwDisplay));
$('tgDyn').addEventListener('click', () => setToggle('dyn', !state.dyn));
initTextDialog();
initContextMenu();
$('tgOsnap').addEventListener('click', () => setToggle('osnap', !state.osnap));

document.querySelectorAll<HTMLElement>('[data-cmd]').forEach(b => b.addEventListener('click', () => { runCommand(b.dataset.cmd); input.focus({ preventScroll: true }); }));

$('btnNewLayer').addEventListener('click', newLayer);

$('btnAllOn').addEventListener('click', () => { app.model.layers.forEach(L => L.visible = true); renderLayers(); requestDraw(); });

$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });

input.addEventListener('keydown', e => {
  // la barra espaciadora confirma, como en AutoCAD, salvo después de X o Y ("X 2500") o dentro de un texto
  const typingXY = /^[xy]\s*$/i.test(input.value) && app.req && ['point', 'dist'].includes(app.req.kind);
  if (e.key === 'Enter' || (e.key === ' ' && !typingXY && !(app.req && app.req.kind === 'string'))) { e.preventDefault(); handleSubmit(); }
});

document.addEventListener('keydown', e => {
  const t: any = e.target, k = e.key;
  const isCheck = t.tagName === 'INPUT' && t.type === 'checkbox';
  const inInput = t === input, inOther = !inInput && ((t.tagName === 'INPUT' && !isCheck) || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  if (k === 'F12') { e.preventDefault(); setToggle('dyn', !state.dyn); return; }
  if (k === 'F3' || k === 'F7' || k === 'F8' || k === 'F9') {
    e.preventDefault();
    setToggle({ F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap' }[k], !state[{ F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap' }[k]]);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const kk = k.toLowerCase();
    if (kk === 'z' && !inOther) { e.preventDefault(); if (app.running) cancelAll(); else undo(); }
    else if (kk === 'y' && !inOther) { e.preventDefault(); if (!app.running) redo(); }
    else if (kk === 's') { e.preventDefault(); runCommand(e.shiftKey ? 'GUARDARCOMO' : 'GUARDAR'); }
    else if (kk === 'o') { e.preventDefault(); runCommand('ABRIR'); }
    else if (kk === 'c' && !inOther && !(inInput && (input.value || input.selectionStart !== input.selectionEnd))) { if (!app.running && state.sel.size) { e.preventDefault(); runCommand('COPYCLIP'); } }
    else if (kk === 'v' && !inOther && !(inInput && input.value)) { e.preventDefault(); runCommand('PEGAR'); }
    return;
  }
  if (k === 'Escape') { e.preventDefault(); input.value = ''; escape(); return; }
  if (inInput || inOther) return;
  if (k === 'Delete') { if (!app.running && state.sel.size) runCommand('E'); return; }
  if (k === 'Enter' || (k === ' ' && t.tagName !== 'BUTTON' && !isCheck)) { e.preventDefault(); input.focus(); handleSubmit(); return; }
  if (k.length === 1 && /\S/.test(k)) input.focus();
});

ov.addEventListener('pointerdown', e => {
  const p = localPos(e);
  closeColorMenu();
  if (e.button === 1) {
    e.preventDefault(); ov.setPointerCapture(e.pointerId); app.pan = p;
    const now = performance.now(); if (now - app.lastMid < 350) zoomExtents(); app.lastMid = now;
    return;
  }
  if (e.button !== 0 || !app.model) return;
  e.preventDefault();
  ov.setPointerCapture(e.pointerId);
  updateCursor(p.x, p.y);
  const grip = gripAt(p.x, p.y);
  if (grip) { app.gripPending = grip; runCommand('GRIP'); return; }
  if (app.req && ['point', 'dist', 'angle'].includes(app.req.kind)) {
    const w = state.world;
    if (app.req.kind === 'point') { finish({ x: w.x, y: w.y }); return; }
    if (!app.req.opts.base) return;
    if (app.req.kind === 'dist') finish(dist(w, app.req.opts.base));
    else finish(norm(angOf(app.req.opts.base, w)) * 180 / Math.PI);
    return;
  }
  if (app.req && app.req.kind === 'entity') {
    const w = toWorld(p.x, p.y), hit = pickAt(w);
    if (hit) finish({ e: hit, p: w }); else log('No hay ningún objeto ahí.', 'warn');
    return;
  }
  if (app.req && app.req.kind !== 'select') return;
  if (app.winStart) { finishWindow(p, e.shiftKey); return; }
  const hit = pickAt(toWorld(p.x, p.y));
  if (hit) { setSel([hit], e.shiftKey ? 'remove' : 'add'); return; }
  app.winStart = p; app.winDown = p;
});

ov.addEventListener('pointermove', e => {
  const p = localPos(e);
  if (app.pan) { state.cx -= (p.x - app.pan.x) / state.scale; state.cy += (p.y - app.pan.y) / state.scale; app.pan = p; requestDraw(); }
  updateCursor(p.x, p.y);
});

ov.addEventListener('pointerup', e => {
  const p = localPos(e);
  if (e.button === 1) { app.pan = null; return; }
  if (app.winStart && app.winDown && dist(p, app.winDown) > 6) finishWindow(p, e.shiftKey);
  app.winDown = null;
});

ov.addEventListener('pointercancel', () => { app.pan = null; app.winDown = null; });

ov.addEventListener('pointerleave', () => { if (!app.pan) { state.mouse = null; state.world = null; updateCoords(); drawOverlay(); } });

ov.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });

ov.addEventListener('dblclick', e => {
  if (app.req || app.running || !app.model) return;
  const p = localPos(e), hit = pickAt(toWorld(p.x, p.y));
  if (hit && (hit.type === 'TEXT' || hit.type === 'MTEXT')) editTextEntity(hit);
});
ov.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (app.winStart) { app.winStart = null; drawOverlay(); return; }
  // durante un comando, el clic derecho es Enter (como en AutoCAD); si no, abre el menú
  if (app.req || app.running) { handleSubmit(); return; }
  const p = localPos(e);
  openContextMenu(e.clientX, e.clientY, p.x, p.y);
});
ov.addEventListener('wheel', () => closeContextMenu(), { passive: true });

ov.addEventListener('wheel', e => {
  e.preventDefault();
  let dy = e.deltaY; if (e.deltaMode === 1) dy *= 33; if (e.deltaMode === 2) dy *= 400;
  const p = localPos(e);
  zoomAt(p.x, p.y, Math.exp(-dy * 0.0015));
  updateCursor(p.x, p.y);
}, { passive: false });

window.addEventListener('dragenter', e => { e.preventDefault(); app.dragDepth++; view.classList.add('dragging'); });

window.addEventListener('dragleave', () => { if (--app.dragDepth <= 0) { app.dragDepth = 0; view.classList.remove('dragging'); } });

window.addEventListener('dragover', e => e.preventDefault());

window.addEventListener('drop', e => {
  e.preventDefault(); app.dragDepth = 0; view.classList.remove('dragging');
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) { if (app.dirty && !confirm('Hay cambios sin guardar. ¿Abrir otro archivo igual?')) return; openFile(f); }
});

window.addEventListener('beforeunload', e => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });

new ResizeObserver(resize).observe(view);

log('Editor DXF (prototipo). Escribí un comando (por ejemplo L para línea) o usá los botones de la izquierda. AYUDA muestra la lista.');

log('Rueda: zoom. Arrastrar con la rueda: mover la vista. Clic derecho o Enter: confirmar. Esc: cancelar.');

resize();

loadSample();

updateUndoButtons();

// Autoguardado: arranca el reloj, guarda también al cambiar de pestaña o minimizar, y ofrece recuperar
startAutosave();
document.addEventListener('visibilitychange', () => { if (document.hidden) autosaveNow(); });
setTimeout(() => offerRecovery(), 400);

// Acceso para pruebas automáticas y diagnóstico desde la consola del navegador (F12).
import { writeDXF, encode1252 } from './io/dxf-write';
import { toScreen } from './render/draw';
import { renderImage } from './io/export';
import { zoomToBox } from './render/view';
import { renderSheet, plotInfo } from './io/plot';
(window as any).__cad = { app, state, toScreen, writeDXF, encode1252, renderImage, zoomExtents, zoomToBox, loadSample, autosaveNow, renderSheet, plotInfo };
