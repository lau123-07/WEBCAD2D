/* SOMBREADO (H): clic adentro de un contorno cerrado, o elegir los contornos */
import { app } from '../core/app';
import { state } from '../core/state';
import { fmt, nice } from '../geom/math';
import { entBounds } from '../model/bounds';
import { HATCH_PATTERNS, loopOf, makeHatchLines } from '../model/hatch';
import { styleNew } from '../model/factory';
import { pointInPoly } from '../model/text';
import { addEntity } from '../model/undo';
import { clearSel, setSel } from '../edit/selection';
import { isVisible, selectable } from '../render/style';
import { ask, getPt, log } from '../ui/commandline';

const ALIAS = { SOLIDO: 'SOLID', 'SÓLIDO': 'SOLID', DIAGONAL: 'ANSI31', CRUZADO: 'ANSI37', LINEAS: 'LINE', 'LÍNEAS': 'LINE', MALLA: 'NET', LADRILLO: 'BRICK', PUNTOS: 'DOTS' };
const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };

function defaultScale() {
  const viewW = state.w / state.scale;
  return nice(viewW / 120 / 3.175);
}

export function mkHatch(loops) {
  const pattern = app.hatchPattern || 'ANSI31', scale = app.hatchScale || defaultScale(), angle = app.hatchAngle || 0;
  return styleNew({ type: 'HATCH', loops, pattern, solid: pattern === 'SOLID', scale, angle, lines: makeHatchLines(pattern, scale, angle) });
}

/* Busca el contorno cerrado más chico que contiene el punto, y las islas que tiene adentro */
function loopsAround(p) {
  const shapes = [];
  for (const e of app.model.entities) {
    if (e.type === 'HATCH' || !isVisible(e)) continue;
    const b = entBounds(e); if (!b) continue;
    const lp = loopOf(e); if (!lp) continue;
    shapes.push({ e, lp, b, a: area(lp) });
  }
  const containing = shapes.filter(s => p.x >= s.b.minX && p.x <= s.b.maxX && p.y >= s.b.minY && p.y <= s.b.maxY && pointInPoly(p, s.lp));
  if (!containing.length) return null;
  containing.sort((a, b) => a.a - b.a);
  const outer = containing[0];
  const islands = shapes.filter(s => s !== outer && s.a < outer.a && !pointInPoly(p, s.lp) &&
    s.b.minX >= outer.b.minX && s.b.maxX <= outer.b.maxX && s.b.minY >= outer.b.minY && s.b.maxY <= outer.b.maxY &&
    s.lp.every(q => pointInPoly(q, outer.lp)));
  return [outer.lp, ...islands.map(s => s.lp)];
}

export async function cmdHatch() {
  if (!app.hatchScale) app.hatchScale = defaultScale();
  while (true) {
    const label = HATCH_PATTERNS[app.hatchPattern || 'ANSI31'].label;
    const r = await getPt(`SOMBREADO (${label}, escala ${fmt(app.hatchScale)}) Precise un punto interno o [Objetos/Patrón/Escala/Ángulo]:`, { keywords: ['O', 'P', 'E', 'A'] });
    if (r === 'ENTER') break;
    if (r === 'P') {
      log('Patrones: ' + Object.entries(HATCH_PATTERNS).map(([k, v]) => `${k} (${v.label})`).join(', '));
      const keys = Object.keys(HATCH_PATTERNS);
      const v = await ask('string', `Patrón <${app.hatchPattern || 'ANSI31'}>:`, { keywords: keys, kwAlias: ALIAS });
      if (v !== 'ENTER') { if (keys.includes(v)) app.hatchPattern = v; else log('Ese patrón no existe.', 'err'); }
      continue;
    }
    if (r === 'E') { const v = await ask('number', `Escala del patrón <${fmt(app.hatchScale)}>:`); if (v !== 'ENTER') { if (v > 0) app.hatchScale = v; else log('La escala tiene que ser mayor que cero.', 'err'); } continue; }
    if (r === 'A') { const v = await ask('number', `Ángulo del patrón en grados <${fmt(app.hatchAngle || 0)}>:`); if (v !== 'ENTER') app.hatchAngle = v; continue; }
    if (r === 'O') {
      while (true) {
        const s = await ask('select', 'Designe contornos cerrados (Enter para terminar):', { keywords: ['TODO'] });
        if (s === 'TODO') { setSel(app.model.entities.filter(selectable), 'add'); continue; }
        if (s === 'ENTER') break;
      }
      const loops = [...state.sel].map(loopOf).filter(Boolean);
      clearSel();
      if (!loops.length) { log('Ninguno de esos objetos es un contorno cerrado (rectángulo, polilínea cerrada, círculo).', 'warn'); continue; }
      addEntity(mkHatch(loops)); log(`Sombreado agregado (${loops.length} contorno(s)).`, 'res');
      continue;
    }
    const loops = loopsAround(r);
    if (!loops) { log('No encontré un contorno cerrado alrededor de ese punto. El contorno tiene que ser un rectángulo, una polilínea cerrada o un círculo.', 'warn'); continue; }
    addEntity(mkHatch(loops));
    log(loops.length > 1 ? `Sombreado agregado, con ${loops.length - 1} isla(s) sin sombrear.` : 'Sombreado agregado.', 'res');
  }
}
