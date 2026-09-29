var { ipcRenderer } = require('electron');
const path = require('path');

function toNumberArray(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const out = new Array(bytes.length);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) out[j] = bytes[j];
  }
  return out;
}

/**
 * PDF → Office via motore integrato (convert-pdf-to-office / pdeffy-layout).
 */
export async function pdeffyConvertPdfToOffice(arrayBuffer, fileName, outputPath, format) {
  const tempDir = await ipcRenderer.invoke('get-temp-dir');
  const safeName = (fileName || 'document.pdf').replace(/[/\\]/g, '_');
  const inputPath = path.join(tempDir, `pdeffy_pdf_in_${Date.now()}_${safeName}`);

  await ipcRenderer.invoke('write-file-bytes', {
    path: inputPath,
    contents: toNumberArray(arrayBuffer),
  });

  try {
    const result = await ipcRenderer.invoke('convert-pdf-to-office', {
      inputPath,
      outputPath,
      format,
    });
    if (result && result.success === false) {
      throw new Error(result.warnings?.join('; ') || 'Conversion failed');
    }
    return result;
  } finally {
    try {
      await ipcRenderer.invoke('remove-path', { path: inputPath });
    } catch (_) {
      /* ignore */
    }
  }
}
