/**
 * Editable document state (non-destructive until export).
 */
(function (global) {
    function createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function createDocumentModel() {
        return {
            originalBuffer: null,
            fileName: null,
            /** @type {{ id: string, sourceIndex: number, rotation: number, deleted: boolean, order: number }[]} */
            pages: [],
            watermarks: [],
            redactions: [],
            signatures: [],
            /** Cached pdf.js page objects keyed by sourceIndex */
            pdfJsPagesBySource: new Map(),
            pdfJsDoc: null,
            sourcePageCount: 0,
        };
    }

    function initPagesFromSourceCount(count) {
        const pages = [];
        for (let i = 0; i < count; i++) {
            pages.push({
                id: createId('page'),
                sourceIndex: i,
                rotation: 0,
                deleted: false,
                order: i,
            });
        }
        return pages;
    }

    function getActivePages(model) {
        return model.pages
            .filter((p) => !p.deleted)
            .slice()
            .sort((a, b) => a.order - b.order);
    }

    function getActivePageCount(model) {
        return getActivePages(model).length;
    }

    function findPageById(model, pageId) {
        return model.pages.find((p) => p.id === pageId) || null;
    }

    function getPageAtDisplayIndex(model, displayIndex) {
        const active = getActivePages(model);
        return active[displayIndex] ?? null;
    }

    function setCurrentPageById(model, pageId) {
        const active = getActivePages(model);
        const idx = active.findIndex((p) => p.id === pageId);
        return idx >= 0 ? idx : 0;
    }

    function togglePageDeleted(model, pageId) {
        const page = findPageById(model, pageId);
        if (!page) return false;
        if (!page.deleted && getActivePageCount(model) <= 1) {
            return false;
        }
        page.deleted = !page.deleted;
        return true;
    }

    function rotatePage(model, pageId, deltaDegrees) {
        const page = findPageById(model, pageId);
        if (!page || page.deleted) return;
        page.rotation = (page.rotation + deltaDegrees) % 360;
        if (page.rotation < 0) page.rotation += 360;
    }

    function reorderPages(model, fromOrderIndex, toOrderIndex) {
        const active = getActivePages(model);
        if (
            fromOrderIndex < 0 ||
            toOrderIndex < 0 ||
            fromOrderIndex >= active.length ||
            toOrderIndex >= active.length ||
            fromOrderIndex === toOrderIndex
        ) {
            return;
        }
        const moved = active.splice(fromOrderIndex, 1)[0];
        active.splice(toOrderIndex, 0, moved);
        active.forEach((p, i) => {
            p.order = i;
        });
    }

    function getBaselineActiveSourceOrder(model) {
        return model.pages
            .filter((p) => !p.deleted)
            .slice()
            .sort((a, b) => a.sourceIndex - b.sourceIndex)
            .map((p) => p.sourceIndex);
    }

    function getCurrentActiveSourceOrder(model) {
        return getActivePages(model).map((p) => p.sourceIndex);
    }

    function hasPageStructureEdits(model) {
        if (getActivePageCount(model) !== model.sourcePageCount) return true;
        const baseline = getBaselineActiveSourceOrder(model);
        const current = getCurrentActiveSourceOrder(model);
        if (baseline.length !== current.length) return true;
        for (let i = 0; i < baseline.length; i++) {
            if (baseline[i] !== current[i]) return true;
        }
        for (const p of model.pages) {
            if (p.rotation % 360 !== 0) return true;
        }
        return false;
    }

    function hasAnnotationEdits(model) {
        return (
            (model.watermarks && model.watermarks.length > 0) ||
            (model.redactions && model.redactions.length > 0) ||
            (model.signatures && model.signatures.length > 0)
        );
    }

    function hasExportableEdits(model) {
        if (!model.originalBuffer) return false;
        if (hasAnnotationEdits(model)) return true;
        return hasPageStructureEdits(model);
    }

    function addWatermark(model, layer) {
        model.watermarks.push({ ...layer, id: layer.id || createId('wm') });
    }

    function removeWatermark(model, id) {
        model.watermarks = model.watermarks.filter((w) => w.id !== id);
    }

    function clearAllWatermarks(model) {
        model.watermarks = [];
    }

    function addRedaction(model, redaction) {
        model.redactions.push({ ...redaction, id: redaction.id || createId('red') });
    }

    function removeRedaction(model, id) {
        model.redactions = model.redactions.filter((r) => r.id !== id);
    }

    function addSignature(model, signature) {
        model.signatures.push({ ...signature, id: signature.id || createId('sig') });
    }

    function removeSignature(model, id) {
        model.signatures = model.signatures.filter((s) => s.id !== id);
    }

    function resetModel(model) {
        model.originalBuffer = null;
        model.fileName = null;
        model.pages = [];
        model.watermarks = [];
        model.redactions = [];
        model.signatures = [];
        model.pdfJsPagesBySource.clear();
        model.pdfJsDoc = null;
        model.sourcePageCount = 0;
    }

    global.PdfEditorDocumentModel = {
        createDocumentModel,
        initPagesFromSourceCount,
        getActivePages,
        getActivePageCount,
        findPageById,
        getPageAtDisplayIndex,
        setCurrentPageById,
        togglePageDeleted,
        rotatePage,
        reorderPages,
        hasPageStructureEdits,
        hasAnnotationEdits,
        hasExportableEdits,
        addWatermark,
        removeWatermark,
        clearAllWatermarks,
        addRedaction,
        removeRedaction,
        addSignature,
        removeSignature,
        resetModel,
    };
})(typeof window !== 'undefined' ? window : global);
