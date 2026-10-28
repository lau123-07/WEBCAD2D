
export const $ = (id: string): any => document.getElementById(id);

export const view = $('view');

export const cv: HTMLCanvasElement = $('main');

export const ctx: CanvasRenderingContext2D = cv.getContext('2d');

export const ov: HTMLCanvasElement = $('overlay');

export const octx: CanvasRenderingContext2D = ov.getContext('2d');
