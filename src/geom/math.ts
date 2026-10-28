import { TAU } from '../core/constants';

export const I = [1, 0, 0, 1, 0, 0];

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

export const mulv = (a, k) => ({ x: a.x * k, y: a.y * k });

export const dot = (a, b) => a.x * b.x + a.y * b.y;

export const cross = (a, b) => a.x * b.y - a.y * b.x;

export const midp = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const angOf = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);

export const norm = a => { a %= TAU; return a < 0 ? a + TAU : a; };

export const arcSpan = (a0, a1) => { const s = norm(a1 - a0); return s < 1e-12 ? TAU : s; };

export const inArc = (a, a0, a1) => norm(a - a0) <= arcSpan(a0, a1) + 1e-9;

export const arcPt = (q, a) => ({ x: q.c.x + q.r * Math.cos(a), y: q.c.y + q.r * Math.sin(a) });

export const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;

export const fmt = n => String(parseFloat((+n).toFixed(4)));

export function distSeg(p, a, b) {
  const d = sub(b, a), L2 = dot(d, d);
  let t = L2 ? dot(sub(p, a), d) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return dist(p, add(a, mulv(d, t)));
}

export function mul(m, n) {
  return [m[0]*n[0] + m[2]*n[1], m[1]*n[0] + m[3]*n[1],
          m[0]*n[2] + m[2]*n[3], m[1]*n[2] + m[3]*n[3],
          m[0]*n[4] + m[2]*n[5] + m[4], m[1]*n[4] + m[3]*n[5] + m[5]];
}

export const xf = (M, p) => ({ x: M[0] * p.x + M[2] * p.y + M[4], y: M[1] * p.x + M[3] * p.y + M[5] });

export const xfv = (M, v) => ({ x: M[0] * v.x + M[2] * v.y, y: M[1] * v.x + M[3] * v.y });

export const detM = M => M[0] * M[3] - M[1] * M[2];

export const Tm = (dx, dy) => [1, 0, 0, 1, dx, dy];

export const Rm = a => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];

export const Sm = (sx, sy) => [sx, 0, 0, sy, 0, 0];

export const about = (b, M) => mul(Tm(b.x, b.y), mul(M, Tm(-b.x, -b.y)));

export function mirrorM(p1, p2) {
  const f = angOf(p1, p2), c = Math.cos(2 * f), s = Math.sin(2 * f);
  return about(p1, [c, s, s, -c, 0, 0]);
}

export function nice(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * p;
}
