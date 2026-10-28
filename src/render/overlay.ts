import { drawGrips } from '../edit/grips';
import { app } from '../core/app';
import { FONT, TAU } from '../core/constants';
import { ctx, octx, ov } from '../core/dom';
import { DPR, state } from '../core/state';
import { drawList, setWorld, toScreen } from './draw';

export const SNAP_NAMES = { end: 'Punto final', mid: 'Punto medio', cen: 'Centro', int: 'Intersección', per: 'Perpendicular', ins: 'Inserción', node: 'Punto' };

export function drawOverlay() {
  const d = DPR();
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalAlpha = 1;
  octx.clearRect(0, 0, ov.width, ov.height);
  octx.setLineDash([]);
  if (app.model && app.req && app.req.opts.preview && state.world) {
    let ents = [];
    try { ents = app.req.opts.preview(state.world) || []; } catch (err) { ents = []; }
    if (ents.length) { app.G = octx; setWorld(octx); drawList(ents, null, null, 0); app.G = ctx; octx.globalAlpha = 1; }
  }
  octx.setTransform(d, 0, 0, d, 0, 0);
  octx.setLineDash([]);
  if (app.req && app.req.opts.base && state.world && app.req.opts.rubber !== false) {
    const a = toScreen(app.req.opts.base), b = toScreen(state.world);
    octx.strokeStyle = 'rgba(220,225,230,.7)'; octx.lineWidth = 1; octx.setLineDash([4, 4]);
    octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke(); octx.setLineDash([]);
  }
  if (app.winStart && state.mouse) {
    const crossing = state.mouse.x < app.winStart.x;
    const x = Math.min(app.winStart.x, state.mouse.x), y = Math.min(app.winStart.y, state.mouse.y);
    const w = Math.abs(state.mouse.x - app.winStart.x), h = Math.abs(state.mouse.y - app.winStart.y);
    octx.fillStyle = crossing ? 'rgba(80,190,110,.15)' : 'rgba(80,130,255,.15)';
    octx.strokeStyle = crossing ? '#6fd08a' : '#7aa2ff';
    octx.setLineDash(crossing ? [5, 4] : []);
    octx.fillRect(x, y, w, h); octx.strokeRect(x + 0.5, y + 0.5, w, h); octx.setLineDash([]);
  }
  // ícono de ejes
  const ox = 22.5, oy = state.h - 22.5;
  octx.strokeStyle = '#7d8893'; octx.fillStyle = '#7d8893'; octx.lineWidth = 1.5;
  octx.beginPath(); octx.moveTo(ox, oy); octx.lineTo(ox + 36, oy); octx.moveTo(ox, oy); octx.lineTo(ox, oy - 36); octx.stroke();
  octx.font = '11px ' + FONT; octx.fillText('X', ox + 40, oy + 4); octx.fillText('Y', ox - 3, oy - 41);
  if (!state.mouse) { drawGrips(octx); return; }
  // cursor en cruz
  const pointMode = app.req && ['point', 'dist', 'angle'].includes(app.req.kind);
  const cp = state.world && pointMode ? toScreen(state.world) : state.mouse;
  const x = Math.round(cp.x) + 0.5, y = Math.round(cp.y) + 0.5;
  octx.strokeStyle = 'rgba(235,238,242,.85)'; octx.lineWidth = 1;
  octx.beginPath();
  octx.moveTo(0, y); octx.lineTo(x - 5, y); octx.moveTo(x + 5, y); octx.lineTo(state.w, y);
  octx.moveTo(x, 0); octx.lineTo(x, y - 5); octx.moveTo(x, y + 5); octx.lineTo(x, state.h);
  octx.stroke();
  if (!pointMode) octx.strokeRect(x - 5, y - 5, 10, 10);
  drawGrips(octx);
  // referencia a objeto
  if (state.snapPt && pointMode) {
    const s = toScreen(state.snapPt), r = 6;
    octx.strokeStyle = '#f2c744'; octx.lineWidth = 2; octx.beginPath();
    switch (state.snapPt.kind) {
      case 'end': octx.rect(s.x - r, s.y - r, 2 * r, 2 * r); break;
      case 'mid': octx.moveTo(s.x, s.y - r); octx.lineTo(s.x + r, s.y + r); octx.lineTo(s.x - r, s.y + r); octx.closePath(); break;
      case 'cen': octx.arc(s.x, s.y, r, 0, TAU); break;
      case 'int': octx.moveTo(s.x - r, s.y - r); octx.lineTo(s.x + r, s.y + r); octx.moveTo(s.x + r, s.y - r); octx.lineTo(s.x - r, s.y + r); break;
      case 'per': octx.moveTo(s.x - r, s.y + r); octx.lineTo(s.x + r, s.y + r); octx.moveTo(s.x, s.y + r); octx.lineTo(s.x, s.y - r); break;
      default: octx.moveTo(s.x - r, s.y); octx.lineTo(s.x + r, s.y); octx.moveTo(s.x, s.y - r); octx.lineTo(s.x, s.y + r); octx.rect(s.x - r / 2, s.y - r / 2, r, r);
    }
    octx.stroke();
    const label = SNAP_NAMES[state.snapPt.kind] || '';
    octx.font = '12px ' + FONT;
    const tw = octx.measureText(label).width;
    octx.fillStyle = '#f2e7b0'; octx.fillRect(s.x + 12, s.y + 12, tw + 10, 18);
    octx.fillStyle = '#222'; octx.fillText(label, s.x + 17, s.y + 25);
  }
}
