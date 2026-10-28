import { earClip, hatchSegs } from '../model/hatch';
import { allLinetypes } from '../model/linetypes';
import { app } from '../core/app';
import { ellipsePts, splinePoints } from '../geom/curves';
import { deg, norm, rad } from '../geom/math';
import { polyVerts } from '../geom/prims';
import { textLayout } from '../model/text';
import { explodeEnt } from '../model/transform';
import { nearestAci } from '../render/style';

export function encode1252(s) {
  let out = '';
  for (const ch of s) { const c = ch.codePointAt(0); out += (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); }
  const u = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i);
  return u;
}

export function writeDXF() {
  const o = [];
  const g = (c, v) => { o.push(String(c)); o.push(String(v)); };
  const num = v => { let s = (Number.isFinite(v) ? v : 0).toFixed(8).replace(/\.?0+$/, ''); return s === '-0' || s === '' ? '0' : s; };
  const pt = (c, p) => { g(c, num(p.x)); g(c + 10, num(p.y)); g(c + 20, '0.0'); };
  const usedLayers = new Set(['0']);
  const usedLt = new Set(['CONTINUOUS']);
  const pendingBlocks = [];
  let hatchN = 0;
  const expand = list => list.flatMap(e => (e.type === 'DIMENSION' || e.type === 'XDIM' || e.type === 'XDIMR' || e.type === 'XDIMA') ? expand(explodeEnt(e) || []) : [e]);
  const writeEnt = e => {
    const lay = e.layer ?? '0'; usedLayers.add(lay);
    const base = () => {
      g(8, lay);
      if (e.colorIndex !== undefined && e.colorIndex !== 256) g(62, e.colorIndex);
      else if (e.colorIndex === undefined && e.color !== undefined) g(62, nearestAci(e.color));
      const lt = e.lineType ? String(e.lineType).toUpperCase() : '';
      if (lt && lt !== 'BYLAYER') { g(6, lt); if (lt !== 'BYBLOCK') usedLt.add(lt); }
    };
    const poly = (pts, closed, bulges?) => {
      g(0, 'POLYLINE'); base(); g(66, 1); pt(10, { x: 0, y: 0 }); g(70, closed ? 1 : 0);
      pts.forEach((p, i) => { g(0, 'VERTEX'); g(8, lay); pt(10, p); if (bulges && bulges[i]) g(42, num(bulges[i])); });
      g(0, 'SEQEND'); g(8, lay);
    };
    switch (e.type) {
      case 'HATCH': {
        // R12 no tiene sombreados: se guardan como un bloque anónimo con sus líneas (igual que AutoCAD R12)
        const name = '*X' + (++hatchN), content = [];
        const byBlock = c => Object.assign(c, { layer: '0', colorIndex: 0 });
        if (e.solid) {
          if ((e.loops || []).length === 1) for (const t of earClip(e.loops[0])) content.push(byBlock({ type: 'SOLID', points: [t[0], t[1], t[2], t[2]] }));
          else { for (const lp of e.loops || []) content.push(byBlock({ type: 'LWPOLYLINE', shape: true, vertices: lp })); app.saveWarnSolid = true; }
        } else for (const s of hatchSegs(e).segs) content.push(byBlock({ type: 'LINE', vertices: [{ x: s[0], y: s[1] }, { x: s[2], y: s[3] }] }));
        pendingBlocks.push([name, { position: { x: 0, y: 0 } }, content]);
        g(0, 'INSERT'); base(); g(2, name); pt(10, { x: 0, y: 0 });
        break;
      }
      case 'LINE': g(0, 'LINE'); base(); pt(10, e.vertices[0]); pt(11, e.vertices[1]); break;
      case 'LWPOLYLINE': case 'POLYLINE': { const v = polyVerts(e); if (v.length >= 2) poly(v, e.shape, v.map(q => q.bulge || 0)); break; }
      case 'CIRCLE': g(0, 'CIRCLE'); base(); pt(10, e.center); g(40, num(e.radius)); break;
      case 'ARC': g(0, 'ARC'); base(); pt(10, e.center); g(40, num(e.radius)); g(50, num(deg(norm(e.startAngle)))); g(51, num(deg(norm(e.endAngle)))); break;
      case 'ELLIPSE': poly(ellipsePts(e), false); break;
      case 'SPLINE': poly(splinePoints(e), !!e.closed); break;
      case 'POINT': g(0, 'POINT'); base(); pt(10, e.position); break;
      case 'SOLID': g(0, 'SOLID'); base(); [10, 11, 12, 13].forEach((c, i) => pt(c, e.points[i] || e.points[2] || e.points[0])); break;
      case '3DFACE': g(0, '3DFACE'); base(); [10, 11, 12, 13].forEach((c, i) => pt(c, e.vertices[i] || e.vertices[e.vertices.length - 1])); break;
      case 'TEXT': {
        const ha = e.halign || 0, va = e.valign || 0;
        g(0, 'TEXT'); base(); pt(10, e.startPoint); g(40, num(e.textHeight)); g(1, String(e.text ?? '').replace(/[\r\n]+/g, ' '));
        if (e.rotation) g(50, num(e.rotation));
        if (ha) g(72, ha);
        if (ha || va) pt(11, e.endPoint || e.startPoint);
        if (va) g(73, va);
        break;
      }
      case 'MTEXT': {
        const t = textLayout(e), r = rad(t.rot), c = Math.cos(r), s = Math.sin(r), h = t.h || 1, n = t.lines.length;
        const ha = t.align === 'center' ? 1 : t.align === 'right' ? 2 : 0;
        const y0 = t.base === 'top' ? -h : t.base === 'middle' ? (n - 1) * h * 1.667 / 2 - h / 2 : (n - 1) * h * 1.667;
        t.lines.forEach((ln, i) => {
          if (!ln.trim()) return;
          const ly = y0 - i * h * 1.667, p = { x: t.p.x - ly * s, y: t.p.y + ly * c };
          g(0, 'TEXT'); base(); pt(10, p); g(40, num(h)); g(1, ln);
          if (t.rot) g(50, num(t.rot));
          if (ha) { g(72, ha); pt(11, p); }
        });
        break;
      }
      case 'INSERT':
        g(0, 'INSERT'); base(); g(2, e.name); pt(10, e.position);
        g(41, num(e.xScale ?? 1)); g(42, num(e.yScale ?? 1)); g(43, num(1)); g(50, num(e.rotation || 0));
        if ((e.columnCount || 1) > 1 || (e.rowCount || 1) > 1) { g(70, e.columnCount || 1); g(71, e.rowCount || 1); g(44, num(e.columnSpacing || 0)); g(45, num(e.rowSpacing || 0)); }
        break;
    }
  };
  const ents = expand(app.model.entities);
  const blockNames = new Set(), blockOut = [];
  const collect = list => list.forEach(e => {
    if (e.type === 'INSERT' && !blockNames.has(e.name) && app.model.blocks[e.name]) {
      blockNames.add(e.name);
      const blk = app.model.blocks[e.name], inner = expand((blk.entities || []).filter(x => !x.inPaperSpace));
      collect(inner); blockOut.push([e.name, blk, inner]);
    }
  });
  collect(ents);
  // contenido (se arma primero para saber qué capas se usan)
  for (const [name, blk, inner] of blockOut) {
    g(0, 'BLOCK'); g(8, '0'); g(2, name); g(70, name.startsWith('*') ? 1 : 0);
    pt(10, blk.position || { x: 0, y: 0 }); g(3, name);
    inner.forEach(writeEnt);
    g(0, 'ENDBLK'); g(8, '0');
  }
  const blocksTxt = o.splice(0);
  ents.forEach(writeEnt);
  const entsTxt = o.splice(0);
  for (const [name, blk, inner] of pendingBlocks) {
    g(0, 'BLOCK'); g(8, '0'); g(2, name); g(70, 1); pt(10, blk.position); g(3, name);
    inner.forEach(writeEnt);
    g(0, 'ENDBLK'); g(8, '0');
  }
  const hatchBlocksTxt = o.splice(0);
  app.model.layers.forEach((L, n) => { usedLayers.add(n); if (L.lineType) usedLt.add(String(L.lineType).toUpperCase()); });
  // encabezado y tablas
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
  g(9, '$INSBASE'); pt(10, { x: 0, y: 0 }); g(9, '$LTSCALE'); g(40, num(app.model.ltscale || 1)); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  const ltAll = allLinetypes();
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, usedLt.size);
  for (const n of usedLt) {
    const t = ltAll.get(n), pat = n === 'CONTINUOUS' || !t ? [] : t.pattern;
    g(0, 'LTYPE'); g(2, n); g(70, 0); g(3, (t && t.desc) || n); g(72, 65); g(73, pat.length); g(40, num(pat.reduce((a, v) => a + Math.abs(v), 0)));
    pat.forEach(v => g(49, num(v)));
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, usedLayers.size);
  for (const n of usedLayers) {
    const L = app.model.layers.get(n) || { aci: 7, visible: true };
    const aci = L.aci || nearestAci(L.color ?? 0xffffff);
    g(0, 'LAYER'); g(2, n); g(70, L.locked ? 4 : 0); g(62, L.visible === false ? -aci : aci); g(6, String(L.lineType || 'CONTINUOUS').toUpperCase());
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
  g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '2.5'); g(3, 'txt'); g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS'); o.push(...blocksTxt, ...hatchBlocksTxt); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES'); o.push(...entsTxt); g(0, 'ENDSEC');
  g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
