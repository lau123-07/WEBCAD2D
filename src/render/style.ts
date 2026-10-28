import { app } from '../core/app';
import { ACI } from '../core/constants';
import { resolveLt, resolveLw } from '../model/linetypes';

export function rgb(n) {
  if (app.printMono) return '#000000';
  if (n === undefined || n === null || n === 0) n = 0xffffff;
  if (app.printMode) {
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (0.299 * r + 0.587 * g + 0.114 * b > 200) n = 0;
  }
  return '#' + n.toString(16).padStart(6, '0');
}

export function nearestAci(c) {
  let best = 7, bd = Infinity;
  for (let i = 1; i <= 9; i++) {
    const a = ACI[i];
    const d = (((a >> 16) & 255) - ((c >> 16) & 255)) ** 2 + (((a >> 8) & 255) - ((c >> 8) & 255)) ** 2 + ((a & 255) - (c & 255)) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function entityStyle(e, parentLayer, parentColor, parent?) {
  const own = e.layer === undefined ? '0' : e.layer;
  const layer = (own === '0' && parentLayer) ? parentLayer : own;
  const L = app.model.layers.get(layer);
  if (L && !L.visible) return null;
  const layerColor = L ? L.color : 0xffffff;
  let color;
  if (e.colorIndex === 0) color = parentColor ?? layerColor;
  else if (e.colorIndex === 256 || e.color === undefined) color = layerColor;
  else color = e.color;
  return { layer, color, locked: !!(L && L.locked), lt: resolveLt(e, L, parent), lw: resolveLw(e, L, parent) };
}

export const isVisible = e => !e.inPaperSpace && e.visible !== false && !!entityStyle(e, null, null);

export function selectable(e) {
  if (e.inPaperSpace || e.visible === false) return false;
  const L = app.model.layers.get(e.layer ?? '0');
  return !L || (L.visible && !L.locked);
}
