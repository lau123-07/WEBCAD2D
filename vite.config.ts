import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// El lector DWG trae una referencia a su .wasm sin comprimir (11 MB).
// La anulamos porque la aplicación usa su propia copia comprimida (src/assets).
const sinWasmDuplicado = (): Plugin => ({
  name: 'sin-wasm-duplicado',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('libredwg-web') && code.includes('new URL("libredwg-web.wasm",import.meta.url)')) {
      return code.replace('new URL("libredwg-web.wasm",import.meta.url)', '"libredwg-web.wasm"');
    }
  }
});

export default defineConfig({
  base: './',
  plugins: [sinWasmDuplicado(), viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
    outDir: 'dist'
  },
  optimizeDeps: { exclude: ['@mlightcad/libredwg-web'] },
  server: { port: 5173, open: true }
});
