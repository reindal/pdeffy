/**
 * Undo / redo stack for editable PDF editor state (Acrobat-style).
 */
(function (global) {
    const MAX = 50;
    let past = [];
    let future = [];
    let restoring = false;

    function cloneBytes(bytes) {
        if (!bytes) return null;
        if (bytes instanceof Uint8Array) return bytes.slice();
        if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer.slice(0));
        return null;
    }

    function cloneItem(item) {
        if (!item || typeof item !== 'object') return item;
        const out = { ...item };
        if (out.pngBytes) out.pngBytes = cloneBytes(out.pngBytes);
        if (out.imageBytes) out.imageBytes = cloneBytes(out.imageBytes);
        if (Array.isArray(out.points)) {
            out.points = out.points.map((p) => ({ x: p.x, y: p.y }));
        }
        if (Array.isArray(out.paths)) {
            out.paths = out.paths.map((path) =>
                Array.isArray(path) ? path.map((p) => ({ x: p.x, y: p.y })) : path
            );
        }
        return out;
    }

    function snapshot(model) {
        return {
            pages: (model.pages || []).map((p) => ({ ...p })),
            watermarks: (model.watermarks || []).map(cloneItem),
            redactions: (model.redactions || []).map(cloneItem),
            signatures: (model.signatures || []).map(cloneItem),
            markups: (model.markups || []).map(cloneItem),
            comments: (model.comments || []).map(cloneItem),
            inks: (model.inks || []).map(cloneItem),
            bookmarks: (model.bookmarks || []).map(cloneItem),
            formValues: { ...(model.formValues || {}) },
            manualFormFills: (model.manualFormFills || []).map(cloneItem),
        };
    }

    function restore(model, snap) {
        if (!snap) return;
        model.pages = (snap.pages || []).map((p) => ({ ...p }));
        model.watermarks = (snap.watermarks || []).map(cloneItem);
        model.redactions = (snap.redactions || []).map(cloneItem);
        model.signatures = (snap.signatures || []).map(cloneItem);
        model.markups = (snap.markups || []).map(cloneItem);
        model.comments = (snap.comments || []).map(cloneItem);
        model.inks = (snap.inks || []).map(cloneItem);
        model.bookmarks = (snap.bookmarks || []).map(cloneItem);
        model.formValues = { ...(snap.formValues || {}) };
        model.manualFormFills = (snap.manualFormFills || []).map(cloneItem);
    }

    function clear() {
        past = [];
        future = [];
    }

    function record(model) {
        if (restoring || !model) return;
        past.push(snapshot(model));
        if (past.length > MAX) past.shift();
        future = [];
        notify();
    }

    function canUndo() {
        return past.length > 0;
    }

    function canRedo() {
        return future.length > 0;
    }

    function undo(model) {
        if (!canUndo() || !model) return false;
        restoring = true;
        future.push(snapshot(model));
        restore(model, past.pop());
        restoring = false;
        notify();
        return true;
    }

    function redo(model) {
        if (!canRedo() || !model) return false;
        restoring = true;
        past.push(snapshot(model));
        restore(model, future.pop());
        restoring = false;
        notify();
        return true;
    }

    let listener = null;
    function setListener(fn) {
        listener = fn;
    }
    function notify() {
        listener?.({ canUndo: canUndo(), canRedo: canRedo() });
    }

    function isRestoring() {
        return restoring;
    }

    global.PdfEditorHistory = {
        clear,
        record,
        undo,
        redo,
        canUndo,
        canRedo,
        setListener,
        isRestoring,
        snapshot,
    };
})(typeof window !== 'undefined' ? window : global);
