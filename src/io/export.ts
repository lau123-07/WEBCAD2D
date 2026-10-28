import { afterManualSave } from './autosave';
import { app } from '../core/app';
import { $, ctx } from '../core/dom';
import { state } from '../core/state';
import { encode1252, writeDXF } from './dxf-write';
import { computeBounds } from '../model/bounds';
import { updateTitle } from '../model/undo';
import { drawList, setWorld } from '../render/draw';
import { log } from '../ui/commandline';

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function saveDXF(asNew) {
  app.saveWarnSolid = false;
  const bytes = encode1252(writeDXF());
  const blob = new Blob([bytes], { type: 'application/dxf' });
  let suggested = app.fileName;
  if (!app.fileHandle && !/\(editado\)/.test(suggested) && suggested !== 'Sin título.dxf') suggested = suggested.replace(/\.dxf$/i, '') + ' (editado).dxf';
  if (!/\.dxf$/i.test(suggested)) suggested += '.dxf';
  try {
    if (!asNew && app.fileHandle) {
      const w = await app.fileHandle.createWritable(); await w.write(blob); await w.close();
    } else if (window.showSaveFilePicker) {
      app.fileHandle = await window.showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'Dibujo DXF', accept: { 'application/dxf': ['.dxf'] } }] });
      const w = await app.fileHandle.createWritable(); await w.write(blob); await w.close();
      app.fileName = app.fileHandle.name;
    } else { downloadBlob(blob, suggested); app.fileName = suggested; }
  } catch (err) {
    if (err && err.name === 'AbortError') { log('Guardado cancelado.'); return; }
    downloadBlob(blob, suggested); app.fileName = suggested;
  }
  app.dirty = false; updateTitle(); afterManualSave();
  log(`Guardado: ${app.fileName} (DXF R12).`, 'res');
  const lwUsed = app.model.entities.some(e => e.lineweight >= 0) || [...app.model.layers.values()].some((L: any) => L.lw >= 0);
  if (lwUsed) log('Los grosores de línea todavía no se guardan: el formato DXF que usa el editor (R12) no los admite. Se ven e imprimen, pero al abrir el archivo en AutoCAD hay que volver a ponerlos.', 'warn');
  if (app.saveWarnSolid) log('Los sombreados sólidos con islas se guardaron solo como contorno.', 'warn');
  if (app.model.entities.some(e => e.type === 'XIMAGE')) log('Las imágenes de fondo no se guardan dentro del DXF: solo lo que dibujaste encima.', 'warn');
  const sk = Object.keys(app.model.skipped || {});
  if (sk.length) log(`Los objetos no soportados (${sk.join(', ')}) no se incluyeron en el archivo guardado. El original no se tocó.`, 'warn');
}

export function renderImage(maxW) {
  const b = computeBounds();
  if (!b) { log('El dibujo está vacío.', 'warn'); return null; }
  const pad = 0.04, w = (b.maxX - b.minX) || 1, h = (b.maxY - b.minY) || 1;
  let s = maxW / (w * (1 + 2 * pad));
  if (h * (1 + 2 * pad) * s > 3500) s = 3500 / (h * (1 + 2 * pad));
  const W = Math.max(200, Math.round(w * (1 + 2 * pad) * s)), H = Math.max(200, Math.round(h * (1 + 2 * pad) * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g2 = c.getContext('2d'); g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, W, H);
  const saved = { cx: state.cx, cy: state.cy, scale: state.scale, w: state.w, h: state.h };
  Object.assign(state, { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: s, w: W, h: H });
  app.dprOverride = 1; app.printMode = true; app.G = g2;
  try { setWorld(g2); drawList(app.model.entities, null, null, 0); }
  finally { app.G = ctx; app.dprOverride = null; app.printMode = false; Object.assign(state, saved); }
  return c;
}

export function exportPNG() {
  const c = renderImage(2400); if (!c) return;
  c.toBlob(bl => { downloadBlob(bl, app.fileName.replace(/\.dxf$/i, '') + '.png'); log('Imagen PNG exportada.', 'res'); });
}

export function printDrawing() {
  const c = renderImage(2400); if (!c) return;
  $('printImg').src = c.toDataURL('image/png');
  log('Abriendo el diálogo de impresión. Para PDF, elegí "Guardar como PDF".');
  setTimeout(() => window.print(), 100);
}
