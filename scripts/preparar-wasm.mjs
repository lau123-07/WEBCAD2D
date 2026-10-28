// Comprime el lector de DWG (WebAssembly, ~11 MB) a ~2,5 MB para incluirlo en la aplicación.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const origen = 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm';
const destino = 'src/assets/libredwg-web.wasm.bin';
if (!existsSync(origen)) { console.error('No se encontró ' + origen + '. ¿Corriste npm install?'); process.exit(1); }
mkdirSync('src/assets', { recursive: true });
writeFileSync(destino, gzipSync(readFileSync(origen), { level: 9 }));
console.log('Lector DWG preparado en ' + destino);
