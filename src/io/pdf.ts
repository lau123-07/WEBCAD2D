import * as pdfjsLib from 'pdfjs-dist';
import './pdf-worker';
import { deg, dist, mul, sub, xf } from '../geom/math';

export async function readPDF(buf, name) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true }).promise;
  let pageNo = 1;
  if (doc.numPages > 1) {
    const r = prompt(`"${name}" tiene ${doc.numPages} páginas. ¿Cuál querés abrir? (1 a ${doc.numPages})`, '1');
    if (r === null) return null;
    pageNo = Math.min(doc.numPages, Math.max(1, parseInt(r, 10) || 1));
  }
  const page = await doc.getPage(pageNo);
  const O = pdfjsLib.OPS, ops = await page.getOperatorList();
  const K = 25.4 / 72; // puntos PDF → milímetros de papel
  let ctm = [K, 0, 0, K, 0, 0], stroke = 0, fillC = 0;
  const stack = [], ents = [];
  let path = [], cur = null, images = 0, segs = 0;
  const colorOf = a => {
    if (typeof a[0] === 'string') return parseInt(a[0].replace('#', ''), 16) || 0;
    return ((a[0] & 255) << 16) | ((a[1] & 255) << 8) | (a[2] & 255);
  };
  const T = (x, y) => xf(ctm, { x, y });
  const bez = (p0, p1, p2, p3) => {
    const out = [];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, mt = 1 - t;
      out.push({ x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
                 y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y });
    }
    return out;
  };
  const emit = (kind, forceClose) => {
    const color = kind === 'fill' ? fillC : stroke;
    for (const sp of path) {
      const pts = sp.pts.filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 1e-6);
      if (pts.length < 2) continue;
      const closed = sp.closed || forceClose;
      const layer = kind === 'fill' ? 'PDF rellenos' : 'PDF líneas';
      const style: any = { layer };
      if (color && color !== 0x000000) { style.color = color; }
      if (pts.length === 2 && !closed) ents.push({ ...style, type: 'LINE', vertices: pts });
      else ents.push({ ...style, type: 'LWPOLYLINE', shape: closed, vertices: pts });
      segs += pts.length - 1;
    }
    path = []; cur = null;
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    switch (fn) {
      case O.save: stack.push({ ctm, stroke, fillC }); break;
      case O.restore: { const s = stack.pop(); if (s) ({ ctm, stroke, fillC } = s); break; }
      case O.transform: ctm = mul(ctm, args); break;
      case O.paintFormXObjectBegin: stack.push({ ctm, stroke, fillC }); if (args && args[0]) ctm = mul(ctm, args[0]); break;
      case O.paintFormXObjectEnd: { const s = stack.pop(); if (s) ({ ctm, stroke, fillC } = s); break; }
      case O.setStrokeRGBColor: stroke = colorOf(args); break;
      case O.setFillRGBColor: fillC = colorOf(args); break;
      case O.constructPath: {
        const sub = args[0], co = args[1];
        let j = 0;
        for (const op of sub) {
          if (op === O.moveTo) { cur = { pts: [T(co[j], co[j + 1])], closed: false, raw: { x: co[j], y: co[j + 1] } }; path.push(cur); j += 2; }
          else if (op === O.lineTo) { if (!cur) { cur = { pts: [], closed: false }; path.push(cur); } cur.pts.push(T(co[j], co[j + 1])); cur.raw = { x: co[j], y: co[j + 1] }; j += 2; }
          else if (op === O.curveTo || op === O.curveTo2 || op === O.curveTo3) {
            if (!cur) { j += op === O.curveTo ? 6 : 4; continue; }
            const p0 = cur.raw || { x: co[j], y: co[j + 1] };
            let p1, p2, p3;
            if (op === O.curveTo) { p1 = { x: co[j], y: co[j + 1] }; p2 = { x: co[j + 2], y: co[j + 3] }; p3 = { x: co[j + 4], y: co[j + 5] }; j += 6; }
            else if (op === O.curveTo2) { p1 = p0; p2 = { x: co[j], y: co[j + 1] }; p3 = { x: co[j + 2], y: co[j + 3] }; j += 4; }
            else { p1 = { x: co[j], y: co[j + 1] }; p3 = { x: co[j + 2], y: co[j + 3] }; p2 = p3; j += 4; }
            bez(p0, p1, p2, p3).forEach(q => cur.pts.push(T(q.x, q.y)));
            cur.raw = p3;
          }
          else if (op === O.closePath) { if (cur) cur.closed = true; }
          else if (op === O.rectangle) {
            const x = co[j], y = co[j + 1], w = co[j + 2], h = co[j + 3]; j += 4;
            path.push({ pts: [T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)], closed: true });
            cur = null;
          }
        }
        break;
      }
      case O.stroke: emit('stroke', false); break;
      case O.closeStroke: emit('stroke', true); break;
      case O.fillStroke: case O.eoFillStroke: emit('stroke', false); break;
      case O.closeFillStroke: case O.closeEOFillStroke: emit('stroke', true); break;
      case O.fill: case O.eoFill: emit('fill', true); break;
      case O.endPath: path = []; cur = null; break;
      case O.paintImageXObject: case O.paintInlineImageXObject: case O.paintImageMaskXObject: case (O as any).paintJpegXObject: images++; break;
    }
  }
  const view1 = page.getViewport({ scale: 1 });
  const pageW = view1.width * K, pageH = view1.height * K;
  // Escaneo: casi sin líneas pero con imágenes → la página entera va como imagen de fondo
  if (segs < 20 && images > 0) {
    const s = Math.min(3, 4000 / Math.max(view1.width, view1.height));
    const vp = page.getViewport({ scale: s });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return { kind: 'image', src: c, w: c.width, h: c.height, widthMM: pageW, page: pageNo, pages: doc.numPages };
  }
  const tc = await page.getTextContent();
  for (const it of tc.items as any[]) {
    if (!it.str || !it.str.trim()) continue;
    const t = it.transform, p = xf([K, 0, 0, K, 0, 0], { x: t[4], y: t[5] });
    const size = Math.hypot(t[2], t[3]) * K;
    if (!(size > 0)) continue;
    ents.push({ layer: 'PDF textos', type: 'TEXT', text: it.str, startPoint: p, endPoint: { ...p }, textHeight: size * 0.7, rotation: deg(Math.atan2(t[1], t[0])), halign: 0, valign: 0 });
  }
  return { kind: 'vector', ents, page: pageNo, pages: doc.numPages, pageW, pageH };
}

export const PDF_LAYERS = [['PDF líneas', 7], ['PDF rellenos', 8], ['PDF textos', 2]];
