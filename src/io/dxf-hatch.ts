/* Lector de sombreados (HATCH) para dxf-parser, que no los trae.
   Convierte los contornos (polilíneas, líneas, arcos, elipses) en listas de puntos. */
import DxfParser from 'dxf-parser';
import { ACI_FULL } from '../core/constants';

const toRad = d => d * Math.PI / 180;
function arcPts(cx, cy, r, sDeg, eDeg, ccw, rx = r, ry = r, rot = 0) {
  let a0 = toRad(sDeg), a1 = toRad(eDeg);
  if (!ccw) { a0 = -a0; a1 = -a1; }
  let span = ccw ? a1 - a0 : a0 - a1;
  while (span <= 0) span += Math.PI * 2;
  if (span > Math.PI * 2) span = Math.PI * 2;
  const n = Math.max(6, Math.ceil(span / (Math.PI / 32))), pts = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const t = ccw ? a0 + span * i / n : a0 - span * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t);
    pts.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return pts;
}
export function bulgePts(a, b, bulge) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!bulge || d === 0) return [];
  const th = 4 * Math.atan(bulge), k = (d / 2) / Math.tan(th / 2), r = Math.abs(d / (2 * Math.sin(th / 2)));
  const c = { x: (a.x + b.x) / 2 - dy / d * k, y: (a.y + b.y) / 2 + dx / d * k }, a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const n = Math.max(6, Math.ceil(Math.abs(th) / (Math.PI / 32))), out = [];
  for (let j = 1; j < n; j++) { const t = a0 + th * j / n; out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }); }
  return out;
}
/* Arma la lista de puntos de un contorno a partir de sus bordes */
export function edgesToLoop(edges) {
  const pts = [];
  const push = p => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 1e-9) pts.push(p); };
  for (const ed of edges) {
    if (ed.t === 1) { push(ed.a); push(ed.b); }
    else if (ed.t === 2) arcPts(ed.c.x, ed.c.y, ed.r, ed.s, ed.e, ed.ccw).forEach(push);
    else if (ed.t === 3) { const rx = Math.hypot(ed.m.x, ed.m.y); arcPts(ed.c.x, ed.c.y, rx, ed.s, ed.e, ed.ccw, rx, rx * ed.ratio, Math.atan2(ed.m.y, ed.m.x)).forEach(push); }
    else if (ed.t === 4) (ed.fit && ed.fit.length ? ed.fit : ed.ctrl || []).forEach(push);
  }
  if (pts.length > 2) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-9) pts.pop(); }
  return pts;
}

class HatchHandler {
  ForEntityName = 'HATCH';
  parseEntity(sc, g) {
    const e: any = { type: 'HATCH', loops: [], lines: [], pattern: '', solid: false };
    let nLoops = 0, loop = null, edge = null, def = null, mode = '';
    const endLoop = () => {
      if (!loop) return;
      const pts = loop.poly ? (() => { const out = []; const v = loop.verts; for (let i = 0; i < v.length; i++) { out.push({ x: v[i].x, y: v[i].y }); if (v[i].bulge) out.push(...bulgePts(v[i], v[(i + 1) % v.length], v[i].bulge)); } return out; })() : edgesToLoop(loop.edges);
      if (pts.length >= 3) e.loops.push(pts);
      loop = null; edge = null;
    };
    for (g = sc.next(); !sc.isEOF() && g.code !== 0; g = sc.next()) {
      const c = g.code, v = g.value;
      if (mode === 'loop' && loop) {
        if (c === 97) { endLoop(); nLoops--; mode = nLoops > 0 ? 'loops' : 'after'; continue; }
        if (loop.poly) {
          if (c === 10) loop.verts.push({ x: v, y: 0 });
          else if (c === 20 && loop.verts.length) loop.verts[loop.verts.length - 1].y = v;
          else if (c === 42 && loop.verts.length) loop.verts[loop.verts.length - 1].bulge = v;
        } else {
          if (c === 72) { edge = { t: v, ctrl: [], fit: [] }; loop.edges.push(edge); }
          else if (edge) {
            if (edge.t === 1) { if (c === 10) edge.a = { x: v, y: 0 }; else if (c === 20) edge.a.y = v; else if (c === 11) edge.b = { x: v, y: 0 }; else if (c === 21) edge.b.y = v; }
            else if (edge.t === 2) { if (c === 10) edge.c = { x: v, y: 0 }; else if (c === 20) edge.c.y = v; else if (c === 40) edge.r = v; else if (c === 50) edge.s = v; else if (c === 51) edge.e = v; else if (c === 73) edge.ccw = !!v; }
            else if (edge.t === 3) { if (c === 10) edge.c = { x: v, y: 0 }; else if (c === 20) edge.c.y = v; else if (c === 11) edge.m = { x: v, y: 0 }; else if (c === 21) edge.m.y = v; else if (c === 40) edge.ratio = v; else if (c === 50) edge.s = v; else if (c === 51) edge.e = v; else if (c === 73) edge.ccw = !!v; }
            else if (edge.t === 4) { if (c === 10) edge.ctrl.push({ x: v, y: 0 }); else if (c === 20 && edge.ctrl.length) edge.ctrl[edge.ctrl.length - 1].y = v; else if (c === 11) edge.fit.push({ x: v, y: 0 }); else if (c === 21 && edge.fit.length) edge.fit[edge.fit.length - 1].y = v; }
          }
        }
        continue;
      }
      if (c === 92 && (mode === 'loops')) { loop = { poly: !!(v & 2), verts: [], edges: [] }; mode = 'loop'; continue; }
      if (mode === 'def') {
        if (c === 53) { def = { ang: v, base: { x: 0, y: 0 }, off: { x: 0, y: 0 }, dashes: [] }; e.lines.push(def); continue; }
        if (def) { if (c === 43) def.base.x = v; else if (c === 44) def.base.y = v; else if (c === 45) def.off.x = v; else if (c === 46) def.off.y = v; else if (c === 49) def.dashes.push(v); }
        if (c !== 98 && c !== 47) continue;
      }
      switch (c) {
        case 2: e.pattern = String(v).toUpperCase(); break;
        case 70: e.solid = v === 1; break;
        case 91: nLoops = v; mode = v > 0 ? 'loops' : 'after'; break;
        case 52: e.angle = v; break;
        case 41: e.scale = v; break;
        case 78: mode = v > 0 ? 'def' : 'after'; break;
        case 98: mode = 'seeds'; break;
        case 8: e.layer = v; break;
        case 6: e.lineType = v; break;
        case 62: e.colorIndex = v; if (v >= 1 && v <= 255) e.color = ACI_FULL[v]; break;
        case 420: e.color = v; break;
        case 370: e.lineweight = v; break;
        case 60: e.visible = v === 0; break;
        case 67: e.inPaperSpace = v !== 0; break;
      }
    }
    if (e.pattern === 'SOLID') e.solid = true;
    return e;
  }
}

export function makeDxfParser() {
  const p = new DxfParser();
  (p as any).registerEntityHandler(HatchHandler);
  return p;
}

/* Tipo de línea y grosor de cada capa (dxf-parser no los lee) */
export function scanLayerExtras(text: string) {
  const out = new Map<string, { lt?: string; lw?: number }>();
  const lines = text.split(/\r\n|\r|\n/);
  let inLayerTable = false, cur = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), val = lines[i + 1].trim();
    if (code === '0') {
      if (cur && cur.name) out.set(cur.name, cur);
      cur = null;
      if (val === 'LAYER' && inLayerTable) cur = {};
      if (val === 'ENDTAB') inLayerTable = false;
      if (val === 'ENDSEC' && out.size) break;
      continue;
    }
    if (code === '2' && !inLayerTable && val === 'LAYER' && !cur) { inLayerTable = true; continue; }
    if (cur) { if (code === '2') cur.name = val; else if (code === '6') cur.lt = val; else if (code === '370') cur.lw = parseInt(val, 10); }
  }
  return out;
}
