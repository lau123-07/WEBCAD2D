/* Estado que cambia mientras se usa el editor (antes eran variables globales sueltas). */
import { ctx } from './dom';
export const app: any = {
  dprOverride: null,
  printMode: false,
  G: ctx,
  model: null,
  fileName: 'Sin título.dxf',
  fileHandle: null,
  dirty: false,
  editCount: 0,
  pending: false,
  req: null,
  running: null,
  lastCmd: '',
  winStart: null,
  winDrag: false,
  pan: null,
  lastMid: 0,
  winDown: null,
  dragDepth: 0,
  imgSeq: 0,
  dwgLibPromise: null,
};
