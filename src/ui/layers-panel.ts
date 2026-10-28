import { app } from '../core/app';
import { ACI, ACI_NAMES } from '../core/constants';
import { $ } from '../core/dom';
import { state } from '../core/state';
import { edit } from '../model/undo';
import { requestDraw } from '../render/draw';
import { rgb } from '../render/style';
import { log } from './commandline';
import { renderProps } from './props-panel';

export function sortedLayers() {
  return [...app.model.layers.values()].sort((a, b) => a.name === '0' ? -1 : b.name === '0' ? 1 : a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export function renderLayers() {
  if (!app.model) return;
  const ul = $('layers'); ul.textContent = '';
  const counts = new Map();
  app.model.entities.forEach(e => { const n = e.layer ?? '0'; counts.set(n, (counts.get(n) || 0) + 1); });
  for (const L of sortedLayers()) {
    const li = document.createElement('li');
    li.className = 'row' + (L.visible ? '' : ' off') + (L.name === state.curLayer ? ' current' : '');
    const cur = document.createElement('span'); cur.className = 'cur'; cur.textContent = L.name === state.curLayer ? '✓' : '';
    const vis = document.createElement('input'); vis.type = 'checkbox'; vis.checked = L.visible; vis.title = 'Mostrar u ocultar';
    vis.addEventListener('change', () => { L.visible = vis.checked; li.classList.toggle('off', !L.visible); state.sel.forEach(e => { if ((e.layer ?? '0') === L.name && !L.visible) state.sel.delete(e); }); renderProps(); requestDraw(); });
    const lock = document.createElement('input'); lock.type = 'checkbox'; lock.checked = !!L.locked; lock.title = 'Bloquear (no se puede seleccionar ni modificar)';
    lock.addEventListener('change', () => { L.locked = lock.checked; state.sel.forEach(e => { if ((e.layer ?? '0') === L.name && L.locked) state.sel.delete(e); }); renderProps(); requestDraw(); });
    const sw = document.createElement('button'); sw.className = 'sw'; sw.style.background = rgb(L.color); sw.title = 'Cambiar color de la capa';
    sw.addEventListener('click', ev => { ev.stopPropagation(); openColorMenu(sw, L); });
    const nm = document.createElement('span'); nm.className = 'lname'; nm.textContent = L.name;
    nm.title = 'Clic: hacer actual. Doble clic: renombrar.';
    nm.addEventListener('click', () => { state.curLayer = L.name; renderLayers(); renderProps(); log(`Capa actual: ${L.name}.`); });
    nm.addEventListener('dblclick', () => renameLayer(L));
    const ct = document.createElement('span'); ct.className = 'cnt'; ct.textContent = counts.get(L.name) ? counts.get(L.name).toLocaleString('es-AR') : '';
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '×';
    const why = L.name === '0' ? 'La capa 0 no se puede borrar.' : L.name === state.curLayer ? 'No se puede borrar la capa actual.' : counts.get(L.name) ? 'La capa tiene objetos.' : '';
    del.disabled = !!why; del.title = why || 'Borrar capa';
    del.setAttribute('aria-label', 'Borrar capa ' + L.name);
    del.addEventListener('click', () => { edit(() => app.model.layers.delete(L.name)); renderLayers(); renderProps(); log(`Capa ${L.name} borrada.`); });
    li.append(cur, vis, lock, sw, nm, ct, del);
    ul.append(li);
  }
}

export function renameLayer(L) {
  if (L.name === '0') { log('La capa 0 no se puede renombrar.', 'warn'); return; }
  const n = (prompt('Nuevo nombre de la capa:', L.name) || '').trim();
  if (!n || n === L.name) return;
  if (app.model.layers.has(n)) { log(`Ya existe una capa llamada ${n}.`, 'err'); return; }
  if (/[<>\/\\":;?*|=,]/.test(n)) { log('El nombre tiene caracteres no permitidos.', 'err'); return; }
  const old = L.name;
  edit(() => {
    const layers = new Map();
    app.model.layers.forEach((v, k) => { if (k === old) { v.name = n; layers.set(n, v); } else layers.set(k, v); });
    app.model.layers = layers;
    app.model.entities.forEach(e => { if (e.layer === old) e.layer = n; });
    if (state.curLayer === old) state.curLayer = n;
  });
  renderLayers(); renderProps();
}

export function newLayer() {
  let i = 1; while (app.model.layers.has('Capa' + i)) i++;
  const n = (prompt('Nombre de la nueva capa:', 'Capa' + i) || '').trim();
  if (!n) return;
  if (app.model.layers.has(n)) { log(`Ya existe una capa llamada ${n}.`, 'err'); return; }
  if (/[<>\/\\":;?*|=,]/.test(n)) { log('El nombre tiene caracteres no permitidos.', 'err'); return; }
  const aci = (app.model.layers.size % 6) + 1;
  edit(() => { app.model.layers.set(n, { name: n, color: ACI[aci], aci, visible: true, locked: false }); state.curLayer = n; });
  renderLayers(); renderProps(); log(`Capa ${n} creada y puesta como actual.`);
}

export const colorMenu = $('colorMenu');

export function openColorMenu(anchor, L) {
  colorMenu.textContent = '';
  for (let i = 1; i <= 9; i++) {
    const b = document.createElement('button'); b.setAttribute('role', 'menuitem');
    const sw = document.createElement('i'); sw.style.background = rgb(ACI[i]);
    b.append(sw, ACI_NAMES[i]);
    b.addEventListener('click', () => { edit(() => { L.aci = i; L.color = ACI[i]; }); closeColorMenu(); renderLayers(); requestDraw(); });
    colorMenu.append(b);
  }
  const r = anchor.getBoundingClientRect();
  colorMenu.style.left = Math.max(8, r.left - 200) + 'px';
  colorMenu.style.top = Math.min(window.innerHeight - 130, r.bottom + 4) + 'px';
  colorMenu.classList.add('open');
  colorMenu.querySelector('button').focus();
}

export function closeColorMenu() { colorMenu.classList.remove('open'); }
