import { northEnts } from '../model/north';
import { zoneInnerPrims } from '../model/zones';
import { ellipsePts, splinePoints } from './curves';
import { angOf, arcPt, dist, distSeg, inArc } from './math';
import { xdimEnts } from '../model/xdim';

export function polyVerts(e) {
  return (e.vertices || []).filter(p => p.x !== undefined && !p.splineControlPoint);
}

export function bulgeArc(a, b, bulge) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const th = 4 * Math.atan(bulge);
  const r = Math.abs(d / (2 * Math.sin(th / 2)));
  const k = (d / 2) / Math.tan(th / 2);
  const c = { x: (a.x + b.x) / 2 - dy / d * k, y: (a.y + b.y) / 2 + dx / d * k };
  const a0 = angOf(c, a), a1 = angOf(c, b);
  return bulge > 0 ? { c, r, a0, a1 } : { c, r, a0: a1, a1: a0 };
}

export function polyPrims(e) {
  const v = polyVerts(e), n = v.length, out = [];
  if (n < 2) return out;
  const segs = e.shape ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = v[i], b = v[(i + 1) % n];
    if (a.bulge) { const arc = bulgeArc(a, b, a.bulge); if (arc) out.push({ t: 'A', ...arc }); }
    else out.push({ t: 'L', a, b });
  }
  return out;
}

export const ptsToSegs = pts => pts.slice(1).map((p, i) => ({ t: 'L', a: pts[i], b: p, s: true }));

export function prims(e) {
  switch (e.type) {
    case 'LINE': return e.vertices.length >= 2 ? [{ t: 'L', a: e.vertices[0], b: e.vertices[1] }] : [];
    case 'LWPOLYLINE': case 'POLYLINE': return polyPrims(e);
    case 'CIRCLE': return [{ t: 'C', c: e.center, r: e.radius }];
    case 'ARC': return [{ t: 'A', c: e.center, r: e.radius, a0: e.startAngle, a1: e.endAngle }];
    case 'ELLIPSE': return ptsToSegs(ellipsePts(e));
    case 'SPLINE': return ptsToSegs(splinePoints(e));
    case 'SOLID': { const p = (e.points || []).filter(Boolean); const o = [p[0], p[1], p[3] || p[2], p[2]].filter(Boolean); return o.map((q, i) => ({ t: 'L', a: q, b: o[(i + 1) % o.length] })); }
    case '3DFACE': { const v = e.vertices || []; return v.map((q, i) => ({ t: 'L', a: q, b: v[(i + 1) % v.length] })); }
    case 'XDIM': case 'XDIMR': case 'XDIMA': return xdimEnts(e).flatMap(prims);
    case 'XZONE': return zoneInnerPrims(e);
    case 'XNORTH': return northEnts(e).slice(0, 2).flatMap(prims);
    default: return [];
  }
}

export function distPrim(p, q) {
  if (q.t === 'L') return distSeg(p, q.a, q.b);
  const d = dist(p, q.c);
  if (q.t === 'C') return Math.abs(d - q.r);
  if (inArc(angOf(q.c, p), q.a0, q.a1)) return Math.abs(d - q.r);
  return Math.min(dist(p, arcPt(q, q.a0)), dist(p, arcPt(q, q.a1)));
}

export function lineParamsWith(a, b, q) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (q.t === 'L') {
    const ex = q.b.x - q.a.x, ey = q.b.y - q.a.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return [];
    const fx = q.a.x - a.x, fy = q.a.y - a.y;
    const t = (fx * ey - fy * ex) / den, u = (fx * dy - fy * dx) / den;
    return (u >= -1e-9 && u <= 1 + 1e-9) ? [t] : [];
  }
  const fx = a.x - q.c.x, fy = a.y - q.c.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - q.r * q.r;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A === 0) return [];
  const s = Math.sqrt(disc);
  const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  return q.t === 'A' ? ts.filter(t => inArc(Math.atan2(a.y + t * dy - q.c.y, a.x + t * dx - q.c.x), q.a0, q.a1)) : ts;
}

export function circParamsWith(c, r, q) {
  if (q.t === 'L') {
    return lineParamsWith(q.a, q.b, { t: 'C', c, r }).filter(t => t >= -1e-9 && t <= 1 + 1e-9)
      .map(t => Math.atan2(q.a.y + t * (q.b.y - q.a.y) - c.y, q.a.x + t * (q.b.x - q.a.x) - c.x));
  }
  const dx = q.c.x - c.x, dy = q.c.y - c.y, d = Math.hypot(dx, dy);
  if (d < 1e-12 || d > r + q.r + 1e-9 || d < Math.abs(r - q.r) - 1e-9) return [];
  const aa = (r * r - q.r * q.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - aa * aa));
  const mx = c.x + aa * dx / d, my = c.y + aa * dy / d;
  const pts = h < 1e-12 ? [{ x: mx, y: my }] : [{ x: mx + h * dy / d, y: my - h * dx / d }, { x: mx - h * dy / d, y: my + h * dx / d }];
  return pts.filter(p => q.t !== 'A' || inArc(angOf(q.c, p), q.a0, q.a1)).map(p => angOf(c, p));
}

export function interPts(p, q) {
  if (p.t === 'L') {
    return lineParamsWith(p.a, p.b, q).filter(t => t >= -1e-9 && t <= 1 + 1e-9)
      .map(t => ({ x: p.a.x + t * (p.b.x - p.a.x), y: p.a.y + t * (p.b.y - p.a.y) }));
  }
  return circParamsWith(p.c, p.r, q).filter(a => p.t !== 'A' || inArc(a, p.a0, p.a1)).map(a => arcPt(p, a));
}
