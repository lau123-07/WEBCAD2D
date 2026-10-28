// pdf.js procesa los PDF en el mismo hilo de la página (sin un worker aparte),
// así la aplicación funciona también abriendo el archivo HTML con doble clic.
import * as worker from 'pdfjs-dist/build/pdf.worker.js';
const g = globalThis as any;
g.pdfjsWorker = g.pdfjsWorker || (worker as any).default || worker;
