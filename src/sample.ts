import { app } from './core/app';
import { ACI } from './core/constants';
import { loadModel } from './model/document';

export function loadSample() {
  if (app.dirty && !confirm('Hay cambios sin guardar. ¿Cargar el ejemplo igual?')) return;
  const L = (x1, y1, x2, y2, layer = '0') => ({ type: 'LINE', layer, vertices: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
  const PL = (pts, closed, layer = '0') => ({ type: 'LWPOLYLINE', layer, shape: closed, vertices: pts.map(([x, y, bulge]) => bulge ? { x, y, bulge } : { x, y }) });
  const C = (x, y, r, layer = '0') => ({ type: 'CIRCLE', layer, center: { x, y }, radius: r });
  const T = (s, x, y, h, layer) => ({ type: 'TEXT', layer, text: s, textHeight: h, startPoint: { x, y }, endPoint: { x, y }, rotation: 0, halign: 0, valign: 0 });
  const D = (p1, p2, pos, ang, layer) => ({ type: 'XDIM', layer, p1, p2, pos, ang, h: 180 });
  const I2 = (name, x, y, layer, rot = 0) => ({ type: 'INSERT', layer, name, position: { x, y }, rotation: rot, xScale: 1, yScale: 1 });
  const b = 0.41421356;
  const rounded = (x0, y0, x1, y1, r, layer) => PL([[x0 + r, y0], [x1 - r, y0, b], [x1, y0 + r], [x1, y1 - r, b], [x1 - r, y1], [x0 + r, y1, b], [x0, y1 - r], [x0, y0 + r, b]], true, layer);
  const blocks = {
    PUERTA_90: { name: 'PUERTA_90', position: { x: 0, y: 0 }, entities: [L(0, 0, 900, 0), { type: 'ARC', layer: '0', center: { x: 0, y: 0 }, radius: 900, startAngle: 0, endAngle: Math.PI / 2 }] },
    MESA_4: { name: 'MESA_4', position: { x: 0, y: 0 }, entities: [PL([[-700, -450], [700, -450], [700, 450], [-700, 450]], true), C(-350, -680, 200), C(350, -680, 200), C(-350, 680, 200), C(350, 680, 200)] },
    CAMA_2P: { name: 'CAMA_2P', position: { x: 0, y: 0 }, entities: [PL([[0, 0], [1600, 0], [1600, 2000], [0, 2000]], true), rounded(100, 1620, 720, 1900, 80, '0'), rounded(880, 1620, 1500, 1900, 80, '0'), L(0, 1450, 1600, 1450)] }
  };
  const e = [
    PL([[1200, 0], [0, 0], [0, 6000], [9000, 6000], [9000, 0], [2100, 0]], false, 'MUROS'),
    PL([[1200, 150], [150, 150], [150, 5850], [8850, 5850], [8850, 150], [2100, 150]], false, 'MUROS'),
    L(1200, 0, 1200, 150, 'MUROS'), L(2100, 0, 2100, 150, 'MUROS'),
    L(4925, 150, 4925, 2000, 'MUROS'), L(5075, 150, 5075, 2000, 'MUROS'),
    L(4925, 2900, 4925, 5850, 'MUROS'), L(5075, 2900, 5075, 5850, 'MUROS'),
    L(4925, 2000, 5075, 2000, 'MUROS'), L(4925, 2900, 5075, 2900, 'MUROS'),
    ...[[2000, 3500], [6200, 7700]].flatMap(([a, z]) => [L(a, 5900, z, 5900, 'VENTANAS'), L(a, 5950, z, 5950, 'VENTANAS'), L(a, 5850, a, 6000, 'VENTANAS'), L(z, 5850, z, 6000, 'VENTANAS')]),
    L(8900, 2500, 8900, 4000, 'VENTANAS'), L(8950, 2500, 8950, 4000, 'VENTANAS'), L(8850, 2500, 9000, 2500, 'VENTANAS'), L(8850, 4000, 9000, 4000, 'VENTANAS'),
    I2('PUERTA_90', 2100, 150, 'PUERTAS', 90), I2('PUERTA_90', 5075, 2000, 'PUERTAS', 0),
    I2('MESA_4', 2500, 3700, 'MOBILIARIO'), rounded(2700, 600, 4600, 1450, 150, 'MOBILIARIO'), I2('CAMA_2P', 6200, 3700, 'MOBILIARIO'),
    T('Living comedor', 600, 5200, 220, 'TEXTOS'), T('Dormitorio', 5500, 1000, 220, 'TEXTOS'),
    D({ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 4500, y: -700 }, 0, 'COTAS'),
    D({ x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 9700, y: 3000 }, Math.PI / 2, 'COTAS')
  ];
  const defs = [['0', 7], ['MUROS', 7], ['VENTANAS', 4], ['PUERTAS', 30], ['MOBILIARIO', 8], ['TEXTOS', 2], ['COTAS', 3]];
  const colorOf = a => a === 30 ? 0xff7f00 : ACI[a];
  const layers = new Map(defs.map(([n, a]) => [n, { name: n, color: colorOf(a), aci: a, visible: true, locked: false }]));
  loadModel({ layers, entities: e, blocks, skipped: {}, units: 4 }, 'Ejemplo departamento.dxf', true);
}
