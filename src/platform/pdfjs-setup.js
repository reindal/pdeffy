import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

window.pdfjsLib = pdfjsLib;
if (typeof globalThis !== 'undefined') {
  globalThis.pdfjsLib = pdfjsLib;
}

export default pdfjsLib;
