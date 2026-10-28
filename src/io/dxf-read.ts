import { scanLayerExtras } from './dxf-hatch';
import { app } from '../core/app';
import { STRUCTURAL, SUPPORTED, UNITS } from '../core/constants';
import { $ } from '../core/dom';

export function openDialog() {
  if (app.dirty && !confirm('Hay cambios sin guardar. ¿Abrir otro archivo igual?')) return;
  $('fileInput').click();
}

export function buildModel(dxf, text) {
  const layers = new Map();
  const extras = scanLayerExtras(text);
  const table = (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) || {};
  for (const [n, L] of Object.entries(table) as [string, any][]) {
    if (!n || n === 'undefined') continue;
    const x = extras.get(n) || {};
    layers.set(n, { name: n, color: L.color ?? 0xffffff, aci: L.colorIndex || 7, visible: L.visible !== false && !L.frozen, locked: false, lineType: x.lt || 'CONTINUOUS', lw: x.lw ?? -3 });
  }
  const ensure = n => { if (!layers.has(n)) layers.set(n, { name: n, color: 0xffffff, aci: 7, visible: true, locked: false }); };
  ensure('0');
  const entities = (dxf.entities || []).filter(e => !e.inPaperSpace);
  entities.forEach(e => ensure(e.layer ?? '0'));
  for (const b of Object.values(dxf.blocks || {}) as any[]) (b.entities || []).forEach(e => ensure(e.layer ?? '0'));
  const u = dxf.header && dxf.header.$INSUNITS;
  const linetypes = new Map();
  const lts = (dxf.tables && dxf.tables.lineType && dxf.tables.lineType.lineTypes) || {};
  for (const [n, t] of Object.entries(lts) as [string, any][]) {
    const up = String(n).toUpperCase();
    if (!n || up === 'BYLAYER' || up === 'BYBLOCK') continue;
    linetypes.set(up, { name: up, desc: t.description || n, pattern: (t.pattern || []).map(Number).filter(v => isFinite(v)) });
  }
  const ltscale = dxf.header && +dxf.header.$LTSCALE > 0 ? +dxf.header.$LTSCALE : 0;
  return { layers, entities, blocks: dxf.blocks || {}, skipped: scanUnsupported(text), units: UNITS[u] ? u : 0, linetypes, ltscale };
}

export function scanUnsupported(text) {
  const lines = text.split(/\r\n|\r|\n/), out = {};
  let sec = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), val = lines[i + 1].trim();
    if (code === '0') {
      if (val === 'SECTION') { sec = '?'; continue; }
      if (val === 'ENDSEC') { sec = null; continue; }
      if ((sec === 'ENTITIES' || sec === 'BLOCKS') && !SUPPORTED.has(val) && !STRUCTURAL.has(val)) out[val] = (out[val] || 0) + 1;
    } else if (code === '2' && sec === '?') sec = val;
  }
  return out;
}
