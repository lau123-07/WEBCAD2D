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

export function parsePoint(v, base) {
  v = v.replace(/\s+/g, '');
  let rel = false;
  if (v.startsWith('@')) { rel = true; v = v.slice(1); if (!v) return state.lastPt ? { ...state.lastPt } : null; }
  const ref = rel ? (state.lastPt || base || { x: 0, y: 0 }) : { x: 0, y: 0 };
  const num = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';
  let m = v.match(new RegExp('^' + num + '<' + num + '$'));
  if (m) { const d = +m[1], a = rad(+m[2]); return { x: ref.x + d * Math.cos(a), y: ref.y + d * Math.sin(a) }; }
  m = v.match(new RegExp('^' + num + ',' + num + '$'));
  if (m) return { x: ref.x + +m[1], y: ref.y + +m[2] };
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
  if (r.opts.keywords) {
    const k = r.opts.keywords.find(k => k === V || (r.opts.kwAlias && r.opts.kwAlias[V] === k));
    if (k) { finish(k); return; }
  }
  switch (r.kind) {
    case 'string': finish(v); return;
    case 'point': {
      const p = parsePoint(v, r.opts.base);
      if (p) finish(p); else log('Punto no válido. Usá x,y  @dx,dy  @distancia<ángulo, o una distancia.', 'err');
      return;
    }
    case 'dist': case 'angle': case 'number': {
      const n = parseNum(v);
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
