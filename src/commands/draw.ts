import { editTextDialog } from '../ui/text-dialog';
import { newGroupId } from '../model/groups';
import { nice } from '../geom/math';
import { autoDim, parseMeters } from './line-xy';
import { fmtM } from '../render/measure';
import { drawingUnitMm } from '../ui/commandline';
import { app } from '../core/app';
import { measureCircle, measureRect, measureSeg } from '../render/measure';
import { state } from '../core/state';
import { angOf, dist, fmt, inArc } from '../geom/math';
import { mkArc, mkCircle, mkLine, mkPoly, styleNew } from '../model/factory';
import { addEntity, removeEntities, touched } from '../model/undo';
import { ask, getPt, log } from '../ui/commandline';

export async function cmdLine() {
  let p1 = await getPt('LINEA Precise primer punto:');
  if (p1 === 'ENTER') { if (!state.lastPt) return; p1 = state.lastPt; }
  const first = p1, made = [];
  while (true) {
    const kws = made.length >= 2 ? ['C', 'H'] : ['H'];
    const p2 = await getPt(`Precise punto siguiente o [${made.length >= 2 ? 'Cerrar/' : ''}desHacer]:`,
      { base: p1, keywords: kws, rubber: false, preview: p => [mkLine(p1, p)], measure: p => measureSeg(p1, p) });
    if (p2 === 'ENTER') break;
    if (p2 === 'C') { addEntity(mkLine(p1, first)); break; }
    if (p2 === 'H') { if (made.length) { const l = made.pop(); removeEntities([l]); p1 = l.vertices[0]; } continue; }
    const e = mkLine(p1, p2); addEntity(e); made.push(e); p1 = p2;
  }
}

export async function cmdPline() {
  const p0 = await getPt('POLILINEA Precise punto inicial:');
  if (p0 === 'ENTER') return;
  const pts = [p0]; let e = null;
  const sync = () => { if (pts.length >= 2) { if (!e) { e = mkPoly(pts, false); addEntity(e); } else { e.vertices = pts.map(p => ({ x: p.x, y: p.y })); touched(e); } } else if (e) { removeEntities([e]); e = null; } };
  while (true) {
    const last = pts[pts.length - 1];
    const r = await getPt(`Precise punto siguiente o [${pts.length >= 3 ? 'Cerrar/' : ''}desHacer]:`,
      { base: last, keywords: ['C', 'H'], rubber: false, preview: p => [mkLine(last, p)], measure: p => measureSeg(last, p) });
    if (r === 'ENTER') break;
    if (r === 'C') { if (pts.length >= 3) { e.shape = true; touched(e); break; } continue; }
    if (r === 'H') { if (pts.length > 1) { pts.pop(); sync(); } continue; }
    pts.push(r); sync();
  }
}

export const rectPts = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

/* "LX 14000MM LY 37000MM" (en cualquier orden; sin unidad = metros) → { w, h } */
export function parseRecSizes(text: string) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const re = /L([XY])\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:mm|cm|km|m)?)/gi;
  let w = null, h = null, m;
  while ((m = re.exec(t))) { const v = parseMeters(m[2]); if (v === null) return null; if (m[1].toUpperCase() === 'X') w = v; else h = v; }
  if (w === null || h === null || !w || !h) return null;
  if (t.replace(re, '').trim()) return null;
  return { sizes: { w, h } };
}

/* Rectángulo de medidas exactas (sin cotas: se agregan a mano con DLI) */
function addRectWithDims(a, w, h) {
  addEntity(mkPoly(rectPts(a, { x: a.x + w, y: a.y + h }), true));
  const m = v => fmtM(Math.abs(v) * drawingUnitMm() / 1000);
  log(`Rectángulo de ${m(w)} × ${m(h)} m.`, 'res');
}

export async function cmdRect(args: string[] = []) {
  let sizes = null;
  if (args.length) {
    const r = parseRecSizes(args.join(' '));
    if (!r) { log('Medidas no válidas. Ejemplo: REC LX 14000MM LY 37000MM  (o en metros: REC LX 14 LY 37)', 'err'); return; }
    sizes = r.sizes;
  }
  const preview = q => sizes ? [mkPoly(rectPts(q, { x: q.x + sizes.w, y: q.y + sizes.h }), true)] : [];
  let a = await getPt(sizes ? 'RECTANG Precise la primera esquina:' : 'RECTANG Precise primera esquina o escriba las medidas (LX 14m LY 37m):',
    { parse: sizes ? undefined : parseRecSizes, preview, measure: sizes ? q => measureRect(q, { x: q.x + sizes.w, y: q.y + sizes.h }) : undefined });
  if (a === 'ENTER') return;
  if (a.sizes) {
    sizes = a.sizes;
    a = await getPt('Precise la primera esquina del rectángulo:', { preview, measure: q => measureRect(q, { x: q.x + sizes.w, y: q.y + sizes.h }) });
    if (a === 'ENTER') return;
  }
  if (sizes) { addRectWithDims(a, sizes.w, sizes.h); return; }
  let b = await getPt('Precise esquina opuesta, escriba las medidas (LX 14m LY 37m) o [Dimensiones]:', { base: a, rubber: false, keywords: ['D'], parse: parseRecSizes, preview: p => [mkPoly(rectPts(a, p), true)], measure: p => measureRect(a, p) });
  if (b && b.sizes) { addRectWithDims(a, b.sizes.w, b.sizes.h); return; }
  if (b === 'D') {
    const w = await ask('number', `Ancho del rectángulo <${fmt(app.recW || state.textH * 20)}>:`);
    const wv = w === 'ENTER' ? (app.recW || state.textH * 20) : w;
    const h = await ask('number', `Alto del rectángulo <${fmt(app.recH || wv)}>:`);
    const hv = h === 'ENTER' ? (app.recH || wv) : h;
    if (!(wv > 0) || !(hv > 0)) { log('El ancho y el alto tienen que ser mayores que cero.', 'err'); return; }
    app.recW = wv; app.recH = hv;
    const corner = p => ({ x: a.x + (p.x >= a.x ? wv : -wv), y: a.y + (p.y >= a.y ? hv : -hv) });
    const s = await getPt('Hacé clic para elegir hacia qué lado va el rectángulo:', { base: a, rubber: false, preview: p => [mkPoly(rectPts(a, corner(p)), true)], measure: p => measureRect(a, corner(p)) });
    if (s === 'ENTER') return;
    const c = corner(s);
    addRectWithDims(a, c.x - a.x, c.y - a.y);
    return;
  }
  if (b === 'ENTER' || Math.abs(b.x - a.x) < 1e-9 || Math.abs(b.y - a.y) < 1e-9) return;
  addEntity(mkPoly(rectPts(a, b), true));
}

export async function cmdCircle() {
  const c = await getPt('CIRCULO Precise punto central:');
  if (c === 'ENTER') return;
  let r = await ask('dist', `Precise radio o [Diámetro] <${fmt(state.lastR)}>:`, { base: c, keywords: ['D'], preview: p => [mkCircle(c, dist(c, p))], measure: p => measureCircle(c, p) });
  if (r === 'D') {
    r = await ask('dist', `Precise diámetro <${fmt(state.lastR * 2)}>:`, { base: c, preview: p => [mkCircle(c, dist(c, p) / 2)], measure: p => measureCircle(c, p, true) });
    r = r === 'ENTER' ? state.lastR : r / 2;
  } else if (r === 'ENTER') r = state.lastR;
  if (!(r > 0)) { log('El radio tiene que ser mayor que cero.', 'err'); return; }
  state.lastR = r; addEntity(mkCircle(c, r));
}

export function arc3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const A = a.x * a.x + a.y * a.y, B = b.x * b.x + b.y * b.y, C = c.x * c.x + c.y * c.y;
  const cen = { x: (A * (b.y - c.y) + B * (c.y - a.y) + C * (a.y - b.y)) / d, y: (A * (c.x - b.x) + B * (a.x - c.x) + C * (b.x - a.x)) / d };
  let a0 = angOf(cen, a), a1 = angOf(cen, c);
  if (!inArc(angOf(cen, b), a0, a1)) [a0, a1] = [a1, a0];
  return { c: cen, r: dist(cen, a), a0, a1 };
}

export async function cmdArc() {
  const p1 = await getPt('ARCO Precise punto inicial:'); if (p1 === 'ENTER') return;
  const p2 = await getPt('Precise segundo punto del arco:', { base: p1 }); if (p2 === 'ENTER') return;
  const p3 = await getPt('Precise punto final del arco:', { base: p2, rubber: false, preview: p => { const q = arc3(p1, p2, p); return q ? [mkArc(q.c, q.r, q.a0, q.a1)] : [mkLine(p1, p)]; } });
  if (p3 === 'ENTER') return;
  const q = arc3(p1, p2, p3);
  if (!q) { log('Los tres puntos están alineados: no forman un arco.', 'err'); return; }
  addEntity(mkArc(q.c, q.r, q.a0, q.a1));
}

export async function cmdText() {
  let rot = app.textRot || 0;
  const sample = q => [styleNew({ type: 'TEXT', text: 'Texto', textHeight: state.textH, startPoint: { x: q.x, y: q.y }, endPoint: { x: q.x, y: q.y }, rotation: rot, halign: 0, valign: 0 })];
  let p;
  while (true) {
    p = await getPt(`TEXTO Hacé clic donde va el texto o [Altura/Rotación] (altura ${fmt(state.textH)}):`, { keywords: ['A', 'R'], ghost: true, preview: sample });
    if (p === 'ENTER') return;
    if (p === 'A') { const h = await ask('number', `Altura del texto <${fmt(state.textH)}>:`); if (h !== 'ENTER') { if (h > 0) state.textH = h; else log('La altura tiene que ser mayor que cero.', 'err'); } continue; }
    if (p === 'R') { const a = await ask('number', `Ángulo del texto en grados <${fmt(rot)}>:`); if (a !== 'ENTER') { rot = a; app.textRot = a; } continue; }
    break;
  }
  const s = await editTextDialog('', false, 'Escribí el texto');
  if (s === null || !s.trim()) return;
  if (/\r?\n/.test(s)) {
    addEntity(styleNew({ type: 'MTEXT', text: s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\P'), position: { x: p.x, y: p.y + state.textH }, height: state.textH, attachmentPoint: 1, rotation: rot }));
  } else {
    addEntity(styleNew({ type: 'TEXT', text: s, textHeight: state.textH, startPoint: { x: p.x, y: p.y }, endPoint: { x: p.x, y: p.y }, rotation: rot, halign: 0, valign: 0 }));
  }
  log('Texto agregado. Para moverlo, arrastralo con el mouse; doble clic para editarlo.', 'res');
}
