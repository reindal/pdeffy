import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync } from 'fs';
import { pdeffyRequireShim } from './vite-plugin-pdeffy-shim.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function collectHtmlPages(rootDir) {
  const pages = {};
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'src-tauri' || name === 'out') continue;
        walk(full);
      } else if (name.endsWith('.html') && !full.includes('landingPage')) {
        const rel = full.slice(rootDir.length + 1).replace(/\\/g, '/');
        const key = rel.replace(/\.html$/, '').replace(/\//g, '-');
        pages[key] = full;
      }
    }
  }
  walk(rootDir);
  return pages;
}

const root = __dirname;
const input = collectHtmlPages(root);

export default defineConfig({
  plugins: [pdeffyRequireShim()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input,
    },
  },
  resolve: {
    alias: {
      '@platform': resolve(__dirname, 'src/platform'),
      // Dep-scan still sees require('electron') before transform; alias fixes resolve.
      electron: resolve(__dirname, 'src/platform/electron.js'),
    },
  },
  optimizeDeps: {
    include: [
      'pdf-lib',
      'jszip',
      'xlsx',
      'pizzip',
      'docxtemplater',
      'marked',
      'html2canvas',
    ],
    // jspdf ships a broken .map that breaks esbuild; load on demand via dynamic import
    exclude: ['pdfjs-dist', 'jspdf'],
  },
});
