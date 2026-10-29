/* Rosa de los vientos (N, E, S, O): indica hacia dónde está el Norte en el plano.
   Si se gira, todo lo que usa la orientación (por ejemplo, el rumbo de las líneas) la tiene en cuenta. */
import { app } from '../core/app';
import { state } from '../core/state';
import { angOf, nice } from '../geom/math';
import { arrowEnt } from './xdim';
import { addEntity } from './undo';
import { styleNew } from './factory';
import { ask, getPt, log } from '../ui/commandline';

export function northEnts(e) {
  const s = e.size, u = { x: Math.cos(e.ang), y: Math.sin(e.ang) }, v = { x: u.y, y: -u.x }; // v = Este (90° horario desde el Norte)
  const P = (a, k) => ({ x: e.p.x + a.x * k, y: e.p.y + a.y * k });
  const L = (a, b) => ({ type: 'LINE', vertices: [a, b] });
  const h = s * 0.32, g = s + h * 0.9;
  const T = (txt, at) => ({ type: 'TEXT', text: txt, textHeight: h, startPoint: at, endPoint: at, halign: 1, valign: 2, rotation: 0 });
  return [
    L(P(u, -s), P(u, s * 0.62)), L(P(v, -s), P(v, s)),
    arrowEnt(P(u, s), u, s * 0.4),
    T('N', P(u, g)), T('S', P(u, -g)), T('E', P(v, g)), T('O', P(v, -g))
  ];
}

/* Ángulo del Norte en el dibujo (radianes); por defecto, hacia arriba */
export function northAngle() {
  const n = app.model && app.model.entities.find(e => e.type === 'XNORTH');
  return n ? n.ang : Math.PI / 2;
}
export const hasNorth = () => !!(app.model && app.model.entities.some(e => e.type === 'XNORTH'));

/* Rumbo de una dirección: grados medidos desde el Norte en sentido horario, y su nombre (N, NE, E…) */
export function bearing(dirAng: number) {
  let d = (northAngle() - dirAng) * 180 / Math.PI;
  d = ((d % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return { deg: d, name: names[Math.round(d / 45) % 8] };
}

export async function cmdNorth() {
  const size = nice((state.w / state.scale) / 25);
  const mk = (p, ang) => styleNew({ type: 'XNORTH', p: { x: p.x, y: p.y }, size, ang });
  const p = await getPt('NORTE Hacé clic donde va la rosa de los vientos:', { preview: q => [mk(q, Math.PI / 2)] });
  if (p === 'ENTER') return;
  const a = await ask('angle', 'Indicá hacia dónde apunta el Norte (clic, o ángulo en grados) <arriba>:', { base: p, preview: q => [mk(p, angOf(p, q))] });
  const ang = a === 'ENTER' ? Math.PI / 2 : a * Math.PI / 180;
  if (app.model.entities.some(e => e.type === 'XNORTH')) log('Ya había una rosa de los vientos: para la orientación se usa la primera.', 'warn');
  addEntity(mk(p, ang));
  log('Rosa de los vientos agregada. Para girarla: Rotar (RO) o arrastrá el grip de la punta N.', 'res');
}
