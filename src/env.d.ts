/// <reference types="vite/client" />
declare module 'pdfjs-dist/build/pdf.worker.js';
declare module 'dxf-parser';
interface Window { showSaveFilePicker?: (opts?: any) => Promise<any>; }
