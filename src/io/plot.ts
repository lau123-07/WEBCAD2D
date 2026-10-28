/* =========================================================================
   Imprimir a escala (1:50, 1:100…) en hojas A4 a A0, con marco y rótulo.
   La lámina se dibuja en un canvas a la resolución de impresión y se imprime
   con el tamaño exacto del papel, así 1 cm del plano mide lo que dice la escala.
   ========================================================================= */
import { app } from '../core/app';
import { ctx } from '../core/dom';
import { state } from '../core/state';
import { computeBounds } from '../model/bounds';
import { drawList, setWorld } from '../render/draw';

export const PAPERS: Record<string, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000, 2000];
const MARGIN = 10, GAP = 5, TB_W = 180, TB_H = 40;

export interface PlotOptions {
  paper: string; landscape: boolean; scale: number | 'fit'; mono: boolean;
  area: { minX: number; minY: number; maxX: number; maxY: number } | null;
  title: string; sheet: string; drawnBy: string; date: string; sheetNo: string; company: string;
}

export const unitToMm = () => ({ 4: 1, 5: 10, 6: 1000 }[app.model.units] || 1);

export function sheetGeometry(o: PlotOptions) {
  let [PW, PH] = PAPERS[o.paper] || PAPERS.A3;
  if (o.landscape !== PW > PH) [PW, PH] = [PH, PW];
  const fx = MARGIN, fy = MARGIN, fw = PW - 2 * MARGIN, fh = PH - 2 * MARGIN;
  const tbW = Math.min(TB_W, fw), tbH = TB_H;
  // zona para el dibujo: dentro del marco, por encima del rótulo
  const ax = fx + GAP, ay = fy + GAP, aw = fw - 2 * GAP, ah = fh - 2 * GAP - tbH;
  return { PW, PH, frame: { x: fx, y: fy, w: fw, h: fh }, tb: { x: fx + fw - tbW, y: fy + fh - tbH, w: tbW, h: tbH }, avail: { x: ax, y: ay, w: aw, h: ah } };
}

export function plotArea(o: PlotOptions) { return o.area || computeBounds(); }

/* Escala efectiva (el número N de 1:N) y si el dibujo entra en la hoja */
export function plotInfo(o: PlotOptions) {
  const g = sheetGeometry(o), b = plotArea(o);
  if (!b) return null;
  const u = unitToMm(), wmm = (b.maxX - b.minX) * u, hmm = (b.maxY - b.minY) * u;
  const fitDen = Math.max(wmm / g.avail.w, hmm / g.avail.h, 1e-9);
  const den = o.scale === 'fit' ? fitDen : o.scale;
  const pw = wmm / den, ph = hmm / den;
  const fits = pw <= g.avail.w + 1e-6 && ph <= g.avail.h + 1e-6;
  const best = SCALES.find(s => s >= fitDen - 1e-9) || null;
  return { g, b, den, pw, ph, fits, best, fitDen };
}

export const scaleLabel = (den: number) => '1:' + (Math.abs(den - Math.round(den)) < 0.01 ? Math.round(den) : den.toFixed(1).replace('.', ','));

/* Dibuja la lámina completa en un canvas, a "dpi" puntos por pulgada */
export function renderSheet(o: PlotOptions, dpi: number) {
  const info = plotInfo(o);
  const g = info ? info.g : sheetGeometry(o);
  const k = dpi / 25.4, W = Math.round(g.PW * k), H = Math.round(g.PH * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  if (info) {
    const b = info.b, pxPerUnit = unitToMm() / info.den * k;
    const acx = (g.avail.x + g.avail.w / 2) * k, acy = (g.avail.y + g.avail.h / 2) * k;
    const saved = { cx: state.cx, cy: state.cy, scale: state.scale, w: state.w, h: state.h };
    const bcx = (b.minX + b.maxX) / 2, bcy = (b.minY + b.maxY) / 2;
    Object.assign(state, { scale: pxPerUnit, w: W, h: H, cx: bcx - (acx - W / 2) / pxPerUnit, cy: bcy + (acy - H / 2) / pxPerUnit });
    x.save();
    x.beginPath(); x.rect(g.frame.x * k, g.frame.y * k, g.frame.w * k, (g.frame.h - g.tb.h) * k); x.clip();
    app.dprOverride = 1; app.printMode = true; app.printMono = o.mono; app.printHair = 0.25 * k; app.G = x;
    try { setWorld(x); drawList(app.model.entities, null, null, 0); }
    finally {
      app.G = ctx; app.dprOverride = null; app.printMode = false; app.printMono = false; app.printHair = 0;
      Object.assign(state, saved); x.restore();
    }
  }
  drawFrameAndTitle(x, g, k, o, info ? info.den : null);
  return c;
}

function drawFrameAndTitle(x: CanvasRenderingContext2D, g, k: number, o: PlotOptions, den: number | null) {
  x.setTransform(1, 0, 0, 1, 0, 0); x.setLineDash([]); x.globalAlpha = 1;
  x.strokeStyle = '#000'; x.fillStyle = '#000';
  const rect = (r, lw) => { x.lineWidth = lw * k; x.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k); };
  const line = (x1, y1, x2, y2, lw) => { x.lineWidth = lw * k; x.beginPath(); x.moveTo(x1 * k, y1 * k); x.lineTo(x2 * k, y2 * k); x.stroke(); };
  const text = (s: string, tx: number, ty: number, size: number, opts: { bold?: boolean; gray?: boolean; maxW?: number } = {}) => {
    if (!s) return;
    x.font = `${opts.bold ? '600 ' : ''}${size * k}px "Segoe UI", Arial, sans-serif`;
    x.fillStyle = opts.gray ? '#555' : '#000'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    let str = s;
    if (opts.maxW) while (str.length > 1 && x.measureText(str).width > opts.maxW * k) str = str.slice(0, -2) + '…';
    x.fillText(str, tx * k, ty * k);
  };
  rect(g.frame, 0.5);
  const t = g.tb; rect(t, 0.5);
  const r1 = t.y + 14, r2 = r1 + 10, r3 = r2 + 8;
  line(t.x, r1, t.x + t.w, r1, 0.25); line(t.x, r2, t.x + t.w, r2, 0.25); line(t.x, r3, t.x + t.w, r3, 0.25);
  // fila 1: empresa y proyecto
  text(o.company, t.x + 2, t.y + 4.2, 2.2, { gray: true, maxW: t.w - 4 });
  text(o.title || 'Sin título', t.x + 2, t.y + 11.2, 4.6, { bold: true, maxW: t.w - 4 });
  // fila 2: plano
  text('PLANO', t.x + 2, r1 + 3, 1.8, { gray: true });
  text(o.sheet, t.x + 2, r1 + 8, 3.6, { maxW: t.w - 4 });
  // fila 3: escala, fecha, lámina, papel
  const c4 = t.w / 4;
  [['ESCALA', den ? scaleLabel(den) : '—'], ['FECHA', o.date], ['LÁMINA', o.sheetNo], ['PAPEL', `${o.paper} ${o.landscape ? 'horizontal' : 'vertical'}`]].forEach(([lab, val], i) => {
    if (i) line(t.x + c4 * i, r2, t.x + c4 * i, r3, 0.25);
    text(lab, t.x + c4 * i + 2, r2 + 2.8, 1.8, { gray: true });
    text(val, t.x + c4 * i + 2, r2 + 6.8, 3, { maxW: c4 - 3 });
  });
  // fila 4: dibujó y archivo
  line(t.x + t.w / 2, r3, t.x + t.w / 2, t.y + t.h, 0.25);
  text('DIBUJÓ', t.x + 2, r3 + 2.8, 1.8, { gray: true });
  text(o.drawnBy, t.x + 2, r3 + 6.8, 3, { maxW: t.w / 2 - 3 });
  text('ARCHIVO', t.x + t.w / 2 + 2, r3 + 2.8, 1.8, { gray: true });
  text(app.fileName, t.x + t.w / 2 + 2, r3 + 6.8, 3, { maxW: t.w / 2 - 3 });
}

/* Resolución de impresión: 300 ppp en hojas chicas, menos en las grandes para no agotar la memoria */
export function printDpi(o: PlotOptions) {
  const g = sheetGeometry(o), maxPx = 45e6;
  const dpi = Math.sqrt(maxPx / (g.PW * g.PH)) * 25.4;
  return Math.max(100, Math.min(300, Math.floor(dpi)));
}

/* Manda la lámina a la impresora (o a "Guardar como PDF") con el tamaño exacto del papel */
export async function printSheet(o: PlotOptions) {
  const g = sheetGeometry(o), c = renderSheet(o, printDpi(o));
  const blob: Blob = await new Promise(r => c.toBlob(b => r(b), 'image/png'));
  const url = URL.createObjectURL(blob);
  let style = document.getElementById('pageSize') as HTMLStyleElement;
  if (!style) { style = document.createElement('style'); style.id = 'pageSize'; document.head.append(style); }
  style.textContent = `@page { size: ${g.PW}mm ${g.PH}mm; margin: 0; } @media print { #printArea img { width: ${g.PW}mm !important; height: ${g.PH}mm !important; max-height: none !important; object-fit: fill !important; } }`;
  const img = document.getElementById('printImg') as HTMLImageElement;
  await new Promise<void>(res => { img.onload = () => res(); img.src = url; });
  window.print();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
