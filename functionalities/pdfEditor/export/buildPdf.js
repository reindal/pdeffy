/**
 * Export pipeline: pages structure + annotations.
 */
(function (global) {
    const { PDFDocument, degrees } = require('pdf-lib');

    async function buildPdf(model, metadata) {
        if (!model.originalBuffer) {
            throw new Error('No document loaded');
        }
        const active = global.PdfEditorDocumentModel.getActivePages(model);
        if (active.length === 0) {
            throw new Error('No pages left to export');
        }

        const raw = model.originalBuffer;
        if (!raw || raw.byteLength === 0) {
            throw new Error('PDF data is no longer available. Re-open the file and try again.');
        }
        const sourceBytes = raw instanceof Uint8Array ? raw.slice() : new Uint8Array(raw.slice(0));
        const sourceDoc = await PDFDocument.load(sourceBytes);
        const outDoc = await PDFDocument.create();

        const sourceIndices = active.map((p) => p.sourceIndex);
        const copied = await outDoc.copyPages(sourceDoc, sourceIndices);

        copied.forEach((page, i) => {
            outDoc.addPage(page);
            const rot = active[i].rotation % 360;
            if (rot !== 0) {
                const rotation = page.getRotation();
                const current = rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;
                const normalized = ((rot % 360) + 360) % 360;
                page.setRotation(degrees((current + normalized) % 360));
            }
        });

        const pageIdToOutIndex = new Map();
        active.forEach((p, i) => pageIdToOutIndex.set(p.id, i));

        if (model.watermarks?.length) {
            await global.PdfEditorApplyAnnotations.applyWatermarks(outDoc, model.watermarks);
        }

        let exportDoc = outDoc;
        if (model.redactions?.length) {
            exportDoc = await global.PdfEditorFlattenRedactions.flattenRedactedPages(
                outDoc,
                model,
                active
            );
        }

        if (model.signatures?.length) {
            await global.PdfEditorApplyAnnotations.applySignatures(
                exportDoc,
                model.signatures,
                pageIdToOutIndex
            );
        }

        if (metadata) {
            if (metadata.author) outDoc.setAuthor(metadata.author);
            if (metadata.title) outDoc.setTitle(metadata.title);
            if (metadata.subject) outDoc.setSubject(metadata.subject);
        }

        return exportDoc.save();
    }

    global.PdfEditorBuildPdf = { buildPdf };
})(typeof window !== 'undefined' ? window : global);
