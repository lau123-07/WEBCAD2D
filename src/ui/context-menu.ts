/* Menú del clic derecho: acciones sobre lo seleccionado, o generales si no hay selección */
import { runCommand } from '../commands/index';
import { app } from '../core/app';
import { state } from '../core/state';
import { setSel, clearSel, pickAt } from '../edit/selection';
import { redo, undo } from '../model/undo';
import { toWorld } from '../render/draw';
import { selectable } from '../render/style';
import { zoomExtents } from '../render/view';
import { log } from './commandline';
import { editTextEntity } from './text-dialog';

type Item = { label: string; key?: string; run: () => void; disabled?: boolean; danger?: boolean } | '-';

let menu: HTMLDivElement | null = null;
export function closeContextMenu() { if (menu) { menu.remove(); menu = null; } }

function focusProps() {
  const box = document.getElementById('props');
  box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  const first = box.querySelector('select, input') as HTMLElement; if (first) first.focus();
}

function itemsFor(): Item[] {
  const sel = [...state.sel];
  if (sel.length) {
    const one = sel.length === 1 ? sel[0] : null;
    const isText = one && (one.type === 'TEXT' || one.type === 'MTEXT');
    const explodable = sel.some(e => ['LWPOLYLINE', 'POLYLINE', 'INSERT', 'DIMENSION', 'XDIM', 'XDIMR', 'XDIMA', 'HATCH'].includes(e.type));
    return [
      ...(isText ? [{ label: 'Editar texto', key: 'doble clic', run: () => editTextEntity(one) }, '-'] as Item[] : []),
      { label: 'Mover', key: 'M', run: () => runCommand('M') },
      { label: 'Copiar', key: 'CO', run: () => runCommand('CO') },
      { label: 'Rotar', key: 'RO', run: () => runCommand('RO') },
      { label: 'Escalar', key: 'SC', run: () => runCommand('SC') },
      { label: 'Espejo', key: 'MI', run: () => runCommand('MI') },
      { label: 'Descomponer', key: 'X', run: () => runCommand('X'), disabled: !explodable },
      '-',
      { label: 'Copiar al portapapeles', key: 'Ctrl+C', run: () => runCommand('COPYCLIP') },
      { label: 'Propiedades', run: focusProps },
      { label: 'Deseleccionar', key: 'Esc', run: () => clearSel() },
      '-',
      { label: sel.length > 1 ? `Borrar (${sel.length})` : 'Borrar', key: 'Supr', run: () => runCommand('E'), danger: true }
    ];
  }
  const last = app.lastCmd;
  return [
    { label: last ? `Repetir ${last}` : 'Repetir último comando', key: 'Enter', run: () => runCommand(last), disabled: !last },
    '-',
    { label: 'Pegar', key: 'Ctrl+V', run: () => runCommand('PEGAR') },
    { label: 'Deshacer', key: 'Ctrl+Z', run: () => undo() },
    { label: 'Rehacer', key: 'Ctrl+Y', run: () => redo() },
    '-',
    { label: 'Seleccionar todo', run: () => { setSel(app.model.entities.filter(selectable), 'add'); log(`${state.sel.size} seleccionados.`); } },
    { label: 'Ver todo', key: 'doble clic rueda', run: () => zoomExtents() }
  ];
}

export function openContextMenu(clientX: number, clientY: number, sx: number, sy: number) {
  closeContextMenu();
  // clic derecho sobre un objeto sin nada seleccionado: se selecciona primero
  if (!state.sel.size) { const hit = pickAt(toWorld(sx, sy)); if (hit) setSel([hit], 'add'); }
  menu = document.createElement('div');
  menu.id = 'ctxMenu'; menu.setAttribute('role', 'menu');
  for (const it of itemsFor()) {
    if (it === '-') { const hr = document.createElement('div'); hr.className = 'sep'; menu.append(hr); continue; }
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled;
    if (it.danger) b.className = 'danger';
    const l = document.createElement('span'); l.textContent = it.label; b.append(l);
    if (it.key) { const k = document.createElement('kbd'); k.textContent = it.key; b.append(k); }
    b.addEventListener('click', () => { closeContextMenu(); it.run(); });
    menu.append(b);
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(clientX, window.innerWidth - r.width - 6) + 'px';
  menu.style.top = Math.min(clientY, window.innerHeight - r.height - 6) + 'px';
  const btns = [...menu.querySelectorAll('button:not(:disabled)')] as HTMLButtonElement[];
  btns[0]?.focus();
  menu.addEventListener('keydown', e => {
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeContextMenu(); }
  });
}

export function initContextMenu() {
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target as Node)) closeContextMenu(); }, true);
  window.addEventListener('blur', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
}
