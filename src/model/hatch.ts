/* =========================================================================
   Sombreados (HATCH): contornos cerrados + familias de líneas del patrón.
   Cada familia: ángulo (grados), punto base, desplazamiento entre líneas y
   trazos (positivo = línea, negativo = espacio, 0 = punto). Igual que AutoCAD.
   ========================================================================= */
import { app } from '../core/app';
import { ellipsePts } from '../geom/curves';
import { bulgeArc, polyVerts } from '../geom/prims';

type Def = [number, number, number, number, number, number[]]; // ángulo, base x, base y, avance, separación, trazos
export const HATCH_PATTERNS: Record<string, { label: string; defs: Def[] }> = {
  SOLID: { label: 'Sólido', defs: [] },
  ANSI31: { label: 'Diagonal (ANSI31)', defs: [[45, 0, 0, 0, 3.175, []]] },
  ANSI37: { label: 'Cruzado (ANSI37)', defs: [[45, 0, 0, 0, 3.175, []], [135, 0, 0, 0, 3.175, []]] },
  LINE: { label: 'Líneas horizontales', defs: [[0, 0, 0, 0, 3.175, []]] },
  NET: { label: 'Malla', defs: [[0, 0, 0, 0, 3.175, []], [90, 0, 0, 0, 3.175, []]] },
  BRICK: { label: 'Ladrillo', defs: [[0, 0, 0, 0, 6.35, []], [90, 0, 0, 6.35, 6.35, [6.35, -6.35]]] },
  DOTS: { label: 'Puntos', defs: [[0, 0, 0, 0.79375, 1.5875, [0, -1.5875]]] }
};

/* Familias de líneas listas para usar, con la escala y el ángulo aplicados */
export function makeHatchLines(pattern: string, scale: number, angleDeg: number) {
  const p = HATCH_PATTERNS[pattern];
  if (!p) return [];
  const r = angleDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const rot = (x, y) => ({ x: x * c - y * s, y: x * s + y * c });
  return p.defs.map(([ang, bx, by, dx, dy, dashes]) => {
    const a = ang * Math.PI / 180;
    const offLocal = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    const b = rot(bx * scale, by * scale), o = rot(offLocal.x * scale, offLocal.y * scale);
    return { ang: ang + angleDeg, base: b, off: o, dashes: dashes.map(v => v * scale) };
  });
}

/* Cambia la escala de un sombreado (sirve también para patrones que vienen de un archivo) */
export function rescaleHatch(e, newScale: number) {
  if (HATCH_PATTERNS[e.pattern] && e.pattern !== 'SOLID') { e.lines = makeHatchLines(e.pattern, newScale, e.angle || 0); }
  else if (e.lines && e.scale) {
    const k = newScale / e.scale;
    e.lines = e.lines.map(L => ({ ang: L.ang, base: { x: L.base.x * k, y: L.base.y * k }, off: { x: L.off.x * k, y: L.off.y * k }, dashes: (L.dashes || []).map(v => v * k) }));
  }
  e.scale = newScale;
  delete e._hs;
}

function dashSplit(s0: number, s1: number, dl: number[], emit: (a: number, b: number) => void) {
  const P = dl.reduce((t, v) => t + Math.abs(v), 0);
  if (!dl.length || P <= 0) { emit(s0, s1); return; }
  const m = ((s0 % P) + P) % P;
  let i = 0, acc = 0;
  while (i < dl.length && acc + Math.abs(dl[i]) <= m) { acc += Math.abs(dl[i]); i++; }
  if (i >= dl.length) { i = 0; acc = m; }
  let s = s0, rem = Math.abs(dl[i]) - (m - acc), guard = 0;
  while (s < s1 - 1e-12 && guard++ < 200000) {
    if (dl[i] === 0) emit(s, s);
    else { const end = Math.min(s1, s + rem); if (dl[i] > 0) emit(s, end); s = end; }
    i = (i + 1) % dl.length; rem = Math.abs(dl[i]);
  }
}

const LIMIT = 40000;
/* Segmentos del patrón, ya recortados por los contornos (regla par-impar: las islas quedan sin sombrear) */
export function hatchSegs(e) {
  if (e._hs) return e._hs;
  const segs: number[][] = [];
  let over = false;
  const loops = e.loops || [];
  const edges: any[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lp of loops) {
    for (let i = 0; i < lp.length; i++) {
      const a = lp[i], b = lp[(i + 1) % lp.length];
      edges.push([a, b]);
      if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x; if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
    }
  }
  if (!edges.length || e.solid) return (e._hs = { segs, over });
  const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  outer: for (const L of e.lines || []) {
    const a = L.ang * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -d.y, y: d.x };
    let offN = L.off.x * n.x + L.off.y * n.y;
    if (Math.abs(offN) < 1e-9) continue;
    const bN = L.base.x * n.x + L.base.y * n.y;
    const pr = corners.map(c => c.x * n.x + c.y * n.y);
    let k0 = Math.ceil((Math.min(...pr) - bN) / offN), k1 = Math.floor((Math.max(...pr) - bN) / offN);
    if (k0 > k1) [k0, k1] = [k1, k0];
    if ((k1 - k0) > LIMIT) { over = true; break; }
    for (let k = k0; k <= k1; k++) {
      const o = { x: L.base.x + L.off.x * k, y: L.base.y + L.off.y * k };
      const ss: number[] = [];
      for (const [p, q] of edges) {
        const ex = q.x - p.x, ey = q.y - p.y, den = d.x * ey - d.y * ex;
        if (Math.abs(den) < 1e-12) continue;
        const fx = p.x - o.x, fy = p.y - o.y;
        const t = (fx * d.y - fy * d.x) / den;
        if (t < 0 || t >= 1) continue;
        ss.push((fx * ey - fy * ex) / den);
      }
      ss.sort((x, y) => x - y);
      for (let j = 0; j + 1 < ss.length; j += 2) {
        dashSplit(ss[j], ss[j + 1], L.dashes || [], (s0, s1) => segs.push([o.x + d.x * s0, o.y + d.y * s0, o.x + d.x * s1, o.y + d.y * s1]));
        if (segs.length > LIMIT) { over = true; break outer; }
      }
    }
  }
  return (e._hs = { segs, over });
}

export function drawHatch(e, col: string, override?: string) {
  const G = app.G;
  G.save();
  G.setLineDash([]);
  if (e.solid || override) {
    G.beginPath();
    for (const lp of e.loops || []) { lp.forEach((p, i) => i ? G.lineTo(p.x, p.y) : G.moveTo(p.x, p.y)); G.closePath(); }
    if (override) G.stroke();
    else { G.fillStyle = col; G.fill('evenodd'); }
  }
  if (!e.solid) {
    const { segs, over } = hatchSegs(e);
    if (over) { // demasiado denso para dibujar línea por línea: se muestra un relleno suave
      G.globalAlpha *= 0.35; G.fillStyle = col; G.beginPath();
      for (const lp of e.loops || []) { lp.forEach((p, i) => i ? G.lineTo(p.x, p.y) : G.moveTo(p.x, p.y)); G.closePath(); }
      G.fill('evenodd');
    } else {
      G.strokeStyle = override || col; G.beginPath();
      for (const s of segs) { G.moveTo(s[0], s[1]); G.lineTo(s[2], s[3]); }
      G.stroke();
    }
  }
  G.restore();
}

/* Contorno cerrado de una entidad (para crear sombreados), o null si no es cerrada */
export function loopOf(e) {
  if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.shape) {
    const v = polyVerts(e), pts = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      pts.push({ x: a.x, y: a.y });
      if (a.bulge) {
        const q = bulgeArc(a, b, a.bulge); if (!q) continue;
        const a0 = Math.atan2(a.y - q.c.y, a.x - q.c.x), sweep = 4 * Math.atan(a.bulge);
        const n = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 32)));
        for (let j = 1; j < n; j++) { const t = a0 + sweep * j / n; pts.push({ x: q.c.x + q.r * Math.cos(t), y: q.c.y + q.r * Math.sin(t) }); }
      }
    }
    return pts.length >= 3 ? pts : null;
  }
  if (e.type === 'CIRCLE') {
    const pts = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; pts.push({ x: e.center.x + e.radius * Math.cos(a), y: e.center.y + e.radius * Math.sin(a) }); }
    return pts;
  }
  if (e.type === 'ELLIPSE') {
    const s = e.startAngle ?? 0, t = e.endAngle ?? Math.PI * 2;
    if (Math.abs(Math.abs(t - s) - Math.PI * 2) < 1e-6 || Math.abs(t - s) < 1e-9) return ellipsePts(e).slice(0, -1);
  }
  if (e.type === 'HATCH' && e.loops && e.loops.length === 1) return e.loops[0].map(p => ({ ...p }));
  return null;
}

/* Triangulación simple (orejas) para guardar sólidos en DXF R12 */
export function earClip(poly: { x: number; y: number }[]) {
  const pts = poly.slice();
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  if (area < 0) pts.reverse();
  const tris = [], idx = pts.map((_, i) => i);
  const inside = (p, a, b, c) => {
    const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x), s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x), s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
    return s1 >= 0 && s2 >= 0 && s3 >= 0;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = pts[idx[(i - 1 + idx.length) % idx.length]], b = pts[idx[i]], c = pts[idx[(i + 1) % idx.length]];
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) <= 1e-12) continue;
      if (idx.some(j => { const p = pts[j]; return p !== a && p !== b && p !== c && inside(p, a, b, c); })) continue;
      tris.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.map(j => pts[j]));
  return tris;
}
