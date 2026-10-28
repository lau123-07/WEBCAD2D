import { app } from '../core/app';
import { ACI, ACI_FULL } from '../core/constants';
import { add } from '../geom/math';

export function registerImage(src, w, h, name) {
  const id = 'img' + (++app.imgSeq) + '_' + Date.now();
  app.model.images[id] = { img: src, w, h, name, ready: true };
  return id;
}

export function loadImageFile(file: Blob): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}

export function ensureLayer(name, aci) {
  if (!app.model.layers.has(name)) app.model.layers.set(name, { name, color: ACI[aci] ?? ACI_FULL[aci] ?? 0xffffff, aci, visible: true, locked: false });
  return name;
}

export function mkImage(imgId, p, width) {
  const im = app.model.images[imgId];
  return { type: 'XIMAGE', layer: ensureLayer('IMAGEN', 8), colorIndex: 256, imgId, p: { x: p.x, y: p.y }, u: { x: width, y: 0 }, v: { x: 0, y: width * im.h / im.w }, fade: 0.45 };
}

export function imageCorners(e) { return [e.p, add(e.p, e.u), add(add(e.p, e.u), e.v), add(e.p, e.v)]; }

export function drawImageEnt(e, col, override) {
  const im = app.model.images[e.imgId];
  if (im && im.ready) {
    app.G.save();
    app.G.globalAlpha = app.G.globalAlpha * (e.fade ?? 0.45);
    app.G.transform(e.u.x / im.w, e.u.y / im.w, -e.v.x / im.h, -e.v.y / im.h, e.p.x + e.v.x, e.p.y + e.v.y);
    app.G.imageSmoothingEnabled = true;
    app.G.drawImage(im.img, 0, 0);
    app.G.restore();
  }
  const c = imageCorners(e);
  app.G.save();
  app.G.strokeStyle = override || col; app.G.globalAlpha = override ? 1 : 0.5;
  app.G.beginPath(); c.forEach((p, i) => i ? app.G.lineTo(p.x, p.y) : app.G.moveTo(p.x, p.y)); app.G.closePath(); app.G.stroke();
  app.G.restore();
}

export const TIP_SCALE = 'Para ponerlo a escala: SC (Escalar), elegí el objeto, un punto base, después R (Referencia), marcá dos puntos de una medida que conozcas y escribí la medida real.';
