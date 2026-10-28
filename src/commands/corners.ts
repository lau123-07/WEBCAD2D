/* EMPALME (F) y CHAFLÁN (CHA) entre dos líneas */
import { app } from '../core/app';
import { add, angOf, dist, dot, fmt, mulv, norm, sub } from '../geom/math';
import { explodeEnt } from '../model/transform';
import { addEntity, replaceEntity, touched } from '../model/undo';
import { like } from '../model/factory';
import { hitDist } from '../edit/selection';
import { ask, log } from '../ui/commandline';

const unit = v => { const L = Math.hypot(v.x, v.y); return L ? { x: v.x / L, y: v.y / L } : { x: 0, y: 0 }; };

/* Pide una línea; si se elige una polilínea, la descompone y toma el tramo recto más cercano al clic */
async function pickLine(prompt: string, opts: any = {}) {
  const r = await ask('entity', prompt, opts);
  if (r === 'ENTER' || typeof r === 'string') return r;
  let e = r.e;
  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    const parts = explodeEnt(e); replaceEntity(e, parts);
    let bd = Infinity; for (const q of parts) { const d = hitDist(q, r.p); if (d < bd) { bd = d; e = q; } }
    log('(La polilínea se descompuso en líneas para poder trabajar con sus tramos.)');
  }
  if (e.type !== 'LINE') { log('Por ahora funciona con líneas y polilíneas.', 'warn'); return null; }
  return { e, p: r.p };
}

/* Intersección de las dos rectas y, para cada una, el lado que se conserva (el del clic) */
function corner(l1, p1, l2, p2) {
  const [a1, b1] = l1.vertices, [a2, b2] = l2.vertices;
  const d1 = sub(b1, a1), d2 = sub(b2, a2), den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a2.x - a1.x) * d2.y - (a2.y - a1.y) * d2.x) / den;
  const P = add(a1, mulv(d1, t));
  const side = (l, pick) => {
    const [A, B] = l.vertices, d = unit(sub(B, A));
    const s = Math.sign(dot(sub(pick, P), d)) || 1, u = mulv(d, s);
    const F = dot(sub(A, P), u) > dot(sub(B, P), u) ? A : B;
    return { u, F: { x: F.x, y: F.y }, len: dot(sub(F, P), u) };
  };
  return { P, s1: side(l1, p1), s2: side(l2, p2) };
}

export async function cmdFillet() {
  let first;
  while (true) {
    first = await pickLine(`EMPALME (radio = ${fmt(app.filletR ?? 0)}) Designe primera línea o [Radio]:`, { keywords: ['R'] });
    if (first === 'R') {
      const r = await ask('number', `Precise radio de empalme <${fmt(app.filletR ?? 0)}>:`);
      if (r !== 'ENTER') { if (r < 0) { log('El radio no puede ser negativo.', 'err'); continue; } app.filletR = r; }
      continue;
    }
    break;
  }
  if (!first || first === 'ENTER') return;
  const second = await pickLine('Designe segunda línea:');
  if (!second || second === 'ENTER' || typeof second === 'string') return;
  if (second.e === first.e) { log('Hay que elegir dos líneas distintas.', 'warn'); return; }
  const k = corner(first.e, first.p, second.e, second.p);
  if (!k) { log('Las líneas son paralelas: no se pueden empalmar.', 'warn'); return; }
  const r = app.filletR ?? 0, { P, s1, s2 } = k;
  if (r === 0) {
    first.e.vertices = [s1.F, { ...P }]; second.e.vertices = [s2.F, { ...P }];
    touched(first.e); touched(second.e); return;
  }
  const th = Math.acos(Math.max(-1, Math.min(1, dot(s1.u, s2.u))));
  if (th < 1e-6 || th > Math.PI - 1e-6) { log('Esas líneas no forman una esquina.', 'warn'); return; }
  const t = r / Math.tan(th / 2);
  if (t > s1.len + 1e-9 || t > s2.len + 1e-9) { log('El radio es demasiado grande para esas líneas.', 'warn'); return; }
  const T1 = add(P, mulv(s1.u, t)), T2 = add(P, mulv(s2.u, t));
  const bis = unit(add(s1.u, s2.u)), C = add(P, mulv(bis, r / Math.sin(th / 2)));
  let a1 = angOf(C, T1), a2 = angOf(C, T2);
  if (norm(a2 - a1) > Math.PI) [a1, a2] = [a2, a1];
  first.e.vertices = [s1.F, T1]; second.e.vertices = [s2.F, T2];
  touched(first.e); touched(second.e);
  addEntity(like(first.e, { type: 'ARC', center: C, radius: r, startAngle: a1, endAngle: a2 }));
}

export async function cmdChamfer() {
  let first;
  while (true) {
    first = await pickLine(`CHAFLAN (dist1 = ${fmt(app.chamD1 ?? 0)}, dist2 = ${fmt(app.chamD2 ?? 0)}) Designe primera línea o [Distancia]:`, { keywords: ['D'] });
    if (first === 'D') {
      const d1 = await ask('number', `Precise primera distancia <${fmt(app.chamD1 ?? 0)}>:`);
      if (d1 !== 'ENTER') app.chamD1 = Math.max(0, d1);
      const d2 = await ask('number', `Precise segunda distancia <${fmt(app.chamD1 ?? 0)}>:`);
      app.chamD2 = d2 === 'ENTER' ? app.chamD1 : Math.max(0, d2);
      continue;
    }
    break;
  }
  if (!first || first === 'ENTER') return;
  const second = await pickLine('Designe segunda línea:');
  if (!second || second === 'ENTER' || typeof second === 'string') return;
  if (second.e === first.e) { log('Hay que elegir dos líneas distintas.', 'warn'); return; }
  const k = corner(first.e, first.p, second.e, second.p);
  if (!k) { log('Las líneas son paralelas.', 'warn'); return; }
  const d1 = app.chamD1 ?? 0, d2 = app.chamD2 ?? d1, { P, s1, s2 } = k;
  if (d1 > s1.len + 1e-9 || d2 > s2.len + 1e-9) { log('Las distancias son más largas que las líneas.', 'warn'); return; }
  const T1 = add(P, mulv(s1.u, d1)), T2 = add(P, mulv(s2.u, d2));
  first.e.vertices = [s1.F, T1]; second.e.vertices = [s2.F, T2];
  touched(first.e); touched(second.e);
  if (dist(T1, T2) > 1e-9) addEntity(like(first.e, { type: 'LINE', vertices: [T1, T2] }));
}
