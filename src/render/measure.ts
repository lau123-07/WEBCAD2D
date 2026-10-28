/* Entrada dinámica: medidas en vivo junto al cursor y sobre lo que se está dibujando */
import { app } from '../core/app';
import { UNITS } from '../core/constants';
import { state } from '../core/state';
import { toScreen } from './draw';

type P = { x: number; y: number };
export interface Measure { lines: string[]; labels?: { p: P; text: string }[]; hint?: string }

const unit = () => (app.model && UNITS[app.model.units]) || '';
export const fmtM = (v: number) => {
  const s = Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
  return v < 0 ? '-' + s : s;
};
const withU = (v: number) => fmtM(v) + (unit() ? ' ' + unit() : '');
const angDeg = (a: P, b: P) => { let d = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (d < 0) d += 360; return d; };
const fmtA = (d: number) => d.toLocaleString('es-AR', { maximumFractionDigits: 1, useGrouping: false }) + '°';
const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

export const measureSeg = (a: P, p: P): Measure => ({
  lines: [`Largo: ${withU(len(a, p))}`, `Ángulo: ${fmtA(angDeg(a, p))}`],
  labels: [{ p: mid(a, p), text: fmtM(len(a, p)) }],
  hint: 'Escribí un largo y Enter para usar esa medida exacta'
});
export const measureRect = (a: P, p: P): Measure => {
  const w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y);
  const bottom = Math.min(a.y, p.y), right = Math.max(a.x, p.x);
  return {
    lines: [`Ancho: ${withU(w)}`, `Alto: ${withU(h)}`],
    labels: [{ p: { x: (a.x + p.x) / 2, y: bottom }, text: fmtM(w) }, { p: { x: right, y: (a.y + p.y) / 2 }, text: fmtM(h) }],
    hint: 'D: escribir ancho y alto exactos'
  };
};
export const measureCircle = (c: P, p: P, dia = false): Measure => {
  const r = dia ? len(c, p) / 2 : len(c, p);
  return { lines: [`Radio: ${withU(r)}`, `Diámetro: ${withU(r * 2)}`], labels: [{ p: mid(c, p), text: dia ? 'Ø' + fmtM(r * 2) : 'R' + fmtM(r) }] };
};
export const measureMove = (b: P, p: P): Measure => ({
  lines: [`Distancia: ${withU(len(b, p))}`, `ΔX: ${fmtM(p.x - b.x)}   ΔY: ${fmtM(p.y - b.y)}`],
  labels: [{ p: mid(b, p), text: fmtM(len(b, p)) }]
});
export const measureAngle = (b: P, p: P): Measure => ({ lines: [`Ángulo: ${fmtA(angDeg(b, p))}`] });

/* Dibuja el cartel junto al cursor y las etiquetas sobre el dibujo (en coordenadas de pantalla) */
export function drawMeasure(g: CanvasRenderingContext2D) {
  const r = app.req;
  if (!state.dyn || !r || !state.world || !state.mouse || !['point', 'dist', 'angle'].includes(r.kind)) return;
  let m: Measure | null = null;
  try {
    if (r.opts.measure) m = r.opts.measure(state.world);
    else if (r.opts.base) m = r.kind === 'angle' ? measureAngle(r.opts.base, state.world) : measureMove(r.opts.base, state.world);
  } catch (e) { m = null; }
  if (!m) return;
  g.save();
  g.setLineDash([]);
  g.font = '600 12px "Segoe UI", Arial, sans-serif';
  for (const lb of m.labels || []) {
    const s = toScreen(lb.p), w = g.measureText(lb.text).width + 10;
    g.fillStyle = 'rgba(20,24,30,.85)'; g.fillRect(s.x - w / 2, s.y - 10, w, 20);
    g.fillStyle = '#ffd866'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lb.text, s.x, s.y + 0.5);
  }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const lines = [...m.lines]; const hint = m.hint;
  g.font = '12.5px "Segoe UI", Arial, sans-serif';
  let w = Math.max(...lines.map(t => g.measureText(t).width));
  if (hint) { g.font = '11px "Segoe UI", Arial, sans-serif'; w = Math.max(w, g.measureText(hint).width); }
  const lh = 17, h = lines.length * lh + (hint ? 15 : 0) + 10, pw = w + 16;
  let x = state.mouse.x + 20, y = state.mouse.y + 22;
  if (x + pw > state.w - 4) x = state.mouse.x - pw - 16;
  if (y + h > state.h - 4) y = state.mouse.y - h - 16;
  g.fillStyle = 'rgba(24,28,34,.94)'; g.strokeStyle = '#4ea2df'; g.lineWidth = 1;
  g.fillRect(x, y, pw, h); g.strokeRect(x + 0.5, y + 0.5, pw - 1, h - 1);
  g.font = '12.5px "Segoe UI", Arial, sans-serif'; g.fillStyle = '#eef2f6';
  lines.forEach((t, i) => g.fillText(t, x + 8, y + 18 + i * lh));
  if (hint) { g.font = '11px "Segoe UI", Arial, sans-serif'; g.fillStyle = '#8a939d'; g.fillText(hint, x + 8, y + 18 + lines.length * lh); }
  g.restore();
}
