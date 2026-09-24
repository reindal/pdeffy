import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import path from './path.js';

function toUint8(data) {
  if (!data) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) return Uint8Array.from(data);
  return new Uint8Array(data);
}

/** Serialize bytes for Tauri Vec<u8> (JSON IPC expects number[]). */
function toBytesPayload(data) {
  const bytes = toUint8(data);
  // Chunked Array.from avoids call-stack overflows on large files
  const out = new Array(bytes.length);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) out[j] = bytes[j];
  }
  return out;
}

function asError(err) {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err);
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string') return new Error(err.message);
    try {
      return new Error(JSON.stringify(err));
    } catch (_) {
      return new Error(String(err));
    }
  }
  return new Error(String(err));
}

async function safeInvoke(cmd, args) {
  try {
    return await invoke(cmd, args);
  } catch (err) {
    throw asError(err);
  }
}

function mapSaveOptions(options = {}) {
  const filters = (options.filters || []).map((f) => ({
    name: f.name || 'File',
    extensions: (f.extensions || []).map((e) => String(e).replace(/^\./, '')),
  }));
  return {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: filters.length ? filters : undefined,
  };
}

/**
 * Drop-in replacement for Electron ipcRenderer.invoke used across the app.
 */
export const ipcRenderer = {
  async invoke(channel, payload) {
    try {
      switch (channel) {
        case 'show-save-dialog': {
          const selected = await save(mapSaveOptions(payload || {}));
          return selected ?? null;
        }
        case 'show-open-dialog': {
          const opts = payload || {};
          const selected = await open({
            title: opts.title,
            defaultPath: opts.defaultPath,
            directory: !!(opts.properties && opts.properties.includes('openDirectory')),
            multiple: !!(opts.properties && opts.properties.includes('multiSelections')),
            filters: mapSaveOptions(opts).filters,
          });
          if (selected == null) return null;
          return Array.isArray(selected) ? selected[0] : selected;
        }
        case 'get-downloads-path':
          return safeInvoke('get-downloads-path');
        case 'open-folder':
          return safeInvoke('open-folder', { folderPath: payload });
        case 'open-file':
          return safeInvoke('open-file', { filePath: payload });
        case 'open-external-url':
          await openUrl(payload);
          return { success: true };
        case 'set-file-readonly':
          return safeInvoke('set-file-readonly', { filePath: payload });
        case 'get-pdf-metadata':
          return safeInvoke('get-pdf-metadata');
        case 'save-pdf-metadata':
          return safeInvoke('save-pdf-metadata', { metadata: payload });
        case 'get-language':
          return safeInvoke('get-language');
        case 'save-language':
          return safeInvoke('save-language', { language: payload });
        case 'check-first-launch':
          return safeInvoke('check-first-launch');
        case 'get-warning-settings':
          return safeInvoke('get-warning-settings');
        case 'save-warning-settings':
          return safeInvoke('save-warning-settings', { featureId: payload });
        case 'check-engines-availability':
          return safeInvoke('check-engines-availability');
        case 'check-ghostscript-availability':
          return safeInvoke('check-ghostscript-availability');
        case 'convert-with-libreoffice': {
          // Write input to a temp path via Rust std::fs, then convert by path
          // (ArrayBuffer does not deserialize reliably to Vec<u8> over IPC).
          const { fileData, fileName, outputPath, format, metadata } = payload || {};
          if (!outputPath) throw new Error('No output path specified.');
          const bytes = toBytesPayload(fileData);
          if (!bytes.length) throw new Error('Input file is empty.');
          const tempDir = await safeInvoke('get-temp-dir');
          const safeName = String(fileName || 'input.bin').replace(/[/\\]/g, '_');
          const inputPath = path.join(tempDir, `pdeffy_in_${Date.now()}_${safeName}`);
          await safeInvoke('write-file-bytes', { path: inputPath, contents: bytes });
          try {
            return await safeInvoke('convert-file-path', {
              inputPath,
              outputPath,
              format: format || 'pdf',
              metadata: metadata || null,
            });
          } catch (err) {
            try {
              await safeInvoke('remove-path', { path: inputPath });
            } catch (_) { /* ignore */ }
            throw err;
          }
        }
        case 'compress-with-ghostscript': {
          const { fileData, fileName, outputPath, quality } = payload || {};
          return safeInvoke('compress-with-ghostscript', {
            fileData: toBytesPayload(fileData),
            fileName,
            outputPath,
            quality: quality || 'ebook',
          });
        }
        case 'protect-with-ghostscript': {
          const {
            fileData,
            fileName,
            outputPath,
            userPassword,
            ownerPassword,
            permissions,
          } = payload || {};
          return safeInvoke('protect-with-ghostscript', {
            fileData: toBytesPayload(fileData),
            fileName,
            outputPath,
            userPassword: userPassword || null,
            ownerPassword: ownerPassword || null,
            permissions: permissions || {},
          });
        }
        case 'markdown-file-to-pdf': {
          const { markdownFileToPdf } = await import('./markdownPdf.js');
          return markdownFileToPdf(payload);
        }
        case 'render-html-to-pdf': {
          const { htmlStringToPdf } = await import('./markdownPdf.js');
          return htmlStringToPdf(payload.innerHtml, payload.outputPath);
        }
        case 'pdf-merge': {
          const { paths, output } = payload || {};
          return safeInvoke('pdf_merge', { paths, output });
        }
        case 'pdf-split':
          return safeInvoke('pdf_split_pages', payload);
        case 'pdf-rotate':
          return safeInvoke('pdf_rotate', payload);
        case 'pdf-delete-pages': {
          const { path: p, pagesToDelete, output } = payload || {};
          return safeInvoke('pdf_delete_pages', {
            path: p,
            pagesToDelete: pagesToDelete || payload?.pages_to_delete,
            output,
          });
        }
        case 'pdf-redact-true':
          return safeInvoke('pdf_redact_true', payload);
        case 'pdf-to-images-gs':
          return safeInvoke('pdf_to_images_gs', payload);
        case 'image-to-pdf-native': {
          const { imagePaths, output } = payload || {};
          return safeInvoke('image_to_pdf', {
            imagePaths: imagePaths || payload?.image_paths,
            output,
          });
        }
        case 'zip-files': {
          const { paths, output } = payload || {};
          return safeInvoke('zip_files', { paths, output });
        }
        default:
          console.warn('[bridge] Unknown IPC channel:', channel);
          return safeInvoke(String(channel).replace(/_/g, '-'), payload);
      }
    } catch (err) {
      throw asError(err);
    }
  },
};

if (typeof window !== 'undefined') {
  window.ipcRenderer = ipcRenderer;
}

export default { ipcRenderer };
