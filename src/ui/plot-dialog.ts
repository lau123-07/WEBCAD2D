/* Ventana "Imprimir a escala": opciones, rótulo y vista previa de la lámina */
import { $ } from '../core/dom';
import { PAPERS, SCALES, PlotOptions, plotInfo, printSheet, renderSheet, scaleLabel } from '../io/plot';
import { styleNew } from '../model/factory';
import { getPt, log } from './commandline';

const KEY = 'cadweb-impresion';
const today = () => new Date().toLocaleDateString('es-AR');

function loadOptions(): PlotOptions {
  let saved: any = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }
  return { paper: 'A3', landscape: true, scale: 50, mono: true, title: '', sheet: '', drawnBy: '', sheetNo: '1/1', company: '',
    ...saved, area: null, date: today() };
}
function saveOptions(o: PlotOptions) {
  const { area, date, ...rest } = o; void area; void date;
  try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch (e) { /* sin almacenamiento */ }
}

let built = false;
function build() {
  if (built) return; built = true;
  $('prPaper').append(...Object.keys(PAPERS).map(p => new Option(p, p)));
  $('prScale').append(...SCALES.map(s => new Option('1:' + s, String(s))), new Option('Ajustar a la hoja', 'fit'));
}

function readForm(o: PlotOptions) {
  o.paper = $('prPaper').value; o.landscape = $('prOrient').value === 'h';
  o.scale = $('prScale').value === 'fit' ? 'fit' : +$('prScale').value;
  o.mono = $('prMono').checked;
  o.company = $('prCompany').value; o.title = $('prTitle').value; o.sheet = $('prSheet').value;
  o.drawnBy = $('prDrawnBy').value; o.date = $('prDate').value; o.sheetNo = $('prSheetNo').value;
}
function writeForm(o: PlotOptions) {
  $('prPaper').value = o.paper; $('prOrient').value = o.landscape ? 'h' : 'v'; $('prScale').value = String(o.scale);
  $('prMono').checked = o.mono; $('prCompany').value = o.company; $('prTitle').value = o.title; $('prSheet').value = o.sheet;
  $('prDrawnBy').value = o.drawnBy; $('prDate').value = o.date; $('prSheetNo').value = o.sheetNo;
  $('prAreaInfo').textContent = o.area ? 'Ventana elegida' : 'Todo el dibujo';
  $('prAll').disabled = !o.area;
}

let timer = 0;
function refresh(o: PlotOptions) {
  readForm(o);
  const info = plotInfo(o), el = $('prInfo');
  if (!info) { el.textContent = 'El dibujo está vacío.'; el.className = 'warn'; }
  else {
    const size = `${Math.round(info.pw)} × ${Math.round(info.ph)} mm`, room = `${Math.round(info.g.avail.w)} × ${Math.round(info.g.avail.h)} mm`;
    if (info.fits) { el.textContent = `Escala ${scaleLabel(info.den)}: el dibujo ocupa ${size} de ${room} disponibles.`; el.className = 'ok'; }
    else {
      el.textContent = `A ${scaleLabel(info.den)} el dibujo ocupa ${size} y no entra (hay ${room}). ` +
        (info.best ? `En ${o.paper} entra a 1:${info.best}, o probá un papel más grande.` : 'Probá un papel más grande.');
      el.className = 'warn';
    }
  }
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const prev: HTMLCanvasElement = $('prPreview');
    const g = info ? info.g : null, pw = g ? g.PW : 420;
    const c = renderSheet(o, 340 / (pw / 25.4));
    prev.width = c.width; prev.height = c.height;
    prev.getContext('2d').drawImage(c, 0, 0);
  }, 60);
}

function openDialog(o: PlotOptions): Promise<string> {
  build();
  const dlg: HTMLDialogElement = $('plotDialog');
  writeForm(o);
  const onInput = () => refresh(o);
  dlg.addEventListener('input', onInput); dlg.addEventListener('change', onInput);
  const pick = () => dlg.close('window');
  const all = () => { o.area = null; writeForm(o); refresh(o); };
  $('prPick').addEventListener('click', pick); $('prAll').addEventListener('click', all);
  return new Promise(res => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose); dlg.removeEventListener('input', onInput); dlg.removeEventListener('change', onInput);
      $('prPick').removeEventListener('click', pick); $('prAll').removeEventListener('click', all);
      readForm(o); res(dlg.returnValue || 'cancel');
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
    refresh(o);
  });
}

const rectPts = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

export async function cmdPlot() {
  const o = loadOptions();
  while (true) {
    const r = await openDialog(o);
    if (r === 'cancel') { log('Impresión cancelada.'); return; }
    if (r === 'window') {
      const a = await getPt('IMPRIMIR Precise primera esquina del área a imprimir:'); if (a === 'ENTER') continue;
      const b = await getPt('Precise esquina opuesta:', { base: a, rubber: false, preview: p => [styleNew({ type: 'LWPOLYLINE', shape: true, vertices: rectPts(a, p) })] });
      if (b === 'ENTER') continue;
      o.area = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
      continue;
    }
    saveOptions(o);
    const info = plotInfo(o);
    if (!info) { log('El dibujo está vacío.', 'warn'); return; }
    if (!info.fits) log(`Ojo: a ${scaleLabel(info.den)} el dibujo no entra completo en la hoja; se imprime recortado.`, 'warn');
    log(`Imprimiendo en ${o.paper} a ${scaleLabel(info.den)}. En el diálogo elegí papel ${o.paper}, márgenes "Ninguno" y escala 100 %. Para PDF: "Guardar como PDF".`, 'res');
    await printSheet(o);
    return;
  }
}
