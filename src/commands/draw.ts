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

export async function cmdRect() {
  const a = await getPt('RECTANG Precise primera esquina:');
  if (a === 'ENTER') return;
  let b = await getPt('Precise esquina opuesta o [Dimensiones] (por ejemplo @500,300):', { base: a, rubber: false, keywords: ['D'], preview: p => [mkPoly(rectPts(a, p), true)], measure: p => measureRect(a, p) });
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
    b = corner(s);
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
  const p = await getPt('TEXTO Precise punto inicial del texto:'); if (p === 'ENTER') return;
  let h = await ask('dist', `Precise altura <${fmt(state.textH)}>:`, { base: p });
  if (h === 'ENTER') h = state.textH;
  if (!(h > 0)) { log('La altura tiene que ser mayor que cero.', 'err'); return; }
  state.textH = h;
  let a = await ask('angle', 'Precise ángulo de rotación del texto <0>:', { base: p });
  if (a === 'ENTER') a = 0;
  const s = await ask('string', 'Escriba el texto:');
  if (s === 'ENTER' || !s.trim()) return;
  addEntity(styleNew({ type: 'TEXT', text: s, textHeight: h, startPoint: { x: p.x, y: p.y }, endPoint: { x: p.x, y: p.y }, rotation: a, halign: 0, valign: 0 }));
}
