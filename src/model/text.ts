import { deg, rad } from '../geom/math';

export function cleanText(s) {
  return String(s ?? '')
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
    .replace(/%%[uUoOkK]/g, '').replace(/%%%/g, '%')
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function cleanMText(s) {
  return cleanText(s)
    .replace(/\\P/g, '\n').replace(/\\~/g, ' ')
    .replace(/\\S([^;]*);/g, (_, x) => x.replace(/[#^]/, '/'))
    .replace(/\\[ACcFfHhQTWp][^;]*;/g, '')
    .replace(/\\[LlOoKkNX]/g, '')
    .replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002')
    .replace(/[{}]/g, '')
    .replace(/\u0001/g, '{').replace(/\u0002/g, '}');
}

export function textLayout(e) {
  if (e.type === 'TEXT') {
    const ha = e.halign || 0, va = e.valign || 0;
    const useEnd = (ha === 1 || ha === 2 || ha === 4 || va) && e.endPoint;
    return { p: useEnd ? e.endPoint : e.startPoint, h: e.textHeight, lines: [cleanText(e.text)],
      align: (ha === 1 || ha === 4) ? 'center' : ha === 2 ? 'right' : 'left',
      base: ha === 4 ? 'middle' : va === 3 ? 'top' : va === 2 ? 'middle' : va === 1 ? 'bottom' : 'alphabetic',
      rot: e.rotation || 0 };
  }
  const ap = e.attachmentPoint || 1;
  let rot = e.rotation || 0;
  if (e.directionVector) rot = deg(Math.atan2(e.directionVector.y, e.directionVector.x));
  return { p: e.position, h: e.height, lines: cleanMText(e.text).split('\n'),
    align: ['left', 'center', 'right'][(ap - 1) % 3], base: ['top', 'middle', 'bottom'][Math.floor((ap - 1) / 3)], rot };
}

export function textBox(e) {
  const t = textLayout(e);
  if (!t.p) return null;
  const h = t.h || 1, w = Math.max(1, ...t.lines.map(l => l.length)) * h * 0.66, tot = (t.lines.length - 1) * h * 1.667 + h;
  const x0 = t.align === 'left' ? 0 : t.align === 'center' ? -w / 2 : -w;
  const y0 = t.base === 'top' ? -tot : t.base === 'middle' ? -tot / 2 : 0;
  const r = rad(t.rot), c = Math.cos(r), s = Math.sin(r);
  const P = (x, y) => ({ x: t.p.x + x * c - y * s, y: t.p.y + x * s + y * c });
  return [P(x0, y0), P(x0 + w, y0), P(x0 + w, y0 + tot), P(x0, y0 + tot)];
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
