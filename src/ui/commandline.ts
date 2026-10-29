import { runCommand } from '../commands/index';
import { app } from '../core/app';
import { CANCEL } from '../core/constants';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { setSel } from '../edit/selection';
import { updateCursor } from '../edit/snap';
import { add, fmt, mulv, rad, sub } from '../geom/math';
import { applyXform, cloneEnt } from '../model/transform';
import { requestDraw } from '../render/draw';
import { drawOverlay } from '../render/overlay';
import { selectable } from '../render/style';

export const hist = $('history');

export const input = $('cmdInput');

export const promptEl = $('prompt');

export function log(msg: string, cls?: string) {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = msg;
  hist.append(div);
  while (hist.childElementCount > 300) hist.firstChild.remove();
  hist.scrollTop = hist.scrollHeight;
}

export function setPrompt(t) { promptEl.textContent = t; }

export function ask(kind: string, prompt: string, opts: any = {}): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    app.req = { kind, prompt, opts, resolve, reject };
    setPrompt(prompt);
    if (opts.ghost) requestDraw();
    if (state.mouse) updateCursor(state.mouse.x, state.mouse.y); else drawOverlay();
  });
}

export const getPt = (prompt: string, opts?: any): Promise<any> => ask('point', prompt, opts);

export function finish(v: any, echo?: string) {
  const r = app.req; if (!r) return;
  app.req = null; setPrompt('Comando:');
  if (r.kind === 'point' && v && typeof v === 'object') state.lastPt = { x: v.x, y: v.y };
  const shown = echo !== undefined ? echo : v === 'ENTER' ? '' : (v && typeof v === 'object' && 'x' in v) ? `${fmt(v.x)},${fmt(v.y)}` : (typeof v === 'number' ? fmt(v) : (v && v.e ? '' : String(v)));
  if (r.kind !== 'select' && r.kind !== 'entity') log(`${r.prompt} ${shown}`);
  state.snapPt = null;
  if (r.opts.ghost) requestDraw();
  r.resolve(v);
  drawOverlay();
}

export function cancelAll() {
  app.winStart = null;
  if (app.req) { const r = app.req; app.req = null; setPrompt('Comando:'); r.reject(CANCEL); }
  drawOverlay();
}

export function parseNum(v) {
  if (/^-?\d+,\d+$/.test(v)) v = v.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(v)) return null;
  return parseFloat(v);
}

/* Medidas con unidad: "2500", "250cm", "2,5m", "0,1km". Se convierten a las unidades del dibujo. */
const UNIT_MM = { mm: 1, cm: 10, m: 1000, km: 1e6 };
export const drawingUnitMm = () => ({ 4: 1, 5: 10, 6: 1000 }[app.model && app.model.units] || 1);
export function parseLength(v: string) {
  const m = String(v).trim().toLowerCase().match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*(mm|cm|km|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(n)) return null;
  return m[2] ? n * UNIT_MM[m[2]] / drawingUnitMm() : n;
}
const hasUnit = (v: string) => /(mm|cm|km|m)$/i.test(v.trim());

export function parsePoint(v, base) {
  v = v.replace(/\s+/g, '');
  // X 2500 = horizontal, Y 3m = vertical. Sin signo, va hacia el lado donde está el mouse.
  const xy = v.match(/^([xXyY])(.+)$/);
  if (xy && base) {
    const L = parseLength(xy[2]);
    if (L !== null) {
      const horiz = xy[1].toLowerCase() === 'x';
      let s = L;
      if (!/^[+-]/.test(xy[2]) && state.world) { const d = horiz ? state.world.x - base.x : state.world.y - base.y; if (d < 0) s = -Math.abs(L); }
      return horiz ? { x: base.x + s, y: base.y } : { x: base.x, y: base.y + s };
    }
  }
  let rel = false;
  if (v.startsWith('@')) { rel = true; v = v.slice(1); if (!v) return state.lastPt ? { ...state.lastPt } : null; }
  const ref = rel ? (state.lastPt || base || { x: 0, y: 0 }) : { x: 0, y: 0 };
  // un largo con unidad ("2,5m") es una distancia en la dirección del mouse, no una coordenada
  if (!rel && base && hasUnit(v)) {
    const n = parseLength(v);
    if (n !== null && state.world) {
      const dir = sub(state.world, base), L = Math.hypot(dir.x, dir.y);
      if (L < 1e-12) return null;
      return add(base, mulv(dir, n / L));
    }
  }
  const len = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:mm|cm|km|m)?)';
  let m = v.match(new RegExp('^' + len + '<(-?(?:\\d+\\.?\\d*|\\.\\d+))$', 'i'));
  if (m) { const d = parseLength(m[1]), a = rad(+m[2]); if (d !== null) return { x: ref.x + d * Math.cos(a), y: ref.y + d * Math.sin(a) }; }
  m = v.match(new RegExp('^' + len + ',' + len + '$', 'i'));
  if (m) { const dx = parseLength(m[1]), dy = parseLength(m[2]); if (dx !== null && dy !== null) return { x: ref.x + dx, y: ref.y + dy }; }
  const n = parseNum(v);
  if (!rel && base && n !== null && state.world) {
    const dir = sub(state.world, base), L = Math.hypot(dir.x, dir.y);
    if (L < 1e-12) return null;
    return add(base, mulv(dir, n / L));
  }
  return null;
}

export function processInput(v) {
  const r = app.req, V = v.toUpperCase();
  if (!v) { finish('ENTER'); return; }
  if (r.opts.parse) { const x = r.opts.parse(v); if (x) { finish(x, v); return; } }
  if (r.opts.keywords) {
    const k = r.opts.keywords.find(k => k === V || (r.opts.kwAlias && r.opts.kwAlias[V] === k));
    if (k) { finish(k); return; }
  }
  switch (r.kind) {
    case 'string': finish(v); return;
    case 'point': {
      const p = parsePoint(v, r.opts.base);
      if (p) finish(p); else log('Punto no válido. Usá X 2500 (horizontal), Y 3m (vertical), un largo como 2,5m, x,y, @dx,dy o @distancia<ángulo.', 'err');
      return;
    }
    case 'dist': case 'angle': case 'number': {
      const n = r.kind === 'angle' ? parseNum(v) : parseLength(v);
      if (n !== null) finish(n); else log('Escribí un número (podés usar coma o punto decimal).', 'err');
      return;
    }
    case 'select':
      if (V === 'TODO' || V === 'ALL') { setSel(app.model.entities.filter(selectable), 'add'); log(`${state.sel.size} seleccionados.`); }
      else log('Designá objetos con el mouse (clic o ventana) y Enter para terminar.', 'err');
      return;
    case 'entity': log('Hacé clic sobre un objeto, o Enter para terminar.', 'err'); return;
  }
}

export function handleSubmit() {
  const v = input.value.trim(); input.value = '';
  if (app.req) { processInput(v); return; }
  if (!v) { if (app.lastCmd) runCommand(app.lastCmd); return; }
  runCommand(v);
}

export async function getSelection() {
  const pre = [...state.sel].filter(selectable);
  if (pre.length) return pre;
  while (true) {
    const r = await ask('select', 'Designe objetos (Enter para terminar):', { keywords: ['TODO'] });
    if (r === 'TODO') { setSel(app.model.entities.filter(selectable), 'add'); log(`${state.sel.size} seleccionados.`); continue; }
    if (r === 'ENTER') break;
  }
  const s = [...state.sel].filter(selectable);
  if (!s.length) log('No se seleccionó nada.');
  return s;
}

export const previewXf = (sel, M) => sel.slice(0, 300).map(e => { const c = cloneEnt(e); return applyXform(c, M) ? c : null; }).filter(Boolean);

export function applyAll(sel, M) { let n = 0; for (const e of sel) if (applyXform(e, M)) n++; app.editCount++; requestDraw(); return n; }
