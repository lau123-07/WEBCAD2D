import { cmdPlot } from '../ui/plot-dialog';
import { cmdAutosave, cmdRecover } from '../io/autosave';
import { setToggle } from '../ui/events';
import { cmdFillet, cmdChamfer } from './corners';
import { cmdDimRadial, cmdDimAngular } from './annotate';
import { cmdHatch } from './hatch';
import { cmdCopyClip, cmdPaste } from './clipboard';
import { cmdGrip } from '../edit/grips';
import { requestDraw as _rd } from '../render/draw';
import { cmdArea, cmdDim, cmdDist } from './annotate';
import { cmdArc, cmdCircle, cmdLine, cmdPline, cmdRect, cmdText, rectPts } from './draw';
import { cmdImage } from './image';
import { cmdErase, cmdExplode, cmdExtend, cmdMirror, cmdMove, cmdOffset, cmdRotate, cmdScale, cmdTrim } from './modify';
import { app } from '../core/app';
import { CANCEL } from '../core/constants';
import { state } from '../core/state';
import { clearSel } from '../edit/selection';
import { fmt } from '../geom/math';
import { openDialog } from '../io/dxf-read';
import { exportPNG, printDrawing, saveDXF } from '../io/export';
import { loadModel, updateCount } from '../model/document';
import { styleNew } from '../model/factory';
import { pushUndo, redo, snapshot, undo } from '../model/undo';
import { drawOverlay } from '../render/overlay';
import { zoomExtents, zoomToBox } from '../render/view';
import { loadSample } from '../sample';
import { ask, cancelAll, getPt, log, parseNum, setPrompt } from '../ui/commandline';
import { renderLayers } from '../ui/layers-panel';
import { renderProps } from '../ui/props-panel';

export async function cmdZoom(args) {
  let r = args[0] ? args[0].toUpperCase() : await ask('string', 'ZOOM [Extensión/Ventana] <Extensión>:', { keywords: ['E', 'V'] });
  if (r === 'ENTER' || r === 'E') { zoomExtents(); return; }
  if (r === 'V' || r === 'W') {
    const a = await getPt('Precise primera esquina:'); if (a === 'ENTER') return;
    const b = await getPt('Precise esquina opuesta:', { base: a, rubber: false, preview: p => [styleNew({ type: 'LWPOLYLINE', shape: true, vertices: rectPts(a, p) })] });
    if (b === 'ENTER') return;
    zoomToBox({ minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
    return;
  }
  log('Opción no válida.', 'err');
}

export async function cmdNew() {
  if (app.dirty && !confirm('Hay cambios sin guardar. ¿Empezar un dibujo nuevo igual?')) return;
  const r = await ask('string', 'NUEVO Unidades del dibujo [mm/cm/m] <mm>:', { keywords: ['MM', 'CM', 'M'] });
  const units = r === 'CM' ? 5 : r === 'M' ? 6 : 4;
  const layers = new Map([['0', { name: '0', color: 0xffffff, aci: 7, visible: true, locked: false }]]);
  loadModel({ layers, entities: [], blocks: {}, skipped: {}, units }, 'Sin título.dxf', true);
}

export async function cmdSnap(args) {
  const n = args[0] ? parseNum(args[0].replace(',', '.')) : null;
  if (n > 0) { state.snapStep = n; setToggle('snap', true); log(`Snap a la grilla cada ${fmt(n)}.`); }
  else setToggle('snap', !state.snap);
}

export function cmdHelp() {
  log('Dibujo: L línea, PL polilínea, REC rectángulo, C círculo, A arco, T texto.');
  log('Modificar: E borrar, M mover, CO copiar, RO rotar, SC escalar, MI espejo, O desfase, TR recortar, EX alargar, F empalme, CHA chaflán, X descomponer. Grips: seleccioná y arrastrá los cuadraditos azules.');
  log('Referencia: IMAGEN inserta una foto, un escaneo o un PDF de fondo. SC con la opción R pone algo a escala usando una medida conocida.');
  log('Anotar y medir: DLI cota lineal, DAL alineada, DRA radio, DDI diámetro, DAN ángulo, H sombreado, DI distancia, AA área. Doble clic en un texto para editarlo.');
  log('Tipos y grosores de línea: en el panel de propiedades. ESCALATL cambia la escala de los trazos; GROSOR muestra u oculta los grosores. Ctrl+C / Ctrl+V copian y pegan.');
  log('Vista y archivo: Z zoom (E/V), ZE ver todo, U deshacer, REHACER, NUEVO, ABRIR, GUARDAR, GUARDARCOMO, EXPORTAR, IMPRIMIR (a escala, con rótulo), AUTOGUARDADO, RECUPERAR.');
  log('Ayudas: F3 Osnap, F7 grilla, F8 Ortho, F9 Snap (SNAP 50 cambia el paso). Coordenadas: x,y  @dx,dy  @dist<ángulo, o una distancia en la dirección del mouse.');
  log('Mouse: rueda = zoom, arrastrar con la rueda = mover la vista, clic derecho = Enter, Esc = cancelar.');
}

export const COMMANDS = {
  LINEA: { run: cmdLine, edit: true, tb: 'L' }, POLILINEA: { run: cmdPline, edit: true, tb: 'PL' },
  RECTANG: { run: cmdRect, edit: true, tb: 'REC' }, CIRCULO: { run: cmdCircle, edit: true, tb: 'C' },
  ARCO: { run: cmdArc, edit: true, tb: 'A' }, TEXTO: { run: cmdText, edit: true, tb: 'T' },
  BORRA: { run: cmdErase, edit: true, sel: true, tb: 'E' }, DESPLAZA: { run: () => cmdMove(false), edit: true, sel: true, tb: 'M' },
  COPIA: { run: () => cmdMove(true), edit: true, sel: true, tb: 'CO' }, GIRA: { run: cmdRotate, edit: true, sel: true, tb: 'RO' },
  ESCALA: { run: cmdScale, edit: true, sel: true, tb: 'SC' }, SIMETRIA: { run: cmdMirror, edit: true, sel: true, tb: 'MI' },
  DESFASE: { run: cmdOffset, edit: true, tb: 'O' }, RECORTA: { run: cmdTrim, edit: true, tb: 'TR' },
  ALARGA: { run: cmdExtend, edit: true, tb: 'EX' }, DESCOMP: { run: cmdExplode, edit: true, sel: true, tb: 'X' },
  ACOTALINEAL: { run: () => cmdDim(false), edit: true, tb: 'DLI' }, ACOTALINEADA: { run: () => cmdDim(true), edit: true, tb: 'DAL' },
  DIST: { run: cmdDist, edit: true, tb: 'DI' }, AREA: { run: cmdArea, edit: true, tb: 'AA' },
  ZOOM: { run: cmdZoom }, ZE: { run: () => zoomExtents() },
  U: { run: () => undo() }, REHACER: { run: () => redo() },
  NUEVO: { run: cmdNew }, ABRIR: { run: () => openDialog() }, GUARDAR: { run: () => saveDXF(false) }, GUARDARCOMO: { run: () => saveDXF(true) },
  EXPORTAR: { run: () => exportPNG() }, IMPRIMIR: { run: cmdPlot }, AUTOGUARDADO: { run: cmdAutosave }, RECUPERAR: { run: cmdRecover }, EJEMPLO: { run: () => loadSample() },
  REJILLA: { run: () => setToggle('grid', !state.grid) }, SNAP: { run: cmdSnap },
  ORTHO: { run: () => setToggle('ortho', !state.ortho) }, OSNAP: { run: () => setToggle('osnap', !state.osnap) },
  IMAGEN: { run: cmdImage, edit: true, tb: 'IMAGEN' },
  EMPALME: { run: cmdFillet, edit: true, tb: 'F' }, CHAFLAN: { run: cmdChamfer, edit: true, tb: 'CHA' },
  ACOTARADIO: { run: () => cmdDimRadial(false), edit: true, tb: 'DRA' }, ACOTADIAMETRO: { run: () => cmdDimRadial(true), edit: true, tb: 'DDI' },
  ACOTAANGULO: { run: cmdDimAngular, edit: true, tb: 'DAN' }, SOMBREADO: { run: cmdHatch, edit: true, tb: 'H' },
  COPYCLIP: { run: () => cmdCopyClip() }, PEGAR: { run: cmdPaste, edit: true },
  GRIP: { run: cmdGrip, edit: true },
  ESCALATL: { run: cmdLtscale }, GROSOR: { run: () => setToggle('lwDisplay', !state.lwDisplay) },
  CAPA: { run: () => log('Las capas están en el panel de la derecha: clic en el nombre la hace actual, doble clic la renombra.') },
  AYUDA: { run: cmdHelp }
};

export const ALIASES = {
  L: 'LINEA', LINE: 'LINEA', PL: 'POLILINEA', PLINE: 'POLILINEA', REC: 'RECTANG', RECTANGLE: 'RECTANG',
  C: 'CIRCULO', CIRCLE: 'CIRCULO', A: 'ARCO', ARC: 'ARCO', T: 'TEXTO', DT: 'TEXTO', TEXT: 'TEXTO',
  E: 'BORRA', BORRAR: 'BORRA', ERASE: 'BORRA', M: 'DESPLAZA', MOVE: 'DESPLAZA', CO: 'COPIA', CP: 'COPIA', COPY: 'COPIA',
  RO: 'GIRA', ROTATE: 'GIRA', SC: 'ESCALA', SCALE: 'ESCALA', MI: 'SIMETRIA', MIRROR: 'SIMETRIA',
  O: 'DESFASE', OFFSET: 'DESFASE', TR: 'RECORTA', TRIM: 'RECORTA', EX: 'ALARGA', EXTEND: 'ALARGA',
  X: 'DESCOMP', EXPLODE: 'DESCOMP', DLI: 'ACOTALINEAL', DAL: 'ACOTALINEADA', DI: 'DIST', AA: 'AREA',
  Z: 'ZOOM', UNDO: 'U', DESHACER: 'U', REDO: 'REHACER', NEW: 'NUEVO', OPEN: 'ABRIR', SAVE: 'GUARDAR', SAVEAS: 'GUARDARCOMO',
  PNG: 'EXPORTAR', PLOT: 'IMPRIMIR', AUTOSAVE: 'AUTOGUARDADO', SAVETIME: 'AUTOGUARDADO', RECOVER: 'RECUPERAR', DRAWINGRECOVERY: 'RECUPERAR', PDF: 'IMPRIMIR', GRID: 'REJILLA', GRILLA: 'REJILLA', ORTO: 'ORTHO',
  F: 'EMPALME', FILLET: 'EMPALME', CHA: 'CHAFLAN', CHAMFER: 'CHAFLAN', 'CHAFLÁN': 'CHAFLAN',
  DRA: 'ACOTARADIO', DIMRADIUS: 'ACOTARADIO', DDI: 'ACOTADIAMETRO', DIMDIAMETER: 'ACOTADIAMETRO', DAN: 'ACOTAANGULO', DIMANGULAR: 'ACOTAANGULO',
  H: 'SOMBREADO', BH: 'SOMBREADO', HATCH: 'SOMBREADO', SOMBREA: 'SOMBREADO', PASTECLIP: 'PEGAR', PASTE: 'PEGAR',
  LTSCALE: 'ESCALATL', LTS: 'ESCALATL', LWDISPLAY: 'GROSOR', LWD: 'GROSOR',
  LA: 'CAPA', LAYER: 'CAPA', IM: 'IMAGEN', IMAGE: 'IMAGEN', IMPORTAR: 'IMAGEN', PDFIMPORT: 'IMAGEN', IMAGEATTACH: 'IMAGEN', HELP: 'AYUDA', '?': 'AYUDA'
};

export const tick = () => new Promise(r => setTimeout(r, 0));

export async function runCommand(raw) {
  const parts = raw.trim().split(/\s+/), name = parts[0].toUpperCase(), key = ALIASES[name] || name, C = COMMANDS[key];
  if (!C) { log(`Comando desconocido "${name}". Escribí AYUDA para ver la lista.`, 'err'); return; }
  if (app.running) { cancelAll(); await tick(); }
  if (!app.model) return;
  log('Comando: ' + name, 'ok');
  app.lastCmd = name; app.running = key;
  document.querySelectorAll<HTMLElement>('#tools button').forEach(b => b.classList.toggle('active', b.dataset.cmd === C.tb));
  const snap = C.edit ? snapshot() : null;
  try { await C.run(parts.slice(1)); }
  catch (err) { if (err === CANCEL) log('*Cancelar*'); else { console.error(err); log('Error: ' + (err.message || err), 'err'); } }
  finally {
    app.running = null;
    if (app.req) { app.req = null; setPrompt('Comando:'); }
    if (snap && app.editCount !== snap.count) { pushUndo(snap); updateCount(); renderLayers(); }
    if (C.sel) clearSel();
    document.querySelectorAll('#tools button.active').forEach(b => b.classList.remove('active'));
    renderProps(); drawOverlay();
  }
}

async function cmdLtscale() {
  const v = await ask('number', `ESCALATL Escala de los tipos de línea <${fmt(app.model.ltscale || 1)}>:`);
  if (v === 'ENTER') return;
  if (!(v > 0)) { log('La escala tiene que ser mayor que cero.', 'err'); return; }
  app.model.ltscale = v; _rd(); log(`Escala de tipos de línea: ${fmt(v)}.`);
}
