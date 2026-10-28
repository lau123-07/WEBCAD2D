import { app } from '../core/app';
import { $, view } from '../core/dom';
import { state } from '../core/state';
import { Tm, dist, fmt, nice } from '../geom/math';
import { TIP_SCALE, ensureLayer, loadImageFile, mkImage, registerImage } from '../io/image';
import { PDF_LAYERS, readPDF } from '../io/pdf';
import { sniffKind } from '../io/sniff';
import { addB, entBounds, newBox } from '../model/bounds';
import { applyXform } from '../model/transform';
import { addEntity } from '../model/undo';
import { requestDraw } from '../render/draw';
import { ask, getPt, log, setPrompt } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';

export function pickInsertFile(): Promise<any> {
  return new Promise<any>(resolve => {
    const inp = $('fileInsert');
    const done = f => { inp.onchange = null; inp.oncancel = null; resolve(f); };
    inp.onchange = () => { const f = inp.files[0]; inp.value = ''; done(f || null); };
    inp.oncancel = () => done(null);
    inp.click();
  });
}

export async function cmdImage() {
  const waiting = ask('string', 'IMAGEN Elegí una imagen o un PDF (Esc para cancelar):');
  const file = await Promise.race([pickInsertFile(), waiting]);
  if (app.req && app.req.prompt.startsWith('IMAGEN Elegí')) { app.req = null; setPrompt('Comando:'); }
  if (!file || typeof file === 'string') return;
  const buf = await file.arrayBuffer(), kind = sniffKind(file.name, buf);
  let src, w, h, widthDefault;
  const view = (state.w / state.scale) * 0.6;
  if (kind === 'image') {
    try { ({ src, w, h } = await loadImageFile(file)); } catch (err) { log('No se pudo abrir esa imagen.', 'err'); return; }
    widthDefault = nice(view);
  } else if (kind === 'pdf') {
    log(`Leyendo el PDF "${file.name}"…`);
    const res = await readPDF(buf, file.name);
    if (!res) return;
    if (res.kind === 'vector') {
      PDF_LAYERS.forEach(([n, a]) => ensureLayer(n, a));
      const bb = newBox(); res.ents.forEach(e => { const b = entBounds(e); if (b) { addB(bb, { x: b.minX, y: b.minY }); addB(bb, { x: b.maxX, y: b.maxY }); } });
      const p = await getPt('Precise punto de inserción (esquina inferior izquierda):');
      if (p === 'ENTER') return;
      const M = Tm(p.x - (isFinite(bb.minX) ? bb.minX : 0), p.y - (isFinite(bb.minY) ? bb.minY : 0));
      res.ents.forEach(e => { applyXform(e, M); app.model.entities.push(e); });
      app.editCount++; requestDraw(); renderLayers();
      log(`Se importaron ${res.ents.length} objetos del PDF. Las medidas están en milímetros de papel.`, 'warn');
      log(TIP_SCALE);
      return;
    }
    ({ src, w, h } = res); widthDefault = res.widthMM;
    log('Esa página del PDF es un escaneo: se inserta como imagen de fondo.');
  } else { log('Para insertar se aceptan imágenes (JPG, PNG) y PDF. Los DXF y DWG se abren con "Abrir…".', 'err'); return; }
  const id = registerImage(src, w, h, file.name);
  const p = await getPt('Precise punto de inserción (esquina inferior izquierda):');
  if (p === 'ENTER') return;
  let width = await ask('dist', `Precise el ancho de la imagen <${fmt(widthDefault)}>:`, { base: p, preview: q => { const d = dist(p, q); return d > 0 ? [mkImage(id, p, d)] : []; } });
  if (width === 'ENTER') width = widthDefault;
  if (!(width > 0)) { log('El ancho tiene que ser mayor que cero.', 'err'); return; }
  addEntity(mkImage(id, p, width));
  renderLayers();
  log('Imagen insertada en la capa IMAGEN. ' + TIP_SCALE);
}
