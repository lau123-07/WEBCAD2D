import { fmtM, measureMove } from '../render/measure';
import { app } from '../core/app';
import { TAU } from '../core/constants';
import { state } from '../core/state';
import { hitDist } from '../edit/selection';
import { Rm, Sm, Tm, about, add, angOf, arcSpan, cross, dist, distSeg, dot, fmt, mirrorM, mulv, norm, rad, sub } from '../geom/math';
import { circParamsWith, lineParamsWith, polyVerts, prims } from '../geom/prims';
import { entBounds } from '../model/bounds';
import { like } from '../model/factory';
import { applyXform, cloneEnt, explodeEnt } from '../model/transform';
import { addEntity, removeEntities, replaceEntity, touched } from '../model/undo';
import { requestDraw } from '../render/draw';
import { isVisible } from '../render/style';
import { applyAll, ask, getPt, getSelection, log, previewXf } from '../ui/commandline';

export async function cmdErase() {
  const sel = await getSelection(); if (!sel.length) return;
  removeEntities(sel); log(`${sel.length} objeto(s) borrado(s).`);
}

export async function cmdMove(copy) {
  const sel = await getSelection(); if (!sel.length) return;
  const b = await getPt('Precise punto base:'); if (b === 'ENTER') return;
  while (true) {
    const p = await getPt(copy ? 'Precise segundo punto o <salir>:' : 'Precise segundo punto:', { base: b, preview: q => previewXf(sel, Tm(q.x - b.x, q.y - b.y)), measure: q => measureMove(b, q) });
    if (p === 'ENTER') break;
    const M = Tm(p.x - b.x, p.y - b.y);
    if (copy) { for (const e of sel) { const c = cloneEnt(e); if (applyXform(c, M)) app.model.entities.push(c); } app.editCount++; requestDraw(); }
    else { applyAll(sel, M); break; }
  }
}

export async function cmdRotate() {
  const sel = await getSelection(); if (!sel.length) return;
  const b = await getPt('Precise punto base:'); if (b === 'ENTER') return;
  const a = await ask('angle', 'Precise ángulo de rotación (grados, antihorario):', { base: b, preview: p => previewXf(sel, about(b, Rm(angOf(b, p)))) });
  if (a === 'ENTER') return;
  applyAll(sel, about(b, Rm(rad(a))));
}

export async function cmdScale() {
  const sel = await getSelection(); if (!sel.length) return;
  const b = await getPt('Precise punto base:'); if (b === 'ENTER') return;
  let f = await ask('dist', 'Precise factor de escala (por ejemplo 2 o 0,5) o [Referencia]:', { base: b, keywords: ['R'], preview: p => { const k = dist(b, p); return k > 0 ? previewXf(sel, about(b, Sm(k, k))) : []; }, measure: p => ({ lines: [`Factor: ${fmtM(dist(b, p))}`] }) });
  if (f === 'ENTER') return;
  if (f === 'R') {
    const r1 = await getPt('Precise primer punto de una medida conocida:'); if (r1 === 'ENTER') return;
    const r2 = await getPt('Precise segundo punto de esa medida:', { base: r1 }); if (r2 === 'ENTER') return;
    const ref = dist(r1, r2);
    if (!(ref > 0)) { log('Los dos puntos son iguales.', 'err'); return; }
    const real = await ask('number', `Esa medida hoy vale ${fmt(ref)}. Escriba la medida real:`);
    if (real === 'ENTER') return;
    f = real / ref;
    log(`Factor de escala aplicado: ${fmt(f)}.`);
  }
  if (!(f > 0)) { log('El factor tiene que ser mayor que cero.', 'err'); return; }
  applyAll(sel, about(b, Sm(f, f)));
}

export async function cmdMirror() {
  const sel = await getSelection(); if (!sel.length) return;
  const p1 = await getPt('Precise primer punto de la línea de simetría:'); if (p1 === 'ENTER') return;
  const p2 = await getPt('Precise segundo punto de la línea de simetría:', { base: p1, preview: p => dist(p, p1) > 1e-9 ? previewXf(sel, mirrorM(p1, p)) : [] });
  if (p2 === 'ENTER' || dist(p1, p2) < 1e-9) return;
  const r = await ask('string', '¿Borrar objetos de origen? [Sí/No] <No>:', { keywords: ['S', 'N'], kwAlias: { 'SI': 'S', 'SÍ': 'S', 'NO': 'N' } });
  const M = mirrorM(p1, p2);
  for (const e of sel) {
    if (r === 'S') applyXform(e, M);
    else { const c = cloneEnt(e); if (applyXform(c, M)) app.model.entities.push(c); }
  }
  app.editCount++; requestDraw();
}

export function offsetEnt(e, d, p) {
  if (e.type === 'LINE') {
    const [a, b] = e.vertices, v = sub(b, a), L = Math.hypot(v.x, v.y); if (!L) return null;
    const n = { x: -v.y / L, y: v.x / L }, sg = cross(v, sub(p, a)) > 0 ? 1 : -1;
    return like(e, { type: 'LINE', vertices: [add(a, mulv(n, d * sg)), add(b, mulv(n, d * sg))] });
  }
  if (e.type === 'CIRCLE' || e.type === 'ARC') {
    const r = dist(p, e.center) < e.radius ? e.radius - d : e.radius + d;
    if (r <= 0) return null;
    const c = cloneEnt(e); c.radius = r; return c;
  }
  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    const v = polyVerts(e).filter((q, i, arr) => i === 0 || dist(q, arr[i - 1]) > 1e-9);
    if (v.some(q => q.bulge)) { log('Por ahora el desfase de polilíneas con arcos no está disponible: descomponela con X primero.', 'warn'); return null; }
    const closed = !!e.shape, n = v.length; if (n < 2) return null;
    const segs = []; for (let i = 0; i < (closed ? n : n - 1); i++) segs.push([v[i], v[(i + 1) % n]]);
    let bi = 0, bd = Infinity;
    segs.forEach(([a, b], i) => { const dd = distSeg(p, a, b); if (dd < bd) { bd = dd; bi = i; } });
    const sg = cross(sub(segs[bi][1], segs[bi][0]), sub(p, segs[bi][0])) > 0 ? 1 : -1;
    const off = segs.map(([a, b]) => { const u = sub(b, a), L = Math.hypot(u.x, u.y), nn = { x: -u.y / L * d * sg, y: u.x / L * d * sg }; return [add(a, nn), add(b, nn)]; });
    const lineMeet = (s1, s2) => {
      const d1 = sub(s1[1], s1[0]), d2 = sub(s2[1], s2[0]), den = cross(d1, d2);
      if (Math.abs(den) < 1e-12) return s1[1];
      const t = cross(sub(s2[0], s1[0]), d2) / den;
      return add(s1[0], mulv(d1, t));
    };
    const out = [];
    if (closed) for (let i = 0; i < off.length; i++) out.push(lineMeet(off[(i - 1 + off.length) % off.length], off[i]));
    else { out.push(off[0][0]); for (let i = 1; i < off.length; i++) out.push(lineMeet(off[i - 1], off[i])); out.push(off[off.length - 1][1]); }
    return like(e, { type: 'LWPOLYLINE', shape: closed, vertices: out.map(q => ({ x: q.x, y: q.y })) });
  }
  log('Este tipo de objeto todavía no se puede desfasar.', 'warn');
  return null;
}

export async function cmdOffset() {
  let d = await ask('number', `DESFASE Precise distancia <${fmt(state.offD)}>:`);
  if (d === 'ENTER') d = state.offD;
  if (!(d > 0)) { log('La distancia tiene que ser mayor que cero.', 'err'); return; }
  state.offD = d;
  while (true) {
    const r = await ask('entity', 'Designe objeto a desfasar o <salir>:');
    if (r === 'ENTER') break;
    const side = await getPt('Precise punto del lado hacia donde desfasar:', { preview: p => { const o = offsetEnt(r.e, d, p); return o ? [o] : []; } });
    if (side === 'ENTER') continue;
    const o = offsetEnt(r.e, d, side);
    if (o) addEntity(o); else log('No se pudo desfasar ese objeto con esa distancia.', 'warn');
  }
}

export function cuttingPrims(except, box) {
  const out = [];
  for (const e of app.model.entities) {
    if (e === except || !isVisible(e)) continue;
    const b = entBounds(e);
    if (box && b && (b.maxX < box.minX || b.minX > box.maxX || b.maxY < box.minY || b.minY > box.maxY)) continue;
    out.push(...prims(e));
  }
  return out;
}

export const uniqAngles = list => { const s = []; for (const a of list.map(norm)) if (!s.some(b => Math.abs(b - a) < 1e-9 || Math.abs(Math.abs(b - a) - TAU) < 1e-9)) s.push(a); return s; };

export function trimAt(e, p) {
  let target = e;
  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    const parts = explodeEnt(e); replaceEntity(e, parts);
    let bd = Infinity; for (const q of parts) { const d = hitDist(q, p); if (d < bd) { bd = d; target = q; } }
    log('(La polilínea se descompuso en líneas y arcos para poder recortarla.)');
  }
  const cut = cuttingPrims(target, entBounds(target));
  if (target.type === 'LINE') {
    const [a, b] = target.vertices, d = sub(b, a), L2 = dot(d, d); if (!L2) return;
    const tc = dot(sub(p, a), d) / L2;
    const ts = cut.flatMap(q => lineParamsWith(a, b, q)).filter(t => t > 1e-9 && t < 1 - 1e-9);
    if (!ts.length) { removeEntities([target]); return; }
    const lo = Math.max(-Infinity, ...ts.filter(t => t < tc)), hi = Math.min(Infinity, ...ts.filter(t => t > tc));
    const at = t => add(a, mulv(d, t)), parts = [];
    if (isFinite(lo)) parts.push(like(target, { type: 'LINE', vertices: [{ ...a }, at(lo)] }));
    if (isFinite(hi)) parts.push(like(target, { type: 'LINE', vertices: [at(hi), { ...b }] }));
    replaceEntity(target, parts); return;
  }
  if (target.type === 'CIRCLE') {
    const c = target.center, r = target.radius, angs = uniqAngles(cut.flatMap(q => circParamsWith(c, r, q)));
    if (!angs.length) { removeEntities([target]); return; }
    if (angs.length < 2) { log('El círculo necesita al menos dos cortes para recortarlo.', 'warn'); return; }
    const ac = angOf(c, p);
    let next = null, nd = Infinity, prev = null, pd = Infinity;
    for (const h of angs) { const up = norm(h - ac), dn = norm(ac - h); if (up < nd) { nd = up; next = h; } if (dn < pd) { pd = dn; prev = h; } }
    replaceEntity(target, [like(target, { type: 'ARC', center: { ...c }, radius: r, startAngle: next, endAngle: prev })]); return;
  }
  if (target.type === 'ARC') {
    const c = target.center, r = target.radius, a0 = target.startAngle, span = arcSpan(a0, target.endAngle);
    const ss = cut.flatMap(q => circParamsWith(c, r, q)).map(h => norm(h - a0)).filter(s => s > 1e-9 && s < span - 1e-9);
    if (!ss.length) { removeEntities([target]); return; }
    const sc = Math.min(norm(angOf(c, p) - a0), span);
    const lo = Math.max(-Infinity, ...ss.filter(s => s < sc)), hi = Math.min(Infinity, ...ss.filter(s => s > sc)), parts = [];
    if (isFinite(lo)) parts.push(like(target, { type: 'ARC', center: { ...c }, radius: r, startAngle: a0, endAngle: a0 + lo }));
    if (isFinite(hi)) parts.push(like(target, { type: 'ARC', center: { ...c }, radius: r, startAngle: a0 + hi, endAngle: target.endAngle }));
    replaceEntity(target, parts); return;
  }
  log('Por ahora se pueden recortar líneas, polilíneas, círculos y arcos.', 'warn');
}

export async function cmdTrim() {
  log('Hacé clic sobre la parte que querés quitar. Corta contra todos los objetos visibles.');
  while (true) {
    const r = await ask('entity', 'Designe objeto a recortar o <salir>:');
    if (r === 'ENTER') break;
    trimAt(r.e, r.p);
  }
}

export function extendAt(e, p) {
  if (e.type !== 'LINE') { log('Por ahora solo se pueden alargar líneas.', 'warn'); return; }
  const [a, b] = e.vertices, d = sub(b, a), endB = dist(p, b) < dist(p, a);
  const ts = cuttingPrims(e, null).flatMap(q => lineParamsWith(a, b, q));
  const cand = endB ? ts.filter(t => t > 1 + 1e-9) : ts.filter(t => t < -1e-9);
  if (!cand.length) { log('No hay ningún objeto en esa dirección para alargar hasta él.', 'warn'); return; }
  const t = endB ? Math.min(...cand) : Math.max(...cand), q = add(a, mulv(d, t));
  if (endB) { b.x = q.x; b.y = q.y; } else { a.x = q.x; a.y = q.y; }
  touched(e);
}

export async function cmdExtend() {
  log('Hacé clic cerca del extremo de la línea que querés alargar.');
  while (true) {
    const r = await ask('entity', 'Designe línea a alargar o <salir>:');
    if (r === 'ENTER') break;
    extendAt(r.e, r.p);
  }
}

export async function cmdExplode() {
  const sel = await getSelection(); if (!sel.length) return;
  let n = 0;
  for (const e of sel) { const parts = explodeEnt(e); if (parts && parts.length) { replaceEntity(e, parts); n++; } }
  log(n ? `${n} objeto(s) descompuesto(s).` : 'Ninguno de esos objetos se puede descomponer.');
}
