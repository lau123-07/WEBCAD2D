import { app } from '../core/app';
import { SUPPORTED, TAU } from '../core/constants';
import { I, angOf, deg, detM, mul, rad, xf, xfv } from '../geom/math';
import { polyPrims } from '../geom/prims';
import { dirtyCache } from './bounds';
import { xdimEnts } from './xdim';
import { hatchSegs } from './hatch';
import { insertMatrix } from '../render/draw';

export function cloneEnt(e) { const c = structuredClone(e); dirtyCache(c); return c; }

export function applyXform(e, M) {
  const det = detM(M), s = Math.sqrt(Math.abs(det)), refl = det < 0, phi = Math.atan2(M[1], M[0]);
  const P = p => { if (!p) return; const q = xf(M, p); p.x = q.x; p.y = q.y; };
  switch (e.type) {
    case 'LINE': case '3DFACE': e.vertices.forEach(P); break;
    case 'LWPOLYLINE': case 'POLYLINE': e.vertices.forEach(v => { P(v); if (refl && v.bulge) v.bulge = -v.bulge; }); break;
    case 'SOLID': (e.points || []).forEach(P); break;
    case 'POINT': P(e.position); break;
    case 'CIRCLE': P(e.center); e.radius *= s; break;
    case 'ARC': {
      const c = e.center, r = e.radius;
      const ps = xf(M, { x: c.x + r * Math.cos(e.startAngle), y: c.y + r * Math.sin(e.startAngle) });
      const pe = xf(M, { x: c.x + r * Math.cos(e.endAngle), y: c.y + r * Math.sin(e.endAngle) });
      P(c); e.radius *= s;
      let a0 = angOf(c, ps), a1 = angOf(c, pe);
      if (refl) [a0, a1] = [a1, a0];
      e.startAngle = a0; e.endAngle = a1; break;
    }
    case 'ELLIPSE': {
      P(e.center);
      const m = xfv(M, e.majorAxisEndPoint); e.majorAxisEndPoint = { x: m.x, y: m.y, z: 0 };
      if (refl) { const a0 = e.startAngle ?? 0, a1 = e.endAngle ?? TAU; e.startAngle = -a1; e.endAngle = -a0; }
      break;
    }
    case 'SPLINE': (e.controlPoints || []).forEach(P); (e.fitPoints || []).forEach(P); break;
    case 'TEXT': case 'MTEXT': {
      const r = rad(e.rotation || 0);
      let dir = e.directionVector ? { x: e.directionVector.x, y: e.directionVector.y } : { x: Math.cos(r), y: Math.sin(r) };
      if (e.type === 'TEXT') { P(e.startPoint); if (e.endPoint && e.endPoint !== e.startPoint) P(e.endPoint); }
      else P(e.position);
      let d = xfv(M, dir);
      if (refl && (d.x < -1e-9 || (Math.abs(d.x) < 1e-9 && d.y < 0))) d = { x: -d.x, y: -d.y };
      e.rotation = deg(Math.atan2(d.y, d.x));
      if (e.directionVector) e.directionVector = { x: d.x, y: d.y, z: 0 };
      if (e.type === 'TEXT') e.textHeight *= s; else { e.height *= s; if (e.width) e.width *= s; }
      break;
    }
    case 'INSERT': {
      P(e.position);
      const r = rad(e.rotation || 0), sx = e.xScale ?? 1, sy = e.yScale ?? 1;
      e.rotation = deg(refl ? phi - r : r + phi);
      e.xScale = sx * s; e.yScale = (refl ? -sy : sy) * s;
      if (e.columnSpacing) e.columnSpacing *= s;
      if (e.rowSpacing) e.rowSpacing *= s;
      break;
    }
    case 'DIMENSION': e._xf = mul(M, e._xf || I); break;
    case 'XIMAGE': P(e.p); e.u = xfv(M, e.u); e.v = xfv(M, e.v); break;
    case 'XDIMR': P(e.c); P(e.pos); e.r *= s; e.h *= s; break;
    case 'XDIMA': {
      const ps = xf(M, { x: e.P.x + e.rad * Math.cos(e.a0), y: e.P.y + e.rad * Math.sin(e.a0) });
      const pe = xf(M, { x: e.P.x + e.rad * Math.cos(e.a1), y: e.P.y + e.rad * Math.sin(e.a1) });
      P(e.P); e.rad *= s; e.h *= s;
      let a0 = Math.atan2(ps.y - e.P.y, ps.x - e.P.x), a1 = Math.atan2(pe.y - e.P.y, pe.x - e.P.x);
      if (refl) [a0, a1] = [a1, a0];
      e.a0 = a0; e.a1 = a1; break;
    }
    case 'HATCH': {
      (e.loops || []).forEach(lp => lp.forEach(P));
      e.lines = (e.lines || []).map(L => {
        const d = xfv(M, { x: Math.cos(L.ang * Math.PI / 180), y: Math.sin(L.ang * Math.PI / 180) });
        return { ang: Math.atan2(d.y, d.x) * 180 / Math.PI, base: xf(M, L.base), off: xfv(M, L.off), dashes: (L.dashes || []).map(v => v * s) };
      });
      if (e.scale) e.scale *= s;
      if (!refl) e.angle = (e.angle || 0) + phi * 180 / Math.PI;
      break;
    }
    case 'XDIM': {
      [e.p1, e.p2, e.pos].forEach(P);
      const d = xfv(M, { x: Math.cos(e.ang), y: Math.sin(e.ang) });
      e.ang = Math.atan2(d.y, d.x); e.h *= s; break;
    }
    default: return false;
  }
  dirtyCache(e);
  return true;
}

export function explodeEnt(e) {
  const style = c => { c.layer = e.layer; if (e.colorIndex !== undefined) c.colorIndex = e.colorIndex; if (e.color !== undefined) c.color = e.color; return c; };
  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    return polyPrims(e).map(q => style(q.t === 'L'
      ? { type: 'LINE', vertices: [{ x: q.a.x, y: q.a.y }, { x: q.b.x, y: q.b.y }] }
      : { type: 'ARC', center: { x: q.c.x, y: q.c.y }, radius: q.r, startAngle: q.a0, endAngle: q.a1 }));
  }
  if (e.type === 'INSERT' || e.type === 'DIMENSION') {
    const blk = app.model.blocks[e.type === 'DIMENSION' ? e.block : e.name];
    if (!blk || !blk.entities) return [];
    const M = insertMatrix(e, blk);
    return blk.entities.filter(x => !x.inPaperSpace && x.type !== 'ATTDEF' && SUPPORTED.has(x.type)).map(x => {
      const c = cloneEnt(x);
      if (c.layer === '0' || c.layer === undefined) c.layer = e.layer;
      if (c.colorIndex === 0) { c.colorIndex = e.colorIndex; c.color = e.color; }
      applyXform(c, M);
      return c;
    });
  }
  if (e.type === 'HATCH') { const st = c => { c.layer = e.layer; if (e.colorIndex !== undefined) c.colorIndex = e.colorIndex; if (e.color !== undefined) c.color = e.color; return c; }; return hatchSegs(e).segs.map(s => st({ type: 'LINE', vertices: [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }] })); }
  if (e.type === 'XDIM' || e.type === 'XDIMR' || e.type === 'XDIMA') return xdimEnts(e).map(x => style(structuredClone(x)));
  return null;
}
