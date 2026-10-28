import { app } from '../core/app';
import {add,arcSpan,deg,dot,midp,mulv,sub } from '../geom/math';

export function fmtLen(v) {
  const dec = app.model && app.model.units === 4 ? 0 : app.model && app.model.units === 5 ? 1 : 2;
  return v.toFixed(dec).replace('.', ',');
}

export function linearDimEnts(e) {
  const d = { x: Math.cos(e.ang), y: Math.sin(e.ang) }, n = { x: -d.y, y: d.x }, h = e.h;
  const off1 = dot(sub(e.pos, e.p1), n), off2 = dot(sub(e.pos, e.p2), n);
  const q1 = add(e.p1, mulv(n, off1)), q2 = add(e.p2, mulv(n, off2));
  const val = Math.abs(dot(sub(e.p2, e.p1), d));
  const L = (a, b) => ({ type: 'LINE', vertices: [a, b] });
  const ext = (p, off, q) => {
    const sg = Math.sign(off) || 1, gap = Math.min(h * 0.4, Math.abs(off));
    return L(add(p, mulv(n, sg * gap)), add(q, mulv(n, sg * h * 0.6)));
  };
  const tk = { x: (d.x + n.x) * h * 0.35, y: (d.y + n.y) * h * 0.35 };
  let ta = e.ang;
  if (Math.cos(ta) < -1e-9 || (Math.abs(Math.cos(ta)) < 1e-9 && Math.sin(ta) < 0)) ta += Math.PI;
  const tn = { x: -Math.sin(ta), y: Math.cos(ta) }, m = midp(q1, q2);
  const tp = { x: m.x + tn.x * h * 0.35, y: m.y + tn.y * h * 0.35 };
  return [ext(e.p1, off1, q1), ext(e.p2, off2, q2), L(q1, q2), L(sub(q1, tk), add(q1, tk)), L(sub(q2, tk), add(q2, tk)),
    { type: 'TEXT', text: fmtLen(val), textHeight: h, startPoint: tp, endPoint: tp, halign: 1, valign: 0, rotation: deg(ta) }];
}

/* Flecha rellena: punta en tip, apuntando en la dirección dir */
export function arrowEnt(tip, dir, size) {
  const n = { x: -dir.y, y: dir.x }, back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }, w = size * 0.18;
  return { type: 'SOLID', points: [{ x: tip.x, y: tip.y }, { x: back.x + n.x * w, y: back.y + n.y * w }, { x: back.x - n.x * w, y: back.y - n.y * w }] };
}

/* Cota de radio o diámetro (XDIMR): centro c, radio r, ubicación del texto pos */
function radialDimEnts(e) {
  const h = e.h, size = h * 0.9;
  let u = sub(e.pos, e.c); const L = Math.hypot(u.x, u.y);
  u = L > 1e-12 ? { x: u.x / L, y: u.y / L } : { x: 1, y: 0 };
  const pt = add(e.c, mulv(u, e.r)), other = add(e.c, mulv(u, -e.r)), outside = L > e.r;
  const out: any[] = [];
  const Ln = (a, b) => ({ type: 'LINE', vertices: [a, b] });
  if (e.dia) {
    out.push(Ln(other, outside ? e.pos : pt));
    out.push(arrowEnt(pt, outside ? mulv(u, -1) : u, size), arrowEnt(other, mulv(u, -1), size));
  } else {
    out.push(outside ? Ln(pt, e.pos) : Ln(e.c, pt));
    out.push(arrowEnt(pt, outside ? mulv(u, -1) : u, size));
  }
  const right = e.pos.x >= e.c.x, tp = { x: e.pos.x + (right ? h * 0.3 : -h * 0.3), y: e.pos.y };
  const txt = (e.dia ? 'Ø' : 'R') + fmtLen(e.dia ? e.r * 2 : e.r);
  out.push({ type: 'TEXT', text: txt, textHeight: h, startPoint: tp, endPoint: tp, halign: right ? 0 : 2, valign: 2, rotation: 0 });
  return out;
}

/* Cota angular (XDIMA): vértice P, sector a0→a1 (antihorario), radio del arco rad */
function angularDimEnts(e) {
  const h = e.h, size = h * 0.9, span = arcSpan(e.a0, e.a1);
  const at = a => ({ x: e.P.x + e.rad * Math.cos(a), y: e.P.y + e.rad * Math.sin(a) });
  const t = a => ({ x: -Math.sin(a), y: Math.cos(a) });
  const m = e.a0 + span / 2;
  const dg = span * 180 / Math.PI; const txt = (Math.round(dg * 10) / 10).toString().replace('.', ',') + '°';
  const tp = { x: e.P.x + (e.rad + h * 0.8) * Math.cos(m), y: e.P.y + (e.rad + h * 0.8) * Math.sin(m) };
  let rot = m * 180 / Math.PI - 90; rot = ((rot % 360) + 360) % 360; if (rot > 90 && rot < 270) rot -= 180;
  return [
    { type: 'ARC', center: { x: e.P.x, y: e.P.y }, radius: e.rad, startAngle: e.a0, endAngle: e.a1 },
    arrowEnt(at(e.a0), mulv(t(e.a0), -1), size), arrowEnt(at(e.a1), t(e.a1), size),
    { type: 'TEXT', text: txt, textHeight: h, startPoint: tp, endPoint: tp, halign: 1, valign: 2, rotation: rot }
  ];
}

export const isOwnDim = t => t === 'XDIM' || t === 'XDIMR' || t === 'XDIMA';
export function xdimEnts(e) {
  if (e.type === 'XDIMR') return radialDimEnts(e);
  if (e.type === 'XDIMA') return angularDimEnts(e);
  return linearDimEnts(e);
}
