import { makeDxfParser } from './dxf-hatch';
import { app } from '../core/app';
import { readDWG } from './dwg';
import { buildModel } from './dxf-read';
import { TIP_SCALE, ensureLayer, loadImageFile, mkImage, registerImage } from './image';
import { PDF_LAYERS, readPDF } from './pdf';
import { baseName, sniffKind } from './sniff';
import { loadModel } from '../model/document';
import { log } from '../ui/commandline';

export function emptyModel(units) {
  return { layers: new Map([['0', { name: '0', color: 0xffffff, aci: 7, visible: true, locked: false }]]), entities: [], blocks: {}, skipped: {}, units: units ?? 4, images: {} };
}

export async function openFile(file) {
  const name = file.name;
  let buf;
  try { buf = await file.arrayBuffer(); } catch (err) { log(`No se pudo leer "${name}".`, 'err'); return; }
  const kind = sniffKind(name, buf);
  if (kind === 'dxfbin') { log(`"${name}" es un DXF binario. Guardalo como DXF de texto (ASCII) y abrilo de nuevo.`, 'err'); return; }
  if (kind === 'image-unsupported') { log(`"${name}" está en un formato de imagen que el navegador no abre (por ejemplo HEIC de iPhone). Exportala como JPG o PNG.`, 'err'); return; }
  if (kind === 'dwg') {
    log(`Leyendo el DWG "${name}" (la primera vez tarda unos segundos)…`);
    await new Promise(r => setTimeout(r, 30));
    try {
      const m = await readDWG(buf);
      loadModel(m, name.replace(/\.dwg$/i, '.dxf'), true);
      log('El DWG se abrió para ver y editar. Al guardar se crea un DXF; el DWG original no se modifica.');
    } catch (err) {
      console.error(err);
      log(`No se pudo leer "${name}". Probá convertirlo a DXF con ODA File Converter o desde AutoCAD.`, 'err');
    }
    return;
  }
  if (kind === 'pdf') {
    log(`Leyendo el PDF "${name}"…`);
    await new Promise(r => setTimeout(r, 30));
    let res;
    try { res = await readPDF(buf, name); } catch (err) { console.error(err); log(`No se pudo leer el PDF "${name}". Puede estar protegido o dañado.`, 'err'); return; }
    if (!res) { log('Apertura cancelada.'); return; }
    const m = emptyModel(4);
    app.model = m;
    if (res.kind === 'image') {
      const id = registerImage(res.src, res.w, res.h, name);
      m.entities.push(mkImage(id, { x: 0, y: 0 }, res.widthMM));
      loadModel(m, baseName(name) + '.dxf', true);
      log(`La página ${res.page} es un escaneo (una imagen): quedó de fondo, en la capa IMAGEN, para calcar encima.`, 'warn');
    } else {
      PDF_LAYERS.forEach(([n, a]) => ensureLayer(n, a));
      m.entities.push(...res.ents);
      loadModel(m, baseName(name) + '.dxf', true);
      log(`Se importaron las líneas y textos de la página ${res.page}${res.pages > 1 ? ' de ' + res.pages : ''}. Las medidas están en milímetros de papel, no en la escala real del plano.`, 'warn');
    }
    log(TIP_SCALE);
    return;
  }
  if (kind === 'image') {
    let im;
    try { im = await loadImageFile(file); } catch (err) { log(`No se pudo abrir la imagen "${name}".`, 'err'); return; }
    const m = emptyModel(4); app.model = m;
    const id = registerImage(im.src, im.w, im.h, name);
    m.entities.push(mkImage(id, { x: 0, y: 0 }, im.w));
    loadModel(m, baseName(name) + '.dxf', true);
    log('La imagen quedó de fondo, en la capa IMAGEN, para calcar encima. Todavía no está a escala.', 'warn');
    log(TIP_SCALE);
    return;
  }
  // DXF de texto
  const latin = new TextDecoder('windows-1252').decode(buf);
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(latin.slice(0, 50000));
  let text = latin;
  if (ver && ver[1] >= 'AC1021') text = new TextDecoder('utf-8').decode(buf);
  else if (!ver) { try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = latin; } }
  if (!/(^|\n)\s*0\s*\r?\n\s*SECTION/.test(text.slice(0, 20000))) {
    log(`"${name}" no es un archivo que el editor reconozca. Abre DXF, DWG, PDF e imágenes (JPG, PNG).`, 'err');
    return;
  }
  log(`Leyendo "${name}"…`);
  await new Promise(r => setTimeout(r, 30));
  let dxf;
  try { dxf = makeDxfParser().parseSync(text); } catch (err) { log(`No se pudo interpretar "${name}": ${err.message || err}`, 'err'); return; }
  if (!dxf) { log(`"${name}" no parece un DXF válido.`, 'err'); return; }
  loadModel(buildModel(dxf, text), name, true);
}
