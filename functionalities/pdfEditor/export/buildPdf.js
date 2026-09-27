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
        // Owner/user-password PDFs: ignoreEncryption after pdf.js already unlocked for preview.
        const sourceDoc = await PDFDocument.load(sourceBytes, {
            ignoreEncryption: !!model.isEncrypted || !!model.pdfPassword,
        });

        const hasFormEdits =
            typeof global.PdfEditorDocumentModel.hasFormEdits === 'function'
                ? global.PdfEditorDocumentModel.hasFormEdits(model)
                : false;
        const structureEdits = global.PdfEditorDocumentModel.hasPageStructureEdits(model);

        let formHandle = null;
        if (hasFormEdits && global.PdfEditorApplyFormValues) {
            const result = global.PdfEditorApplyFormValues.applyFormValues(sourceDoc, model);
            formHandle = result.form || null;
            await global.PdfEditorApplyFormValues.updateFormAppearances(sourceDoc, formHandle);
            // copyPages drops AcroForm dictionaries — flatten so filled values stay visible.
            if (structureEdits) {
                global.PdfEditorApplyFormValues.flattenForm(sourceDoc, formHandle);
            }
        }

        let outDoc;
        /** @type {Map<string, number>} */
        const pageIdToOutIndex = new Map();

        if (!structureEdits) {
            // Keep the original document (and editable form fields) intact.
            outDoc = sourceDoc;
            active.forEach((p) => pageIdToOutIndex.set(p.id, p.sourceIndex));
        } else {
            outDoc = await PDFDocument.create();
            const sourceIndices = active.map((p) => p.sourceIndex);
            const copied = await outDoc.copyPages(sourceDoc, sourceIndices);
            copied.forEach((page, i) => {
                outDoc.addPage(page);
                const rot = active[i].rotation % 360;
                if (rot !== 0) {
                    const rotation = page.getRotation();
                    const current =
                        rotation && typeof rotation.angle === 'number' ? rotation.angle : 0;
                    const normalized = ((rot % 360) + 360) % 360;
                    page.setRotation(degrees((current + normalized) % 360));
                }
            });
            active.forEach((p, i) => pageIdToOutIndex.set(p.id, i));
        }

        if (model.watermarks?.length) {
            await global.PdfEditorApplyAnnotations.applyWatermarks(outDoc, model.watermarks);
        }

        if (model.markups?.length) {
            global.PdfEditorApplyAnnotations.applyMarkups(outDoc, model.markups, pageIdToOutIndex);
        }

        if (model.inks?.length) {
            global.PdfEditorApplyAnnotations.applyInks(outDoc, model.inks, pageIdToOutIndex);
        }

        if (model.comments?.length) {
            await global.PdfEditorApplyAnnotations.applyComments(
                outDoc,
                model.comments,
                pageIdToOutIndex
            );
        }

        let exportDoc = outDoc;
        // Permanently burn redactions (and watermarks when present) into page pixels so
        // underlying text cannot be selected or removed in another editor.
        if (model.redactions?.length || model.watermarks?.length) {
            if (!global.PdfEditorFlattenRedactions?.flattenRedactedPages) {
                throw new Error('Redaction flatten module is not available');
            }
            exportDoc = await global.PdfEditorFlattenRedactions.flattenRedactedPages(
                outDoc,
                model,
                active,
                {
                    // Watermarks are burned on every page; redactions only on affected pages
                    // unless watermarks force a full flatten.
                    flattenAllPages: !!model.watermarks?.length,
                }
            );
        }

        if (model.signatures?.length) {
            await global.PdfEditorApplyAnnotations.applySignatures(
                exportDoc,
                model.signatures,
                pageIdToOutIndex
            );
        }

        if (model.manualFormFills?.length) {
            await global.PdfEditorApplyAnnotations.applyManualFormFills(
                exportDoc,
                model.manualFormFills,
                pageIdToOutIndex
            );
        }

        if (model.bookmarks?.length) {
            global.PdfEditorApplyAnnotations.applyBookmarks(
                exportDoc,
                model.bookmarks,
                pageIdToOutIndex
            );
        }

        if (metadata) {
            if (typeof CustomMetadataModule !== 'undefined' && CustomMetadataModule.applyToPdfDoc) {
                CustomMetadataModule.applyToPdfDoc(exportDoc, metadata);
            } else {
                const a = String(metadata.author || '').trim();
                const c = String(metadata.company || '').trim();
                const author = a && c ? `${a} — ${c}` : a || c;
                if (author) exportDoc.setAuthor(author);
                if (metadata.title) exportDoc.setTitle(metadata.title);
                if (metadata.subject) exportDoc.setSubject(metadata.subject);
                if (typeof exportDoc.setCreator === 'function') exportDoc.setCreator('Pdeffy');
                if (typeof exportDoc.setProducer === 'function') exportDoc.setProducer('Pdeffy');
            }
        }

        return exportDoc.save();
    }

    global.PdfEditorBuildPdf = { buildPdf };
})(typeof window !== 'undefined' ? window : global);
