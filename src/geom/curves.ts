import { TAU } from '../core/constants';

export function splinePoints(e) {
  if (e._pts) return e._pts;
  const cp = e.controlPoints, k = e.knotValues, p = e.degreeOfSplineCurve || 3;
  let pts;
  if (cp && k && cp.length > p && k.length === cp.length + p + 1) {
    pts = [];
    const n = cp.length, t0 = k[p], t1 = k[n], steps = Math.max(24, n * 12);
    for (let i = 0; i <= steps; i++) pts.push(deBoor(t0 + (t1 - t0) * i / steps, k, cp, p, n));
  } else pts = (e.fitPoints || cp || []).map(q => ({ x: q.x, y: q.y }));
  return (e._pts = pts);
}

export function deBoor(t, k, cp, p, n) {
  let s = p;
  while (s < n - 1 && t >= k[s + 1]) s++;
  const d = [];
  for (let j = 0; j <= p; j++) { const c = cp[j + s - p]; d.push({ x: c.x, y: c.y }); }
  for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
    const i = j + s - p, den = k[i + p - r + 1] - k[i], a = den ? (t - k[i]) / den : 0;
    d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y };
  }
  return d[p];
}

export function ellipsePts(e) {
  if (e._pts) return e._pts;
  const m = e.majorAxisEndPoint, rx = Math.hypot(m.x, m.y), ry = rx * (e.axisRatio || 1), rot = Math.atan2(m.y, m.x);
  let a0 = e.startAngle ?? 0, a1 = e.endAngle ?? TAU;
  if (Math.abs(a1 - a0) < 1e-9) { a0 = 0; a1 = TAU; }
  let span = a1 - a0; if (span <= 0) span += TAU;
  const n = Math.max(24, Math.ceil(span / TAU * 72)), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + span * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t);
    pts.push({ x: e.center.x + x * Math.cos(rot) - y * Math.sin(rot), y: e.center.y + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return (e._pts = pts);
}
