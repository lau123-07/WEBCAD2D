import { regroup } from '../model/groups';
/* Copiar (Ctrl+C) y pegar (Ctrl+V), también entre dibujos y ventanas distintas */
import { app } from '../core/app';
import { state } from '../core/state';
import { Tm } from '../geom/math';
import { entBounds } from '../model/bounds';
import { applyXform, cloneEnt } from '../model/transform';
import { requestDraw } from '../render/draw';
import { selectable } from '../render/style';
import { getPt, log } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';

const KEY = 'cadweb-portapapeles';

export function cmdCopyClip() {
  const sel = [...state.sel].filter(selectable);
  if (!sel.length) { log('Seleccioná primero lo que querés copiar.', 'warn'); return; }
  const ents = sel.filter(e => e.type !== 'XIMAGE').map(cloneEnt);
  if (ents.length < sel.length) log('Las imágenes de fondo no se copian.', 'warn');
  if (!ents.length) return;
  let minX = Infinity, minY = Infinity;
  for (const e of ents) { const b = entBounds(e); if (b) { minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); } }
  const blocks = {};
  const collect = list => list.forEach(e => {
    const n = e.type === 'INSERT' ? e.name : e.type === 'DIMENSION' ? e.block : null;
    if (n && !blocks[n] && app.model.blocks[n]) { blocks[n] = app.model.blocks[n]; collect(app.model.blocks[n].entities || []); }
  });
  collect(ents);
  const layerNames = new Set(ents.map(e => e.layer ?? '0'));
  Object.values(blocks).forEach((b: any) => (b.entities || []).forEach(e => layerNames.add(e.layer ?? '0')));
  const layers = [...layerNames].map(n => app.model.layers.get(n)).filter(Boolean);
  const linetypes = app.model.linetypes ? [...app.model.linetypes.values()] : [];
  const data = { v: 1, base: { x: isFinite(minX) ? minX : 0, y: isFinite(minY) ? minY : 0 }, ents, blocks, layers, linetypes };
  app.clipboard = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* sin almacenamiento: queda solo en esta ventana */ }
  log(`${ents.length} objeto(s) copiado(s). Ctrl+V para pegar, en este dibujo o en otro.`, 'res');
}

export async function cmdPaste() {
  let data = null;
  try { const t = localStorage.getItem(KEY); if (t) data = JSON.parse(t); } catch (err) { data = null; }
  data = data || app.clipboard;
  if (!data || !data.ents || !data.ents.length) { log('No hay nada copiado todavía. Seleccioná objetos y apretá Ctrl+C.', 'warn'); return; }
  const move = q => Tm(q.x - data.base.x, q.y - data.base.y);
  const p = await getPt('Precise punto de inserción:', { ghost: true, preview: q => data.ents.slice(0, 300).map(e => { const c = cloneEnt(e); applyXform(c, move(q)); return c; }) });
  if (p === 'ENTER') return;
  for (const [n, b] of Object.entries(data.blocks || {})) if (!app.model.blocks[n]) app.model.blocks[n] = b;
  for (const L of data.layers || []) if (!app.model.layers.has(L.name)) app.model.layers.set(L.name, L);
  for (const lt of data.linetypes || []) if (!app.model.linetypes.has(lt.name)) app.model.linetypes.set(lt.name, lt);
  const M = move(p);
  app.model.entities.push(...regroup(data.ents.map(e => { const c = cloneEnt(e); applyXform(c, M); return c; })));
  app.editCount++; requestDraw(); renderLayers();
  log(`${data.ents.length} objeto(s) pegado(s).`, 'res');
}
