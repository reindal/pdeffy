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
            /** @type {{ id: string, pageId: string, type: 'highlight'|'underline', x:number, y:number, width:number, height:number, color:string, text?: string }[]} */
            markups: [],
            /** @type {{ id: string, pageId: string, x:number, y:number, text:string, color:string, author?: string, createdAt:number, updatedAt?: number }[]} */
            comments: [],
            /** @type {{ id: string, pageId: string, color:string, width:number, shape?: 'freehand'|'rect'|'ellipse'|'arrow'|'polygon', points:{x:number,y:number}[] }[]} */
            inks: [],
            /** @type {{ id: string, pageId: string, title:string, y?: number }[]} */
            bookmarks: [],
            /** @type {object[]} AcroForm widgets detected via pdf.js */
            formFields: [],
            /** @type {Record<string, any>} current fill values keyed by field name */
            formValues: {},
            /** @type {Record<string, any>} values as loaded from the PDF */
            formInitialValues: {},
            /** True when PDF catalog has an AcroForm dictionary */
            acroFormPresent: false,
            /** @type {{ id: string, pageId: string, type: 'text'|'check', x:number, y:number, width:number, height:number, text?: string, checked?: boolean }[]} */
            manualFormFills: [],
            /** Cached pdf.js page objects keyed by sourceIndex */
            pdfJsPagesBySource: new Map(),
            pdfJsDoc: null,
            sourcePageCount: 0,
            pdfPassword: null,
            isEncrypted: false,
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

    function hasFormEdits(model) {
        if (global.PdfEditorFormFields?.hasFormEdits) {
            return global.PdfEditorFormFields.hasFormEdits(model);
        }
        return false;
    }

    function hasAnnotationEdits(model) {
        return (
            (model.watermarks && model.watermarks.length > 0) ||
            (model.redactions && model.redactions.length > 0) ||
            (model.signatures && model.signatures.length > 0) ||
            (model.markups && model.markups.length > 0) ||
            (model.comments && model.comments.length > 0) ||
            (model.inks && model.inks.length > 0) ||
            (model.bookmarks && model.bookmarks.length > 0) ||
            (model.manualFormFills && model.manualFormFills.length > 0) ||
            hasFormEdits(model)
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

    function addMarkup(model, markup) {
        if (!model.markups) model.markups = [];
        model.markups.push({ ...markup, id: markup.id || createId('mk') });
    }

    function removeMarkup(model, id) {
        model.markups = (model.markups || []).filter((m) => m.id !== id);
    }

    function addSignature(model, signature) {
        model.signatures.push({ ...signature, id: signature.id || createId('sig') });
    }

    function removeSignature(model, id) {
        model.signatures = model.signatures.filter((s) => s.id !== id);
    }

    function addComment(model, comment) {
        if (!model.comments) model.comments = [];
        model.comments.push({
            color: '#f4b400',
            author: '',
            createdAt: Date.now(),
            text: '',
            x: 0.1,
            y: 0.1,
            ...comment,
            id: comment.id || createId('cmt'),
        });
    }

    function removeComment(model, id) {
        model.comments = (model.comments || []).filter((c) => c.id !== id);
    }

    function updateComment(model, id, patch) {
        const c = (model.comments || []).find((x) => x.id === id);
        if (!c) return;
        Object.assign(c, patch);
    }

    function addInk(model, ink) {
        if (!model.inks) model.inks = [];
        model.inks.push({
            color: '#e53935',
            width: 2.5,
            shape: 'freehand',
            points: [],
            ...ink,
            id: ink.id || createId('ink'),
        });
    }

    function removeInk(model, id) {
        model.inks = (model.inks || []).filter((i) => i.id !== id);
    }

    function addBookmark(model, bookmark) {
        if (!model.bookmarks) model.bookmarks = [];
        model.bookmarks.push({
            title: 'Bookmark',
            y: 0,
            ...bookmark,
            id: bookmark.id || createId('bm'),
        });
    }

    function removeBookmark(model, id) {
        model.bookmarks = (model.bookmarks || []).filter((b) => b.id !== id);
    }

    function updateBookmark(model, id, patch) {
        const b = (model.bookmarks || []).find((x) => x.id === id);
        if (!b) return;
        Object.assign(b, patch);
    }

    function addManualFormFill(model, entry) {
        if (!model.manualFormFills) model.manualFormFills = [];
        model.manualFormFills.push({
            type: 'text',
            text: '',
            checked: true,
            framed: true,
            fontSize: 12,
            color: '#000000',
            width: 0.28,
            height: 0.08,
            ...entry,
            id: entry.id || createId('mff'),
        });
    }

    function removeManualFormFill(model, id) {
        model.manualFormFills = (model.manualFormFills || []).filter((e) => e.id !== id);
    }

    function updateManualFormFill(model, id, patch) {
        const e = (model.manualFormFills || []).find((x) => x.id === id);
        if (!e) return;
        Object.assign(e, patch);
    }

    function resetModel(model) {
        model.originalBuffer = null;
        model.fileName = null;
        model.pages = [];
        model.watermarks = [];
        model.redactions = [];
        model.signatures = [];
        model.markups = [];
        model.comments = [];
        model.inks = [];
        model.bookmarks = [];
        model.formFields = [];
        model.formValues = {};
        model.formInitialValues = {};
        model.acroFormPresent = false;
        model.manualFormFills = [];
        model.pdfJsPagesBySource.clear();
        model.pdfJsDoc = null;
        model.sourcePageCount = 0;
        model.pdfPassword = null;
        model.isEncrypted = false;
        model.ocrText = '';
        model.anonymizedText = '';
        model.hasEmbeddedText = true;
        model.viewerContentMode = 'pdf';
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
        hasFormEdits,
        hasAnnotationEdits,
        hasExportableEdits,
        addWatermark,
        removeWatermark,
        clearAllWatermarks,
        addRedaction,
        removeRedaction,
        addMarkup,
        removeMarkup,
        addSignature,
        removeSignature,
        addComment,
        removeComment,
        updateComment,
        addInk,
        removeInk,
        addBookmark,
        removeBookmark,
        updateBookmark,
        addManualFormFill,
        removeManualFormFill,
        updateManualFormFill,
        resetModel,
        createId,
    };
})(typeof window !== 'undefined' ? window : global);
