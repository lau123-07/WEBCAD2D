# Editor CAD web

Editor CAD 2D que funciona en el navegador. Abre DXF, DWG, PDF e imágenes; dibuja y edita con los comandos básicos de AutoCAD; guarda en DXF.

## Requisitos

- **Node.js** (versión LTS): https://nodejs.org
- **Git**: https://git-scm.com
- Recomendado: **Visual Studio Code**: https://code.visualstudio.com

## Comandos

Todos se escriben en una terminal abierta en la carpeta del proyecto.

| Comando | Para qué |
| --- | --- |
| `npm install` | Instala las librerías. Se hace una sola vez (y cada vez que cambie `package.json`). |
| `npm run dev` | Abre el editor en el navegador para trabajar. Al guardar un cambio en el código, la página se actualiza sola. Se corta con Ctrl+C. |
| `npm run build` | Genera `dist/index.html`: un solo archivo con todo adentro, que se abre con doble clic y funciona sin internet. Es el que se reparte a los usuarios. |
| `npm run check` | Revisa el código con TypeScript sin generar nada. |

## Estructura

```
src/
  main.ts            Arranque: conecta los eventos de la página
  style.css          Estilos
  core/              Constantes, referencias a la página, estado compartido (app.ts, state.ts)
  geom/              Matemática: vectores, matrices, intersecciones, curvas
  model/             El dibujo en memoria: textos, cotas, límites, transformaciones, deshacer
  render/            Dibujo en pantalla: canvas, cursor, zoom
  edit/              Selección y referencias a objetos (snaps)
  commands/          Un archivo por grupo de comandos (dibujo, modificar, anotar, imagen)
  io/                Formatos: leer DXF/DWG/PDF/imágenes, escribir DXF, exportar PNG
  ui/                Línea de comandos, panel de capas, panel de propiedades
  sample.ts          Dibujo de ejemplo
scripts/
  preparar-wasm.mjs  Comprime el lector de DWG (se ejecuta solo después de npm install)
```

### Cómo se agrega un comando

1. Escribir la función en el archivo de `src/commands/` que corresponda (por ejemplo `async function cmdPolygon()`), usando `getPt`, `ask` y `addEntity` como los comandos existentes.
2. Registrarla en `COMMANDS` y su alias en `ALIASES`, en `src/commands/index.ts`.
3. Opcional: agregar el botón en `index.html` con `data-cmd="ALIAS"`.

## Medidas en vivo

Al dibujar o mover, un cartel junto al cursor muestra largo y ángulo (líneas), ancho y alto (rectángulos), radio y diámetro (círculos) o la distancia (mover, copiar, grips). La medida también aparece sobre el dibujo. F12 o el botón "Medidas" lo prende y apaga. En el rectángulo, la opción D permite escribir ancho y alto exactos.

Medidas exactas al pedir un punto: `X 2500` = horizontal, `Y 3m` = vertical (sin signo va hacia el lado del mouse; con `-` fuerza izquierda o abajo). Se aceptan unidades `mm`, `cm`, `m` y `km`, con coma o punto decimal (`2,5m`, `250cm`). Un largo con unidad sin X/Y va en la dirección del mouse.

## Líneas con medida: LX y LY

`LX 37,5M` dibuja una línea horizontal de 37,5 m y `LY 40M` una vertical de 40 m. Sin unidad se toman metros; también acepta `cm`, `mm` y `km`. Con `-` va a la izquierda o hacia abajo. Si se escriben seguidas, cada línea arranca donde terminó la anterior; la primera pide el punto de inicio. Esc corta la cadena. Cada línea lleva su cota automática (en la capa COTAS si existe); `COTASAUTO` las prende y apaga. En Propiedades, sin nada seleccionado, "Cotas en" permite mostrar todas las cotas en metros, centímetros o milímetros.

## Rectángulo con medida

`REC LY 37000MM LX 14000MM` (en cualquier orden; sin unidad = metros) pide la primera esquina y dibuja el rectángulo (sin cotas; se agregan a mano con DLI). También se pueden escribir las medidas (`LX 14m LY 37m`) cuando REC pide una esquina.

## Mover arrastrando y grupos

Hacé clic sobre un objeto y, sin soltar, arrastralo: se mueve al soltar (con Ctrl apretado al soltar, deja una copia). Los rectángulos de `REC LX… LY…` y las líneas de LX/LY quedan agrupados con sus cotas: se seleccionan y mueven juntos. `DESAGRUPAR` (o el menú del clic derecho) los separa.

## Retiros (zona límite)

`RETIROS`: clic en el rectángulo del terreno y escribir el retiro de cada lado (izquierda, arriba, derecha, abajo; en metros, Enter = 0). Se dibuja la franja de retiro en rojo y la línea límite punteada. Lo que invada la franja no se permite (se marca en rojo y se avisa); las cotas y los textos sí. La vista previa se pone roja con el aviso "Invade el retiro". `CONTROLRETIROS` apaga o prende el control. El terreno y su zona quedan agrupados. Al mover, rotar o arrastrar algo hacia el retiro, se frena en el último lugar permitido. La franja se ve siempre en rojo.

Rotar: con el mouse se engancha en 0°, 90°, 180° y 270° (entre medio gira libre); también se puede escribir cualquier ángulo. En el menú del clic derecho están "Rotar 90°" y "Rotar 180°" (alrededor del centro de lo seleccionado).

## Textos, unidad en cotas y Norte

- `T`: clic donde va el texto, se abre una ventanita, se escribe y Enter (Shift+Enter agrega un renglón). Se mueve arrastrándolo y se edita con doble clic. Opciones A (altura) y R (rotación).
- Las cotas muestran la unidad (`14000 mm`, `14,00 m`). Se oculta en Propiedades → "Unidad en cotas".
- `NORTE`: rosa de los vientos (N, E, S, O). Clic donde va y hacia dónde apunta el Norte. Se gira con RO o con el grip de la punta N. Al dibujar líneas, el cartel de medidas muestra su orientación (N, NE, E…) según la rosa.

## Menú del clic derecho

Con algo seleccionado (o haciendo clic derecho sobre un objeto): Editar texto, Mover, Copiar, Rotar, Escalar, Espejo, Descomponer, Copiar al portapapeles, Propiedades, Deseleccionar y Borrar. En un lugar vacío: Repetir el último comando, Pegar, Deshacer, Rehacer, Seleccionar todo y Ver todo. Durante un comando, el clic derecho equivale a Enter.

## Autoguardado e impresión

- **Autoguardado:** cada 5 minutos, si hay cambios sin guardar, se guarda una copia dentro del navegador. Al volver a abrir el editor se ofrece recuperarla. `AUTOGUARDADO` cambia los minutos (0 lo desactiva) y `RECUPERAR` la carga cuando quieras. La copia se borra al guardar el DXF.
- **Imprimir a escala:** `IMPRIMIR` (o el botón "Imprimir / PDF") abre una ventana con papel (A4 a A0), orientación, escala, área (todo o una ventana) y rótulo, con vista previa. En el diálogo de impresión del navegador hay que elegir el mismo papel, márgenes "Ninguno" y escala 100 %.

## Pruebas desde la consola

Con el editor abierto, en la consola del navegador (F12) está disponible `__cad`, por ejemplo:

```js
__cad.app.model.entities.length   // cantidad de objetos
__cad.writeDXF()                  // el DXF que se guardaría
```

## Licencias de las librerías

- `dxf-parser` y `pdfjs-dist`: licencias permisivas (MIT y Apache 2.0).
- `@mlightcad/libredwg-web` (lector de DWG, basado en LibreDWG): **GPL-3.0**. Para uso interno no suele haber problema; si la herramienta se distribuye fuera de la empresa, hay que revisar las obligaciones de esa licencia.

## Pendientes conocidos

- Tipado: el código se pasó a TypeScript con reglas flexibles (`strict: false`). El próximo paso es definir los tipos de entidades y activar `strict` de a un módulo.
- Formatos: sombreados, tablas, directrices múltiples y multilíneas de DWG todavía no se muestran.
- Las imágenes de fondo no se guardan dentro del DXF.
