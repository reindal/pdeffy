/**
 * Burn redactions into page pixels so underlying text cannot be recovered.
 * Pages with redactions become a single embedded image (no extractable text under boxes).
 */
(function (global) {
    const RENDER_SCALE = 2;

    function dataUrlToBytes(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    async function rasterizePageWithRedactions(pdfJsDoc, pageIndex, redactions) {
        const pdfjsLib = global.pdfjsLib || global.window?.pdfjsLib;
        if (!pdfjsLib) {
            throw new Error('PDF.js is not available for redaction export');
        }

        const pdfPage = await pdfJsDoc.getPage(pageIndex + 1);
        const rotation = pdfPage.rotate || 0;
        const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
        const viewport = pdfPage.getViewport({ scale: RENDER_SCALE, rotation });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await pdfPage.render({ canvasContext: ctx, viewport }).promise;

        redactions.forEach((r) => {
            const x = r.x * viewport.width;
            const y = r.y * viewport.height;
            const w = r.width * viewport.width;
            const h = r.height * viewport.height;
            ctx.fillStyle = r.color || '#000000';
            ctx.globalAlpha = 1;
            ctx.fillRect(x, y, w, h);
        });

        const pngBytes = dataUrlToBytes(canvas.toDataURL('image/png'));
        return {
            pngBytes,
            width: baseViewport.width,
            height: baseViewport.height,
        };
    }

    /**
     * Rebuild document: pages with redactions are image-only; others copied as vectors.
     */
    async function flattenRedactedPages(outDoc, model, activePages, options = {}) {
        const { PDFDocument } = require('pdf-lib');
        const pdfjsLib = global.pdfjsLib || global.window?.pdfjsLib;
        if (!pdfjsLib) {
            throw new Error('PDF.js is not available for redaction export');
        }

        const intermediate = await outDoc.save();
        const previewBytes = intermediate.slice(0);
        const loadingTask = pdfjsLib.getDocument({ data: previewBytes, disableWorker: true });
        const pdfJsDoc = await loadingTask.promise;

        const finalDoc = await PDFDocument.create();
        const redactionsByPageId = new Map();
        (model.redactions || []).forEach((r) => {
            if (!redactionsByPageId.has(r.pageId)) {
                redactionsByPageId.set(r.pageId, []);
            }
            redactionsByPageId.get(r.pageId).push(r);
        });

        for (let i = 0; i < activePages.length; i++) {
            const pageState = activePages[i];
            const redacts = redactionsByPageId.get(pageState.id) || [];

            if (options.flattenAllPages || redacts.length > 0) {
                const { pngBytes, width, height } = await rasterizePageWithRedactions(
                    pdfJsDoc,
                    i,
                    redacts
                );
                const page = finalDoc.addPage([width, height]);
                const img = await finalDoc.embedPng(pngBytes);
                page.drawImage(img, { x: 0, y: 0, width, height });
            } else {
                const [copied] = await finalDoc.copyPages(outDoc, [i]);
                finalDoc.addPage(copied);
            }
        }

        return finalDoc;
    }

    global.PdfEditorFlattenRedactions = {
        flattenRedactedPages,
        rasterizePageWithRedactions,
    };
})(typeof window !== 'undefined' ? window : global);
