import { app } from '../core/app';
import { ACI, ACI_NAMES } from '../core/constants';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { dirtyCache } from '../model/bounds';
import { edit } from '../model/undo';
import { requestDraw } from '../render/draw';
import { renderLayers, sortedLayers } from './layers-panel';
import { LW_LIST, allLinetypes, lwLabel } from '../model/linetypes';
import { HATCH_PATTERNS, makeHatchLines, rescaleHatch } from '../model/hatch';
import { fmt } from '../geom/math';

export const TYPE_NAMES = { LINE: 'línea', LWPOLYLINE: 'polilínea', POLYLINE: 'polilínea', CIRCLE: 'círculo', ARC: 'arco', TEXT: 'texto', MTEXT: 'texto', INSERT: 'bloque', DIMENSION: 'cota', XDIM: 'cota', ELLIPSE: 'elipse', SPLINE: 'spline', SOLID: 'sólido', POINT: 'punto', '3DFACE': 'cara', XIMAGE: 'imagen', HATCH: 'sombreado', XDIMR: 'cota', XDIMA: 'cota' };

export function renderProps() {
  const box = $('propsBody'); box.textContent = '';
  if (!app.model) return;
  const sel = [...state.sel];
  const mkSelect = (label, options, value, onChange) => {
    const lab = document.createElement('label'); lab.append(label);
    const s = document.createElement('select');
    options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); });
    s.value = value; s.addEventListener('change', () => onChange(s.value));
    lab.append(s); box.append(lab);
  };
  const layerOpts = sortedLayers().map(L => [L.name, L.name]);
  const ltOpts = (withBy: boolean) => [...(withBy ? [['BYLAYER', 'PorCapa'], ['BYBLOCK', 'PorBloque']] : []), ...[...allLinetypes().values()].map(t => [t.name, `${t.desc || t.name}`])];
  const lwOpts = (withBy: boolean) => [...(withBy ? [['-1', 'PorCapa'], ['-2', 'PorBloque']] : []), ['-3', 'Por defecto'], ...LW_LIST.map(v => [String(v), lwLabel(v)])];
  const mkNumber = (label, value, onChange) => {
    const lab = document.createElement('label'); lab.append(label);
    const i = document.createElement('input'); i.type = 'text'; i.value = fmt(value); i.inputMode = 'decimal';
    i.style.cssText = 'width:100%;font:inherit;color:inherit;background:var(--panel-2);border:1px solid var(--line);border-radius:3px;padding:3px 6px';
    i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) onChange(v); else i.value = fmt(value); });
    lab.append(i); box.append(lab);
  };
  if (!sel.length) {
    const p = document.createElement('p'); p.textContent = 'Nada seleccionado. Lo nuevo se dibuja en la capa actual.'; box.append(p);
    mkSelect('Capa', layerOpts, state.curLayer, v => { state.curLayer = v; renderLayers(); renderProps(); });
    const L = app.model.layers.get(state.curLayer);
    if (L) {
      const ltv = String(L.lineType || 'CONTINUOUS').toUpperCase();
      const lo = ltOpts(false); if (!lo.some(([v]) => v === ltv)) lo.push([ltv, ltv]);
      mkSelect('Tipo línea', lo, ltv, v => { edit(() => { L.lineType = v; }); requestDraw(); });
      mkSelect('Grosor', lwOpts(false), String(L.lw ?? -3), v => { edit(() => { L.lw = +v; }); requestDraw(); });
    }
    mkNumber('Escala tipos', app.model.ltscale || 1, v => { app.model.ltscale = v; requestDraw(); });
    return;
  }
  const types = {}; sel.forEach(e => { const t = TYPE_NAMES[e.type] || e.type.toLowerCase(); types[t] = (types[t] || 0) + 1; });
  const p = document.createElement('p'); p.textContent = `${sel.length} seleccionado(s): ` + Object.entries(types).map(([t, n]) => `${n} ${t}`).join(', '); box.append(p);
  const lays = new Set(sel.map(e => e.layer ?? '0'));
  mkSelect('Capa', lays.size > 1 ? [['', '(varias)'], ...layerOpts] : layerOpts, lays.size > 1 ? '' : [...lays][0], v => {
    if (!v) return;
    edit(() => sel.forEach(e => { e.layer = v; dirtyCache(e); })); app.editCount++; renderLayers(); renderProps(); requestDraw();
  });
  const colOf = e => e.colorIndex === undefined ? (e.color === undefined ? 256 : -1) : e.colorIndex;
  const cols = new Set(sel.map(colOf));
  const colorOpts = [['256', 'PorCapa'], ['0', 'PorBloque'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [String(i), ACI_NAMES[i]])];
  const cv1 = cols.size === 1 ? String([...cols][0]) : '';
  const opts = colorOpts.some(([v]) => v === cv1) ? colorOpts : [['', cols.size > 1 ? '(varios)' : '(otro)'], ...colorOpts];
  mkSelect('Color', opts, cv1, v => {
    if (v === '') return;
    const k = +v;
    edit(() => sel.forEach(e => { e.colorIndex = k; if (k >= 1 && k <= 9) e.color = ACI[k]; else delete e.color; }));
    app.editCount++; requestDraw(); renderProps();
  });
  const same = (vals: string[]) => new Set(vals).size === 1 ? vals[0] : '';
  const ltCur = same(sel.map(e => String(e.lineType || 'BYLAYER').toUpperCase()));
  const lo = ltOpts(true); if (ltCur && !lo.some(([v]) => v === ltCur)) lo.push([ltCur, ltCur]);
  mkSelect('Tipo línea', ltCur ? lo : [['', '(varios)'], ...lo], ltCur, v => {
    if (!v) return;
    edit(() => sel.forEach(e => { e.lineType = v; })); app.editCount++; requestDraw(); renderProps();
  });
  const lwCur = same(sel.map(e => String(e.lineweight ?? -1)));
  const wo = lwOpts(true); if (lwCur && !wo.some(([v]) => v === lwCur)) wo.push([lwCur, lwLabel(+lwCur)]);
  mkSelect('Grosor', lwCur ? wo : [['', '(varios)'], ...wo], lwCur, v => {
    if (!v) return;
    edit(() => sel.forEach(e => { e.lineweight = +v; })); app.editCount++; requestDraw(); renderProps();
  });
  const hatches = sel.filter(e => e.type === 'HATCH');
  if (hatches.length && hatches.length === sel.length) {
    const pat = same(hatches.map(h => h.pattern || ''));
    const po = Object.entries(HATCH_PATTERNS).map(([k, v]) => [k, v.label]);
    if (pat && !po.some(([v]) => v === pat)) po.push([pat, pat + ' (del archivo)']);
    mkSelect('Patrón', pat ? po : [['', '(varios)'], ...po], pat, v => {
      if (!v || !HATCH_PATTERNS[v]) return;
      edit(() => hatches.forEach(h => { h.pattern = v; h.solid = v === 'SOLID'; h.scale = h.scale || 1; h.lines = makeHatchLines(v, h.scale, h.angle || 0); delete h._hs; }));
      app.editCount++; requestDraw(); renderProps();
    });
    if (hatches.length === 1 && !hatches[0].solid) mkNumber('Escala', hatches[0].scale || 1, v => { edit(() => rescaleHatch(hatches[0], v)); app.editCount++; requestDraw(); });
  }
}
