/* Tipos de línea y grosores, con la misma lógica que AutoCAD (PorCapa / PorBloque) */
import { app } from '../core/app';
import { DPR, state } from '../core/state';

// Valores de acadiso.lin (en mm de dibujo; se multiplican por la escala de tipos de línea)
export const BUILTIN_LT: Record<string, { desc: string; pattern: number[] }> = {
  CONTINUOUS: { desc: 'Continua', pattern: [] },
  DASHED: { desc: 'Trazos', pattern: [12.7, -6.35] },
  HIDDEN: { desc: 'Oculta', pattern: [6.35, -3.175] },
  CENTER: { desc: 'Eje', pattern: [31.75, -6.35, 6.35, -6.35] },
  DASHDOT: { desc: 'Trazo y punto', pattern: [12.7, -6.35, 0, -6.35] },
  DOT: { desc: 'Puntos', pattern: [0, -6.35] },
  PHANTOM: { desc: 'Fantasma', pattern: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] }
};

// Grosores estándar en centésimas de mm (-1 PorCapa, -2 PorBloque, -3 Por defecto)
export const LW_LIST = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export function lwFromDwg(v) {
  if (v === 29) return -1; if (v === 30) return -2; if (v === 31 || v === undefined || v === null) return -3;
  return v >= 0 && v < LW_LIST.length ? LW_LIST[v] : v;
}
export const lwLabel = v => v === -1 ? 'PorCapa' : v === -2 ? 'PorBloque' : v === -3 ? 'Por defecto' : (v / 100).toFixed(2).replace('.', ',') + ' mm';

export function allLinetypes() {
  const m = new Map<string, { name: string; desc: string; pattern: number[] }>();
  for (const [n, v] of Object.entries(BUILTIN_LT)) m.set(n, { name: n, ...v });
  if (app.model && app.model.linetypes) for (const [n, v] of app.model.linetypes) m.set(n, v);
  return m;
}
export function ltPattern(name: string) {
  if (!name) return null;
  const up = name.toUpperCase();
  const own = app.model && app.model.linetypes && app.model.linetypes.get(up);
  if (own) return own.pattern;
  return BUILTIN_LT[up] ? BUILTIN_LT[up].pattern : null;
}

/* Resuelve tipo y grosor efectivos de una entidad */
export function resolveLt(e, L, parent) {
  const raw = String(e.lineType || 'BYLAYER').toUpperCase();
  if (raw === 'BYLAYER' || raw === '') return String((L && L.lineType) || 'CONTINUOUS').toUpperCase();
  if (raw === 'BYBLOCK') return (parent && parent.lt) || 'CONTINUOUS';
  return raw;
}
export function resolveLw(e, L, parent) {
  const raw = e.lineweight ?? -1;
  let v = raw === -1 ? (L && L.lw !== undefined ? L.lw : -3) : raw === -2 ? (parent ? parent.lw : -3) : raw;
  if (v === -1 || v === -2 || v === -3 || v === undefined) v = 25;
  return v;
}
/* Factor de grosor en pantalla: hasta 0,25 mm se ve fino; más grueso, proporcional */
export function lwFactor(lw) {
  // al imprimir a escala, el grosor es real: 1 = 0,25 mm de papel (mínimo 0,13 mm)
  if (app.printHair) return Math.max(lw, 13) / 25;
  if (!state.lwDisplay) return 1;
  return lw <= 25 ? 1 : Math.min(8, lw / 25);
}
/* Aplica el patrón de trazos en el sistema de coordenadas actual del canvas */
export function applyDash(G: CanvasRenderingContext2D, lt: string, e) {
  const pat = ltPattern(lt);
  if (!pat || !pat.length) { G.setLineDash([]); return; }
  const k = (app.model.ltscale || 1) * (e.lineTypeScale || 1);
  const m = G.getTransform(), px = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / DPR();
  const total = pat.reduce((t, v) => t + Math.abs(v), 0) * k;
  if (total * px < 6) { G.setLineDash([]); return; } // muy chico en pantalla: se ve continua
  let arr = pat.map(v => v === 0 ? G.lineWidth * 0.05 : Math.abs(v) * k);
  if (pat[0] < 0) arr = [0, ...arr];
  if (arr.length % 2) arr = [...arr, 0];
  G.setLineDash(arr);
}
