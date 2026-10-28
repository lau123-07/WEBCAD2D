import { app } from '../core/app';
import { cv, ov, view } from '../core/dom';
import { DPR, state } from '../core/state';
import { computeBounds } from '../model/bounds';
import { requestDraw, toWorld } from './draw';
import { drawOverlay } from './overlay';

export function zoomToBox(b) {
  const w = (b.maxX - b.minX) || 1, h = (b.maxY - b.minY) || 1;
  state.scale = Math.min(state.w / w, state.h / h) * 0.9;
  state.cx = (b.minX + b.maxX) / 2; state.cy = (b.minY + b.maxY) / 2;
  requestDraw();
}

export function zoomExtents() {
  const b = computeBounds();
  if (b) zoomToBox(b);
  else { const s = app.model && app.model.units === 6 ? 10 : app.model && app.model.units === 5 ? 1000 : 10000; zoomToBox({ minX: 0, minY: 0, maxX: s, maxY: s * 0.7 }); }
}

export function zoomAt(sx, sy, f) {
  const p = toWorld(sx, sy);
  state.scale = Math.min(1e9, Math.max(1e-9, state.scale * f));
  state.cx = p.x - (sx - state.w / 2) / state.scale;
  state.cy = p.y + (sy - state.h / 2) / state.scale;
  requestDraw();
}

export function resize() {
  const r = view.getBoundingClientRect(), d = DPR(), first = state.w === 0;
  state.w = r.width; state.h = r.height;
  for (const c of [cv, ov]) { c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d)); }
  if (first && app.model) zoomExtents();
  requestDraw(); drawOverlay();
}
