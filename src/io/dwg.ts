import { bulgePts, edgesToLoop } from './dxf-hatch';
import { lwFromDwg } from '../model/linetypes';
import { createModule, LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';
import wasmGzUrl from '../assets/libredwg-web.wasm.bin?url';
import { app } from '../core/app';
import { ACI_FULL, UNITS } from '../core/constants';
import { deg } from '../geom/math';

export function getDwgLib() {
  if (!app.dwgLibPromise) app.dwgLibPromise = (async () => {
    const raw = new Uint8Array(await (await fetch(wasmGzUrl)).arrayBuffer());
    // El archivo viene comprimido con gzip; si algún servidor ya lo descomprimió, se usa tal cual.
    const wasmBinary = raw[0] === 0x1f && raw[1] === 0x8b
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      : raw;
    const inst = await createModule({ wasmBinary, print: () => {}, printErr: () => {} } as any);
    return LibreDwg.createByWasmInstance(inst);
  })();
  app.dwgLibPromise.catch(() => { app.dwgLibPromise = null; });
  return app.dwgLibPromise;
}

export const SILENT_DWG = new Set(['ATTDEF', 'VIEWPORT', 'SEQEND', 'VERTEX_2D', 'VERTEX_3D', 'ATTRIB']);

export function dwgEnt(e, skipped) {
  const P = p => p ? { x: +p.x || 0, y: +p.y || 0 } : { x: 0, y: 0 };
  const b: any = { layer: e.layer || '0' };
  if (e.colorIndex !== undefined && e.colorIndex !== null) {
    b.colorIndex = e.colorIndex;
    if (e.colorIndex >= 1 && e.colorIndex <= 255) b.color = ACI_FULL[e.colorIndex];
  }
  if (e.isVisible === false) b.visible = false;
  if (e.lineType) b.lineType = String(e.lineType).toUpperCase();
  if (e.lineweight !== undefined) b.lineweight = lwFromDwg(e.lineweight);
  if (e.lineTypeScale && e.lineTypeScale !== 1) b.lineTypeScale = e.lineTypeScale;
  switch (e.type) {
    case 'LINE': return { ...b, type: 'LINE', vertices: [P(e.startPoint), P(e.endPoint)] };
    case 'LWPOLYLINE':
      return { ...b, type: 'LWPOLYLINE', shape: !!((e.flag & 512) || (e.flag & 1)),
        vertices: (e.vertices || []).map(v => v.bulge ? { x: v.x, y: v.y, bulge: v.bulge } : { x: v.x, y: v.y }) };
    case 'POLYLINE2D': case 'POLYLINE3D':
      return { ...b, type: 'POLYLINE', shape: !!(e.flag & 1),
        vertices: (e.vertices || []).filter(v => !(v.flag & 16)).map(v => v.bulge ? { x: v.x, y: v.y, bulge: v.bulge } : { x: v.x, y: v.y }) };
    case 'CIRCLE': return { ...b, type: 'CIRCLE', center: P(e.center), radius: e.radius };
    case 'ARC': return { ...b, type: 'ARC', center: P(e.center), radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle };
    case 'ELLIPSE': return { ...b, type: 'ELLIPSE', center: P(e.center), majorAxisEndPoint: P(e.majorAxisEndPoint), axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle };
    case 'SPLINE':
      return { ...b, type: 'SPLINE', degreeOfSplineCurve: e.degree || 3, closed: !!(e.flag & 1),
        controlPoints: (e.controlPoints || []).map(P), fitPoints: (e.fitPoints || []).map(P),
        knotValues: (e.knots && e.knots.length) ? [...e.knots] : undefined };
    case 'TEXT':
      return { ...b, type: 'TEXT', text: e.text, startPoint: P(e.startPoint), endPoint: P(e.endPoint && (e.endPoint.x || e.endPoint.y) ? e.endPoint : e.startPoint),
        textHeight: e.textHeight, rotation: deg(e.rotation || 0), halign: e.halign || 0, valign: e.valign || 0 };
    case 'MTEXT': {
      const m: any = { ...b, type: 'MTEXT', text: e.text, position: P(e.insertionPoint), height: e.textHeight, attachmentPoint: e.attachmentPoint || 1, rotation: deg(e.rotation || 0) };
      if (e.direction && (e.direction.x || e.direction.y)) m.directionVector = { x: e.direction.x, y: e.direction.y };
      return m;
    }
    case 'INSERT': {
      const ins: any = { ...b, type: 'INSERT', name: e.name, position: P(e.insertionPoint), xScale: e.xScale ?? 1, yScale: e.yScale ?? 1,
        rotation: deg(e.rotation || 0), columnCount: e.columnCount > 1 ? e.columnCount : 1, rowCount: e.rowCount > 1 ? e.rowCount : 1,
        columnSpacing: e.columnSpacing || 0, rowSpacing: e.rowSpacing || 0 };
      const out = [ins];
      for (const a of e.attribs || []) {
        const t = a.text || {};
        if (!t.text || (a.flags & 1)) continue;
        out.push({ layer: a.layer || ins.layer, colorIndex: a.colorIndex, color: a.colorIndex >= 1 && a.colorIndex <= 255 ? ACI_FULL[a.colorIndex] : undefined,
          type: 'TEXT', text: t.text, startPoint: P(t.startPoint), endPoint: P(t.endPoint && (t.endPoint.x || t.endPoint.y) ? t.endPoint : t.startPoint),
          textHeight: t.textHeight, rotation: deg(t.rotation || 0), halign: t.halign || 0, valign: t.valign || 0 });
      }
      return out;
    }
    case 'DIMENSION': return e.name ? { ...b, type: 'DIMENSION', block: e.name } : null;
    case 'SOLID': return { ...b, type: 'SOLID', points: [P(e.corner1), P(e.corner2), P(e.corner3), P(e.corner4 || e.corner3)] };
    case '3DFACE': return { ...b, type: '3DFACE', vertices: [P(e.corner1), P(e.corner2), P(e.corner3), P(e.corner4 || e.corner3)] };
    case 'POINT': return { ...b, type: 'POINT', position: P(e.position) };
    case 'HATCH': {
      const loops = [];
      for (const bp of e.boundaryPaths || []) {
        let pts;
        if (bp.vertices && bp.vertices.length) {
          pts = []; const v = bp.vertices;
          for (let i = 0; i < v.length; i++) { pts.push({ x: v[i].x, y: v[i].y }); if (v[i].bulge) pts.push(...bulgePts(v[i], v[(i + 1) % v.length], v[i].bulge)); }
        } else {
          const deg = a => (Math.abs(a) > Math.PI * 2 + 0.01 ? a : a * 180 / Math.PI);
          pts = edgesToLoop((bp.edges || []).map(ed => {
            const ccw = ed.isCCW ?? ed.isCounterClockwise ?? ed.ccw ?? true;
            if (ed.type === 1) return { t: 1, a: P(ed.start), b: P(ed.end) };
            if (ed.type === 2) return { t: 2, c: P(ed.center), r: ed.radius, s: deg(ed.startAngle), e: deg(ed.endAngle), ccw: !!ccw };
            if (ed.type === 3) return { t: 3, c: P(ed.center), m: P(ed.majorAxisEndPoint || ed.end), ratio: ed.lengthOfMinorAxis ?? ed.axisRatio ?? 1, s: deg(ed.startAngle), e: deg(ed.endAngle), ccw: !!ccw };
            return { t: 4, ctrl: (ed.controlPoints || []).map(P), fit: (ed.fitDatum || ed.fitPoints || []).map(P) };
          }));
        }
        if (pts.length >= 3) loops.push(pts);
      }
      if (!loops.length) return null;
      const name = String(e.patternName || '').toUpperCase();
      const lines = (e.definitionLines || []).map(L => ({ ang: (L.angle || 0) * 180 / Math.PI, base: P(L.base), off: P(L.offset), dashes: [...(L.dashLengths || [])] }));
      return { ...b, type: 'HATCH', loops, pattern: name, solid: e.solidFill === 1 || name === 'SOLID', scale: e.patternScale || 1, angle: (e.patternAngle || 0) * 180 / Math.PI, lines };
    }
    default:
      if (!SILENT_DWG.has(e.type)) skipped[e.type] = (skipped[e.type] || 0) + 1;
      return null;
  }
}

export async function readDWG(buf) {
  const lib = await getDwgLib();
  const ptr = lib.dwg_read_data(buf, Dwg_File_Type.DWG);
  if (ptr === undefined || ptr === null) throw new Error('no se pudo leer');
  let db;
  try { db = lib.convert(ptr); } finally { try { lib.dwg_free(ptr); } catch (e) { /* nada */ } }
  const skipped = {};
  const conv = list => { const out = []; for (const e of list || []) { let r = null; try { r = dwgEnt(e, skipped); } catch (err) { r = null; } if (r) Array.isArray(r) ? out.push(...r) : out.push(r); } return out; };
  const recs = (db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || [];
  const ms = recs.find(r => /^\*model_space$/i.test(r.name));
  const blocks = {};
  for (const r of recs as any[]) {
    if (/^\*(model|paper)_space/i.test(r.name)) continue;
    blocks[r.name] = { name: r.name, position: { x: (r.basePoint && r.basePoint.x) || 0, y: (r.basePoint && r.basePoint.y) || 0 }, entities: conv(r.entities) };
  }
  const entities = conv(ms ? ms.entities : (db.entities || []).filter(e => !/paper/i.test(String(e.ownerBlockRecordSoftId))));
  const layers = new Map();
  for (const Ly of (db.tables.LAYER && db.tables.LAYER.entries) || []) {
    const ci = Math.abs(Ly.colorIndex || 7) || 7;
    layers.set(Ly.name, { name: Ly.name, color: ACI_FULL[ci] ?? 0xffffff, aci: ci, visible: !Ly.off && !Ly.frozen && !(Ly.colorIndex < 0), locked: !!((Ly.standardFlag ?? Ly.flag ?? 0) & 4), lineType: String(Ly.lineType || 'CONTINUOUS').toUpperCase(), lw: lwFromDwg(Ly.lineweight) });
  }
  const ensure = n => { if (!layers.has(n)) layers.set(n, { name: n, color: 0xffffff, aci: 7, visible: true, locked: false }); };
  ensure('0');
  entities.forEach(e => ensure(e.layer ?? '0'));
  (Object.values(blocks) as any[]).forEach(bk => bk.entities.forEach(e => ensure(e.layer ?? '0')));
  const u = db.header && db.header.INSUNITS;
  const linetypes = new Map();
  for (const t of (db.tables.LTYPE && db.tables.LTYPE.entries) || []) {
    const up = String(t.name || '').toUpperCase();
    if (!up || up === 'BYLAYER' || up === 'BYBLOCK') continue;
    const pat = (t.pattern || []).map(x => typeof x === 'number' ? x : (x.elementLength ?? x.dashLength ?? x.length ?? 0)).filter(v => isFinite(v));
    linetypes.set(up, { name: up, desc: t.description || t.name, pattern: pat });
  }
  const ltscale = db.header && +db.header.LTSCALE > 0 ? +db.header.LTSCALE : 0;
  return { layers, entities, blocks, skipped, units: UNITS[u] ? u : 0, images: {}, linetypes, ltscale };
}
