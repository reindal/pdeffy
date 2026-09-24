import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platform = resolve(__dirname, 'src/platform').replace(/\\/g, '/');

/**
 * Rewrites CommonJS require() calls used by the Electron renderer into ESM imports
 * from the Tauri platform shims.
 */
export function pdeffyRequireShim() {
  return {
    name: 'pdeffy-require-shim',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'electron') return `${platform}/electron.js`;
      if (id === 'fs' || id === 'node:fs') return `${platform}/fs.js`;
      if (id === 'path' || id === 'node:path') return `${platform}/path.js`;
      if (id === 'os' || id === 'node:os') return `${platform}/os.js`;
      return null;
    },
    transform(code, id) {
      if (!id.endsWith('.js') && !id.endsWith('.mjs')) return null;
      if (id.includes('node_modules') || id.includes('src/platform') || id.includes('vite-plugin')) {
        return null;
      }
      const needsGlobals =
        /\b(StatusManager|CustomMetadataModule|PdfEncryptionGuard)\b/.test(code) ||
        /(?<![\w.$])changeLanguage\b/.test(code);
      if (!code.includes('require(') && !needsGlobals) return null;

      const imports = new Set();
      let out = code;

      if (/require\(['"]electron['"]\)/.test(out)) {
        imports.add(`import __pdeffy_electron from '${platform}/electron.js';`);
        out = out.replace(/require\(['"]electron['"]\)/g, '__pdeffy_electron');
      }
      if (/require\(['"]fs['"]\)/.test(out)) {
        imports.add(`import __pdeffy_fs from '${platform}/fs.js';`);
        out = out.replace(/require\(['"]fs['"]\)/g, '__pdeffy_fs');
      }
      if (/require\(['"]path['"]\)/.test(out)) {
        imports.add(`import __pdeffy_path from '${platform}/path.js';`);
        out = out.replace(/require\(['"]path['"]\)/g, '__pdeffy_path');
      }
      if (/require\(['"]os['"]\)/.test(out)) {
        imports.add(`import __pdeffy_os from '${platform}/os.js';`);
        out = out.replace(/require\(['"]os['"]\)/g, '__pdeffy_os');
      }
      if (/require\(['"]pdf-lib['"]\)/.test(out)) {
        imports.add(`import * as __pdeffy_pdflib from 'pdf-lib';`);
        out = out.replace(/require\(['"]pdf-lib['"]\)/g, '__pdeffy_pdflib');
      }
      if (/require\(['"]jszip['"]\)/.test(out)) {
        imports.add(`import __pdeffy_jszip from 'jszip';`);
        out = out.replace(/require\(['"]jszip['"]\)/g, '__pdeffy_jszip');
      }
      if (/require\(['"]xlsx['"]\)/.test(out)) {
        imports.add(`import * as __pdeffy_xlsx from 'xlsx';`);
        out = out.replace(/require\(['"]xlsx['"]\)/g, '__pdeffy_xlsx');
      }
      if (/require\(['"]pizzip['"]\)/.test(out)) {
        imports.add(`import __pdeffy_pizzip from 'pizzip';`);
        out = out.replace(/require\(['"]pizzip['"]\)/g, '__pdeffy_pizzip');
      }
      if (/require\(['"]docxtemplater['"]\)/.test(out)) {
        imports.add(`import __pdeffy_docxtemplater from 'docxtemplater';`);
        out = out.replace(/require\(['"]docxtemplater['"]\)/g, '__pdeffy_docxtemplater');
      }

      // Vite loads page scripts as ES modules (isolated scope). Electron used a shared
      // classic-script scope, so bare StatusManager / CustomMetadataModule / etc. worked.
      // Re-bind those globals from window when this file references but does not define them.
      const globalAliases = [];
      const isDefiner =
        id.includes('statusManager') ||
        id.includes('customMetadata') ||
        id.includes('pdfEncryptionGuard') ||
        id.includes('changeLang');
      if (!isDefiner) {
        if (/\bStatusManager\b/.test(out)) {
          globalAliases.push('const StatusManager = window.StatusManager;');
        }
        if (/\bCustomMetadataModule\b/.test(out)) {
          globalAliases.push(
            'const CustomMetadataModule = window.CustomMetadataModule;'
          );
        }
        if (/\bPdfEncryptionGuard\b/.test(out)) {
          globalAliases.push(
            'const PdfEncryptionGuard = window.PdfEncryptionGuard;'
          );
        }
        if (/(?<![\w.$])changeLanguage\b/.test(out)) {
          globalAliases.push(
            'function changeLanguage(...args) { return window.changeLanguage?.(...args); }'
          );
        }
      }

      // PDF editor modules attach to window via IIFE; consumers need local bindings.
      const pdfEditorGlobals = [
        'PdfEditorDocumentModel',
        'PdfEditorOverlayManager',
        'PdfEditorToolController',
        'PdfEditorBuildPdf',
        'PdfEditorApplyAnnotations',
        'PdfEditorFlattenRedactions',
        'PdfEditorPageThumbnails',
        'PdfEditorViewer',
        'PdfEditorTextSearch',
        'PdfEditorCoords',
      ];
      for (const name of pdfEditorGlobals) {
        // Skip the file that defines this global (avoids TDZ / self-reference).
        const definesSelf =
          (name === 'PdfEditorDocumentModel' && id.includes('documentModel')) ||
          (name === 'PdfEditorOverlayManager' && id.includes('overlayManager')) ||
          (name === 'PdfEditorToolController' && id.includes('toolController')) ||
          (name === 'PdfEditorBuildPdf' && id.includes('buildPdf')) ||
          (name === 'PdfEditorApplyAnnotations' && id.includes('applyAnnotations')) ||
          (name === 'PdfEditorFlattenRedactions' && id.includes('flattenRedactions')) ||
          (name === 'PdfEditorPageThumbnails' && id.includes('pageThumbnails')) ||
          (name === 'PdfEditorViewer' && id.includes('pdfViewer')) ||
          (name === 'PdfEditorTextSearch' && id.includes('textSearch')) ||
          (name === 'PdfEditorCoords' && id.includes('coords'));
        if (definesSelf) continue;
        if (new RegExp(`\\b${name}\\b`).test(out)) {
          globalAliases.push(`const ${name} = window.${name};`);
        }
      }

      if (imports.size === 0 && globalAliases.length === 0) return null;
      return {
        code: `${[...imports, ...globalAliases].join('\n')}\n${out}`,
        map: null,
      };
    },
    transformIndexHtml(html) {
      let out = html.replace(
        /<script\s+type="module">\s*\/\/[^\n]*\n\s*import \* as pdfjsLib from ['"]https:\/\/cdnjs[^'"]+['"];\s*window\.pdfjsLib = pdfjsLib;\s*<\/script>/g,
        `<script type="module" src="/src/platform/pdfjs-setup.js"></script>`
      );
      out = out.replace(
        /<script\s+type="module">\s*import \* as pdfjsLib from ['"]https:\/\/cdnjs[^'"]+['"];\s*window\.pdfjsLib = pdfjsLib;\s*<\/script>/g,
        `<script type="module" src="/src/platform/pdfjs-setup.js"></script>`
      );
      // Fix accidental double closing tags from prior transforms
      out = out.replace(/<\/script>\s*<\/script>/g, '</script>');
      // Ensure app scripts run as modules so Vite can resolve shimmed imports.
      out = out.replace(
        /<script(\s+)src="([^"]+\.js)"([^>]*)>/g,
        (match, sp, src, rest) => {
          if (src.includes('pdf.min.js')) {
            return `<script type="module" src="/src/platform/pdfjs-setup.js"></script>`;
          }
          if (/\btype\s*=/.test(rest) || /\btype\s*=/.test(sp)) return match;
          return `<script type="module"${sp}src="${src}"${rest}>`;
        }
      );
      return out;
    },
  };
}
