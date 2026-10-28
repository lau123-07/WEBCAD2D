import { state } from '../core/state';

export const styleNew = e => Object.assign(e, { layer: state.curLayer, colorIndex: 256 });

export const mkLine = (a, b) => styleNew({ type: 'LINE', vertices: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] });

export const mkPoly = (pts, closed) => styleNew({ type: 'LWPOLYLINE', shape: !!closed, vertices: pts.map(p => ({ x: p.x, y: p.y })) });

export const mkCircle = (c, r) => styleNew({ type: 'CIRCLE', center: { x: c.x, y: c.y }, radius: r });

export const mkArc = (c, r, a0, a1) => styleNew({ type: 'ARC', center: { x: c.x, y: c.y }, radius: r, startAngle: a0, endAngle: a1 });

export function like(src, e) { e.layer = src.layer; if (src.colorIndex !== undefined) e.colorIndex = src.colorIndex; if (src.color !== undefined) e.color = src.color; return e; }
