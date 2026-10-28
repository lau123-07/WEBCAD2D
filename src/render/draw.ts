import { drawOverlay } from './overlay';
import { app } from '../core/app';
import { FONT, TAU } from '../core/constants';
import { ctx, cv } from '../core/dom';
import { DPR, state } from '../core/state';
import { ellipsePts, splinePoints } from '../geom/curves';
import { I, Rm, Tm, mul, rad, xfv } from '../geom/math';
import { bulgeArc, polyVerts } from '../geom/prims';
import { drawImageEnt } from '../io/image';
import { textBox, textLayout } from '../model/text';
import { xdimEnts } from '../model/xdim';
import { drawHatch } from '../model/hatch';
import { applyDash, lwFactor } from '../model/linetypes';
import { entityStyle, rgb } from './style';

export function toWorld(sx, sy) { return { x: (sx - state.w / 2) / state.scale + state.cx, y: state.cy - (sy - state.h / 2) / state.scale }; }

export function toScreen(p) { return { x: (p.x - state.cx) * state.scale + state.w / 2, y: state.h / 2 - (p.y - state.cy) * state.scale }; }

export function requestDraw() { if (!app.pending) { app.pending = true; requestAnimationFrame(draw); } }

export function setWorld(c) {
  const d = DPR(), s = state.scale * d;
  c.setTransform(s, 0, 0, -s, (state.w / 2 - state.cx * state.scale) * d, (state.h / 2 + state.cy * state.scale) * d);
  c.lineCap = 'round'; c.lineJoin = 'round';
}

export function draw() {
  try { drawMain(); } finally { drawOverlay(); }
}

function drawMain() {
  app.pending = false;
  app.G = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#212830';
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (state.grid) drawGrid(DPR());
  if (!app.model) return;
  setWorld(ctx);
  drawList(app.model.entities, null, null, 0);
  ctx.globalAlpha = 1;
  if (state.sel.size) {
    for (const e of state.sel) {
      const st = entityStyle(e, null, null);
      if (!st) continue;
      ctx.save();
      hairline(); ctx.lineWidth *= 2;
      ctx.setLineDash([6 / state.scale, 4 / state.scale]);
      if (e.type === 'TEXT' || e.type === 'MTEXT') {
        const b = textBox(e);
        if (b) { ctx.strokeStyle = '#8cc8ff'; ctx.beginPath(); b.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); }
      }
      drawEntity(e, st, 0, '#8cc8ff');
      ctx.restore();
    }
  }
}

export function hairline() {
  const m = app.G.getTransform();
  app.G.lineWidth = (app.printHair || DPR()) / Math.sqrt(Math.abs(m.a * m.d - m.b * m.c) || 1);
}

export function drawList(list, pL, pC, depth, override?, parent?) {
  if (!list || depth > 16) return;
  hairline();
  const base = app.G.lineWidth;
  const one = e => {
    if (e.inPaperSpace || e.visible === false) return;
    const st = entityStyle(e, pL, pC, parent);
    if (!st) return;
    if (depth === 0) app.G.globalAlpha = st.locked ? 0.45 : 1;
    app.G.lineWidth = base * (override ? 2 : lwFactor(st.lw));
    try { drawEntity(e, st, depth, override); } catch (err) { /* una entidad dañada no frena el resto */ }
  };
  if (depth === 0) { for (const e of list) if (e.type === 'XIMAGE') one(e); for (const e of list) if (e.type === 'HATCH') one(e); for (const e of list) if (e.type !== 'XIMAGE' && e.type !== 'HATCH') one(e); }
  else for (const e of list) one(e);
}

export function drawEntity(e, st, depth, override) {
  const col = override || rgb(st.color);
  app.G.strokeStyle = col; app.G.fillStyle = col;
  if (!override) { if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'HATCH' || e.type === 'XDIM' || e.type === 'XDIMR' || e.type === 'XDIMA' || e.type === 'INSERT' || e.type === 'DIMENSION') app.G.setLineDash([]); else applyDash(app.G, st.lt, e); }
  switch (e.type) {
    case 'LINE': {
      const [a, b] = e.vertices; if (!a || !b) return;
      app.G.beginPath(); app.G.moveTo(a.x, a.y); app.G.lineTo(b.x, b.y); app.G.stroke(); break;
    }
    case 'LWPOLYLINE': case 'POLYLINE': {
      if (e.is3dPolygonMesh || e.isPolyfaceMesh) return;
      const v = polyVerts(e); if (!v.length) return;
      app.G.beginPath(); app.G.moveTo(v[0].x, v[0].y);
      const n = v.length, segs = e.shape ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = v[i], b = v[(i + 1) % n];
        if (a.bulge) { const q = bulgeArc(a, b, a.bulge); if (q) { if (a.bulge > 0) app.G.arc(q.c.x, q.c.y, q.r, q.a0, q.a1, false); else app.G.arc(q.c.x, q.c.y, q.r, q.a1, q.a0, true); } }
        else app.G.lineTo(b.x, b.y);
      }
      if (e.shape) app.G.closePath();
      app.G.stroke(); break;
    }
    case 'CIRCLE': app.G.beginPath(); app.G.arc(e.center.x, e.center.y, e.radius, 0, TAU); app.G.stroke(); break;
    case 'ARC': app.G.beginPath(); app.G.arc(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle, false); app.G.stroke(); break;
    case 'ELLIPSE': case 'SPLINE': {
      const pts = e.type === 'ELLIPSE' ? ellipsePts(e) : splinePoints(e);
      if (pts.length < 2) return;
      app.G.beginPath(); app.G.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) app.G.lineTo(pts[i].x, pts[i].y);
      if (e.closed) app.G.closePath();
      app.G.stroke(); break;
    }
    case 'TEXT': case 'MTEXT': {
      const t = textLayout(e);
      if (t.p) drawText(e.type === 'TEXT' ? t.lines[0] : t.lines.join('\n'), t.p.x, t.p.y, t.h, t.rot, t.align, t.base, col);
      break;
    }
    case 'SOLID': {
      const p = e.points; if (!p || !p[0]) return;
      app.G.beginPath(); let first = true;
      for (const i of [0, 1, 3, 2]) { const q = p[i] || p[2]; if (!q) continue; if (first) app.G.moveTo(q.x, q.y); else app.G.lineTo(q.x, q.y); first = false; }
      app.G.closePath(); app.G.fill(); break;
    }
    case '3DFACE': {
      const v = e.vertices || []; if (v.length < 3) return;
      app.G.beginPath(); app.G.moveTo(v[0].x, v[0].y); for (let i = 1; i < v.length; i++) app.G.lineTo(v[i].x, v[i].y); app.G.closePath(); app.G.stroke(); break;
    }
    case 'POINT':
      if (!e.position || /^defpoints$/i.test(st.layer)) return;
      app.G.beginPath(); app.G.arc(e.position.x, e.position.y, app.G.lineWidth * 1.5, 0, TAU); app.G.fill(); break;
    case 'INSERT': case 'DIMENSION': drawInsert(e, st, depth, override); break;
    case 'XDIM': case 'XDIMR': case 'XDIMA': for (const s of xdimEnts(e)) drawEntity(s, st, depth, override); break;
    case 'XIMAGE': drawImageEnt(e, rgb(st.color), override); break;
    case 'HATCH': drawHatch(e, rgb(st.color), override); break;
  }
}

export function insertMatrix(e, blk) {
  if (e.type === 'DIMENSION') return e._xf || I;
  const p = e.position || { x: 0, y: 0 }, bp = (blk && blk.position) || { x: 0, y: 0 };
  const r = rad(e.rotation || 0), c = Math.cos(r), s = Math.sin(r), sx = e.xScale ?? 1, sy = e.yScale ?? 1;
  return mul([c, s, -s, c, p.x, p.y], [sx, 0, 0, sy, -bp.x * sx, -bp.y * sy]);
}

export function drawInsert(e, st, depth, override) {
  const blk = app.model.blocks[e.type === 'DIMENSION' ? e.block : e.name];
  if (!blk || !blk.entities) return;
  const cols = e.type === 'INSERT' ? (e.columnCount || 1) : 1, rows = e.type === 'INSERT' ? (e.rowCount || 1) : 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    app.G.save();
    const r0 = rad(e.rotation || 0);
    const off = e.type === 'INSERT' ? xfv(Rm(r0), { x: c * (e.columnSpacing || 0), y: r * (e.rowSpacing || 0) }) : { x: 0, y: 0 };
    const M = mul(Tm(off.x, off.y), insertMatrix(e, blk));
    app.G.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
    drawList(blk.entities, st.layer, st.color, depth + 1, override, st);
    app.G.restore();
  }
}

export function drawText(str, x, y, h, rotDeg, align, baseline, col) {
  if (!str || !h) return;
  const m = app.G.getTransform(), p = m.transformPoint({ x, y });
  const r = rad(rotDeg || 0), cos = Math.cos(r), sin = Math.sin(r);
  const ang = Math.atan2(m.b * cos + m.d * sin, m.a * cos + m.c * sin);
  const hPx = h * Math.hypot(-m.a * sin + m.c * cos, -m.b * sin + m.d * cos);
  if (hPx < 1.5) return;
  app.G.save();
  app.G.setTransform(1, 0, 0, 1, p.x, p.y);
  app.G.rotate(ang);
  app.G.font = (hPx / 0.72).toFixed(2) + 'px ' + FONT;
  app.G.textAlign = align; app.G.textBaseline = baseline; app.G.fillStyle = col;
  const lines = str.split('\n'), sp = hPx * 1.667;
  const off = baseline === 'middle' ? -(lines.length - 1) * sp / 2 : (baseline === 'bottom' || baseline === 'alphabetic') ? -(lines.length - 1) * sp : 0;
  lines.forEach((ln, i) => app.G.fillText(ln, 0, off + i * sp));
  app.G.restore();
}

export function drawGrid(d) {
  const step = Math.pow(10, Math.ceil(Math.log10(14 / state.scale)));
  const tl = toWorld(0, 0), br = toWorld(state.w, state.h);
  const lines = (s, color) => {
    ctx.beginPath();
    for (let x = Math.ceil(tl.x / s) * s; x <= br.x; x += s) { const sx = Math.round(toScreen({ x, y: 0 }).x * d) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, cv.height); }
    for (let y = Math.ceil(br.y / s) * s; y <= tl.y; y += s) { const sy = Math.round(toScreen({ x: 0, y }).y * d) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(cv.width, sy); }
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  };
  lines(step, '#283039'); lines(step * 10, '#323c47');
}
