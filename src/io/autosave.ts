/* =========================================================================
   Autoguardado: cada N minutos, si hay cambios sin guardar, se guarda una copia
   completa del dibujo dentro del navegador (IndexedDB). Al volver a abrir el
   editor, si quedó una copia de un dibujo no guardado, se ofrece recuperarla.
   ========================================================================= */
import { app } from '../core/app';
import { $ } from '../core/dom';
import { loadModel } from '../model/document';
import { markDirty } from '../model/undo';
import { requestDraw } from '../render/draw';
import { ask, log } from '../ui/commandline';
import { fmt } from '../geom/math';

const DB = 'cadweb', STORE = 'kv', KEY = 'autoguardado', MIN_KEY = 'cadweb-autoguardado-min';
const CACHE = new Set(['_bb', '_pts', '_fp', '_hs']);

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function put(value) {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
  } catch (e) { localStorage.setItem('cadweb-' + KEY, value); }
}
async function get(): Promise<string | null> {
  try {
    const db = await idb();
    const v = await new Promise<any>((res, rej) => { const t = db.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    db.close();
    return v ?? localStorage.getItem('cadweb-' + KEY);
  } catch (e) { return localStorage.getItem('cadweb-' + KEY); }
}
export async function clearAutosave() {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY); db.close(); } catch (e) { /* nada */ }
  try { localStorage.removeItem('cadweb-' + KEY); } catch (e) { /* nada */ }
}

function imageToDataURL(im) {
  try {
    if (im.img instanceof HTMLCanvasElement) return im.img.toDataURL('image/jpeg', 0.85);
    const c = document.createElement('canvas'); c.width = im.w; c.height = im.h;
    c.getContext('2d').drawImage(im.img, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  } catch (e) { return null; }
}

function serialize() {
  const m = app.model, images = {};
  for (const [id, im] of Object.entries(m.images || {}) as [string, any][]) {
    if (!m.entities.some(e => e.imgId === id)) continue;
    const url = imageToDataURL(im); if (url) images[id] = { url, w: im.w, h: im.h, name: im.name };
  }
  const data = {
    v: 1, time: Date.now(), name: app.fileName,
    model: { layers: [...m.layers.values()], entities: m.entities, blocks: m.blocks, linetypes: [...(m.linetypes || new Map()).values()],
      units: m.units, ltscale: m.ltscale, skipped: m.skipped, images }
  };
  return JSON.stringify(data, (k, v) => CACHE.has(k) ? undefined : v);
}

function deserialize(text: string) {
  const d = JSON.parse(text), m = d.model, images = {};
  for (const [id, im] of Object.entries(m.images || {}) as [string, any][]) {
    const img = new Image(), rec = { img, w: im.w, h: im.h, name: im.name, ready: false };
    img.onload = () => { rec.ready = true; requestDraw(); };
    img.src = im.url; images[id] = rec;
  }
  return {
    name: d.name, time: d.time,
    model: { layers: new Map(m.layers.map(L => [L.name, L])), entities: m.entities, blocks: m.blocks || {},
      linetypes: new Map((m.linetypes || []).map(t => [t.name, t])), units: m.units, ltscale: m.ltscale, skipped: m.skipped || {}, images }
  };
}

let lastCount = -1, lastTime = 0, timer = 0;
export const autosaveMinutes = () => { const v = parseFloat(localStorage.getItem(MIN_KEY) || '5'); return isFinite(v) && v >= 0 ? v : 5; };
const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export async function autosaveNow(force = false) {
  if (!app.model) return false;
  if (!force && (!app.dirty || app.editCount === lastCount)) return false;
  try {
    await put(serialize());
    lastCount = app.editCount; lastTime = Date.now();
    $('autosaveInfo').textContent = 'Autoguardado ' + hhmm(lastTime);
    return true;
  } catch (e) {
    $('autosaveInfo').textContent = 'Autoguardado: sin espacio';
    return false;
  }
}

function tick() {
  const min = autosaveMinutes();
  if (min > 0 && app.dirty && app.editCount !== lastCount && Date.now() - lastTime >= min * 60000 - 500) autosaveNow();
}
export function startAutosave() {
  clearInterval(timer);
  lastTime = Date.now();
  timer = window.setInterval(tick, 15000);
  const min = autosaveMinutes();
  $('autosaveInfo').textContent = min > 0 ? `Autoguardado cada ${fmt(min)} min` : 'Autoguardado desactivado';
}
/* Después de guardar el DXF ya no hace falta la copia de emergencia */
export function afterManualSave() { lastCount = app.editCount; clearAutosave(); }

export async function offerRecovery() {
  const text = await get();
  if (!text) return;
  let rec;
  try { rec = deserialize(text); } catch (e) { return; }
  const when = new Date(rec.time).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  if (!confirm(`Hay una copia automática de "${rec.name}" del ${when} que no se llegó a guardar.\n\n¿Querés recuperarla?`)) {
    log(`Hay una copia automática de "${rec.name}" (${when}). Para recuperarla más tarde, escribí RECUPERAR.`);
    return;
  }
  restore(rec);
}
function restore(rec) {
  loadModel(rec.model, rec.name, false);
  markDirty();
  log(`Recuperado "${rec.name}" desde la copia automática. Guardalo con GUARDAR para no perderlo.`, 'res');
}

export async function cmdRecover() {
  const text = await get();
  if (!text) { log('No hay ninguna copia automática guardada.'); return; }
  const rec = deserialize(text);
  if (app.dirty && !confirm('Hay cambios sin guardar en el dibujo actual. ¿Reemplazarlo por la copia automática?')) return;
  restore(rec);
}

export async function cmdAutosave(args: string[]) {
  let v: any = args[0] !== undefined ? parseFloat(args[0].replace(',', '.')) : await ask('number', `AUTOGUARDADO Minutos entre copias automáticas (0 = desactivado) <${fmt(autosaveMinutes())}>:`);
  if (v === 'ENTER') return;
  if (!(v >= 0)) { log('Escribí una cantidad de minutos (0 para desactivar).', 'err'); return; }
  localStorage.setItem(MIN_KEY, String(v));
  startAutosave();
  log(v > 0 ? `Autoguardado cada ${fmt(v)} minutos.` : 'Autoguardado desactivado.', 'res');
  if (v > 0) autosaveNow();
}
