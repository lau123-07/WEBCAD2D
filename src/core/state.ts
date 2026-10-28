import { app } from './app';

export const DPR = () => app.dprOverride ?? (window.devicePixelRatio || 1);

export const state = {
  cx: 0, cy: 0, scale: 1, w: 0, h: 0,
  grid: false, snap: false, ortho: false, osnap: true, lwDisplay: true, dyn: true, snapStep: 10,
  mouse: null, world: null, snapPt: null,
  sel: new Set<any>(), curLayer: '0', textH: 250, lastR: 500, offD: 100, lastPt: null
};
