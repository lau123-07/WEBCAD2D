import { app } from '../core/app';
import { UNITS } from '../core/constants';
import { state } from '../core/state';
import { angOf, cross, dist, distSeg, fmt, midp, norm, sub } from '../geom/math';
import { prims } from '../geom/prims';
import { mkPoly, styleNew } from '../model/factory';
import { addEntity } from '../model/undo';
import { ask, getPt, log } from '../ui/commandline';
import { polyVerts } from '../geom/prims';

export async function cmdDim(aligned) {
  const p1 = await getPt(`${aligned ? 'ACOTALINEADA' : 'ACOTALINEAL'} Precise origen de la primera línea de referencia:`); if (p1 === 'ENTER') return;
  const p2 = await getPt('Precise origen de la segunda línea de referencia:', { base: p1 }); if (p2 === 'ENTER' || dist(p1, p2) < 1e-9) return;
  const h = state.textH * 0.8;
  const mk = pos => {
    let ang;
    if (aligned) ang = angOf(p1, p2);
    else { const m = midp(p1, p2), ex = Math.abs(pos.x - m.x) - Math.abs(p2.x - p1.x) / 2, ey = Math.abs(pos.y - m.y) - Math.abs(p2.y - p1.y) / 2; ang = ey >= ex ? 0 : Math.PI / 2; }
    return styleNew({ type: 'XDIM', p1: { ...p1 }, p2: { ...p2 }, pos: { x: pos.x, y: pos.y }, ang, h });
  };
  const pos = await getPt('Precise ubicación de la línea de cota:', { rubber: false, preview: p => [mk(p)] });
  if (pos === 'ENTER') return;
  addEntity(mk(pos));
}

/* Cota alineada entre dos puntos (la usa DIST para dibujar la medida en el plano) */
function alignedDim(a, b, pos) {
  return styleNew({ type: 'XDIM', p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y }, pos: { x: pos.x, y: pos.y }, ang: angOf(a, b), h: state.textH * 0.8 });
}

export async function cmdDist() {
  const a = await getPt('DIST Precise primer punto:'); if (a === 'ENTER') return;
  const b = await getPt('Precise segundo punto:', { base: a }); if (b === 'ENTER') return;
  const dx = b.x - a.x, dy = b.y - a.y;
  log(`Distancia = ${fmt(Math.hypot(dx, dy))}   Ángulo = ${fmt(norm(Math.atan2(dy, dx)) * 180 / Math.PI)}°   ΔX = ${fmt(dx)}   ΔY = ${fmt(dy)}`, 'res');
  if (dist(a, b) < 1e-9) return;
  const pos = await getPt('Precise dónde dibujar la cota en el plano, o Enter para no dibujarla:', { rubber: false, preview: p => [alignedDim(a, b, p)] });
  if (pos === 'ENTER') return;
  addEntity(alignedDim(a, b, pos));
  log('Cota agregada al plano.', 'res');
}

/* Superficie y perímetro con las unidades que se usan en planos: m² y m */
function areaTexts(A, P) {
  const u = app.model.units;
  const n = (v, d) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (u === 4 || u === 5 || u === 6) {
    const k = u === 4 ? 1000 : u === 5 ? 100 : 1; // a metros
    return { area: `Sup. ${n(A / (k * k), 2)} m²`, perim: `Perím. ${n(P / k, 2)} m` };
  }
  return { area: `Sup. ${n(A, 2)}`, perim: `Perím. ${n(P, 2)}` };
}

export async function cmdArea() {
  let pts = [];
  while (true) {
    const p = await getPt(pts.length ? 'Precise punto siguiente o <calcular>:' : 'AREA Precise primer vértice o [Objeto]:',
      { base: pts[pts.length - 1], keywords: pts.length ? [] : ['O'], rubber: false, preview: q => pts.length ? [mkPoly([...pts, q], pts.length >= 2)] : [] });
    if (p === 'ENTER') break;
    if (p === 'O') {
      const r = await ask('entity', 'Designe un rectángulo o una polilínea cerrada:');
      if (r === 'ENTER') return;
      const e = r.e;
      if (e.type === 'CIRCLE') { pts = []; for (let i = 0; i < 128; i++) pts.push({ x: e.center.x + e.radius * Math.cos(i / 128 * 2 * Math.PI), y: e.center.y + e.radius * Math.sin(i / 128 * 2 * Math.PI) }); break; }
      if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape) {
        const v = polyVerts(e);
        if (v.some(q => q.bulge)) { log('Esa polilínea tiene tramos curvos; por ahora marcá los puntos a mano.', 'warn'); return; }
        pts = v.map(q => ({ x: q.x, y: q.y })); break;
      }
      log('Hay que elegir un rectángulo, una polilínea cerrada o un círculo.', 'warn'); return;
    }
    pts.push(p);
  }
  if (pts.length < 3) { log('Hacen falta al menos tres puntos.', 'warn'); return; }
  let A = 0, P = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += cross(a, b); P += dist(a, b); }
  A = Math.abs(A) / 2;
  const u = app.model.units ? UNITS[app.model.units] : '';
  log(`Área = ${fmt(A)}${u ? ' ' + u + '²' : ''}   Perímetro = ${fmt(P)}${u ? ' ' + u : ''}`, 'res');
  const t = areaTexts(A, P);
  const mk = p => styleNew({ type: 'MTEXT', text: `${t.area}\\P${t.perim}`, position: { x: p.x, y: p.y }, height: state.textH * 0.8, attachmentPoint: 5, rotation: 0 });
  const pos = await getPt('Precise dónde escribir la superficie en el plano, o Enter para no escribirla:', { rubber: false, preview: p => [mk(p)] });
  if (pos === 'ENTER') return;
  addEntity(mk(pos));
  log(`Texto agregado al plano: ${t.area}, ${t.perim}.`, 'res');
}

/* ACOTARADIO (DRA) y ACOTADIAMETRO (DDI) */
export async function cmdDimRadial(dia: boolean) {
  const r = await ask('entity', `${dia ? 'ACOTADIAMETRO' : 'ACOTARADIO'} Designe un arco o un círculo:`);
  if (r === 'ENTER') return;
  const e = r.e;
  if (e.type !== 'CIRCLE' && e.type !== 'ARC') { log('Hay que elegir un arco o un círculo.', 'warn'); return; }
  const mk = p => styleNew({ type: 'XDIMR', c: { x: e.center.x, y: e.center.y }, r: e.radius, pos: { x: p.x, y: p.y }, dia, h: state.textH * 0.8 });
  const pos = await getPt('Precise ubicación de la cota:', { rubber: false, preview: p => [mk(p)] });
  if (pos === 'ENTER') return;
  addEntity(mk(pos));
}

/* ACOTAANGULO (DAN): ángulo entre dos líneas */
export async function cmdDimAngular() {
  const segOf = r => {
    if (!r || r === 'ENTER') return null;
    const e = r.e;
    if (e.type === 'LINE') return e.vertices;
    if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      let best = null, bd = Infinity;
      for (const q of prims(e)) if (q.t === 'L') { const d = distSeg(r.p, q.a, q.b); if (d < bd) { bd = d; best = [q.a, q.b]; } }
      return best;
    }
    return null;
  };
  const s1 = segOf(await ask('entity', 'ACOTAANGULO Designe la primera línea:'));
  if (!s1) { log('Hay que elegir una línea.', 'warn'); return; }
  const s2 = segOf(await ask('entity', 'Designe la segunda línea:'));
  if (!s2) { log('Hay que elegir una línea.', 'warn'); return; }
  const d1 = sub(s1[1], s1[0]), d2 = sub(s2[1], s2[0]), den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-12) { log('Las líneas son paralelas: no forman ángulo.', 'warn'); return; }
  const t = ((s2[0].x - s1[0].x) * d2.y - (s2[0].y - s1[0].y) * d2.x) / den;
  const P = { x: s1[0].x + d1.x * t, y: s1[0].y + d1.y * t };
  const A1 = Math.atan2(d1.y, d1.x), A2 = Math.atan2(d2.y, d2.x);
  const rays = [A1, A1 + Math.PI, A2, A2 + Math.PI].map(norm).sort((a, b) => a - b);
  const mk = p => {
    const ap = norm(angOf(P, p));
    let a0 = rays[3], a1 = rays[0];
    for (let i = 0; i < 4; i++) { const s = rays[i], e = rays[(i + 1) % 4]; if (norm(ap - s) <= norm(e - s)) { a0 = s; a1 = e; break; } }
    return styleNew({ type: 'XDIMA', P: { ...P }, a0, a1, rad: Math.max(dist(P, p), 1e-6), h: state.textH * 0.8 });
  };
  const pos = await getPt('Precise ubicación del arco de cota:', { rubber: false, preview: p => [mk(p)] });
  if (pos === 'ENTER') return;
  addEntity(mk(pos));
}
