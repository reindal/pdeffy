/**
 * Apply filled AcroForm values to a pdf-lib PDFDocument.
 */
(function (global) {
    const { StandardFonts } = require('pdf-lib');

    function applyFormValues(pdfDoc, model) {
        if (!pdfDoc || !model) return { applied: 0, failed: [] };
        const values = model.formValues || {};
        const fieldsMeta = model.formFields || [];
        if (!Object.keys(values).length && !fieldsMeta.length) {
            return { applied: 0, failed: [] };
        }

        let form;
        try {
            form = pdfDoc.getForm();
        } catch (err) {
            console.warn('[pdfEditor] getForm', err);
            return { applied: 0, failed: ['getForm'] };
        }

        if (typeof form.hasXFA === 'function' && form.hasXFA()) {
            try {
                form.deleteXFA();
            } catch (_) { /* ignore */ }
        }

        const metaByName = new Map();
        fieldsMeta.forEach((f) => {
            if (!metaByName.has(f.name)) metaByName.set(f.name, f);
        });

        let applied = 0;
        const failed = [];

        const tryApply = (name, fn) => {
            try {
                fn();
                applied += 1;
            } catch (err) {
                console.warn('[pdfEditor] form field', name, err);
                failed.push(name);
            }
        };

        Object.keys(values).forEach((name) => {
            const value = values[name];
            const meta = metaByName.get(name);
            const type = meta?.type;

            if (type === 'checkbox') {
                tryApply(name, () => {
                    const box = form.getCheckBox(name);
                    if (value === true || value === 'Yes' || value === meta?.exportValue) {
                        box.check();
                    } else {
                        box.uncheck();
                    }
                });
                return;
            }

            if (type === 'radio') {
                tryApply(name, () => {
                    const group = form.getRadioGroup(name);
                    const opts = group.getOptions?.() || [];
                    const str = value == null ? '' : String(value);
                    if (!str) {
                        if (typeof group.clear === 'function') group.clear();
                        return;
                    }
                    if (opts.includes(str)) {
                        group.select(str);
                        return;
                    }
                    const idx = Number(str);
                    if (Number.isInteger(idx) && opts[idx] != null) {
                        group.select(opts[idx]);
                        return;
                    }
                    const byLabel = opts.find((o) => String(o) === str);
                    if (byLabel != null) {
                        group.select(byLabel);
                        return;
                    }
                    group.select(str);
                });
                return;
            }

            if (type === 'dropdown') {
                tryApply(name, () => {
                    const dd = form.getDropdown(name);
                    const str = value == null ? '' : String(value);
                    if (!str) {
                        if (typeof dd.clear === 'function') dd.clear();
                        else dd.select?.(dd.getOptions?.()[0] || '');
                        return;
                    }
                    dd.select(str);
                });
                return;
            }

            if (type === 'listbox') {
                tryApply(name, () => {
                    const list = form.getOptionList(name);
                    const str = value == null ? '' : String(value);
                    if (!str) {
                        if (typeof list.clear === 'function') list.clear();
                        return;
                    }
                    list.select(str);
                });
                return;
            }

            // text or unknown — try text field, then generic
            tryApply(name, () => {
                try {
                    const tf = form.getTextField(name);
                    tf.setText(value == null ? '' : String(value));
                    return;
                } catch (_) { /* fall through */ }
                try {
                    const dd = form.getDropdown(name);
                    dd.select(String(value ?? ''));
                    return;
                } catch (_) { /* fall through */ }
                try {
                    const box = form.getCheckBox(name);
                    if (value) box.check();
                    else box.uncheck();
                    return;
                } catch (_) { /* fall through */ }
                try {
                    const group = form.getRadioGroup(name);
                    if (value != null && String(value) !== '') group.select(String(value));
                } catch (err) {
                    throw err;
                }
            });
        });

        return { applied, failed, form };
    }

    async function updateFormAppearances(pdfDoc, form) {
        if (!pdfDoc) return;
        const f = form || pdfDoc.getForm();
        try {
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            f.updateFieldAppearances(font);
        } catch (err) {
            console.warn('[pdfEditor] updateFieldAppearances', err);
            try {
                f.updateFieldAppearances();
            } catch (_) { /* ignore */ }
        }
    }

    function flattenForm(pdfDoc, form) {
        try {
            const f = form || pdfDoc.getForm();
            f.flatten();
        } catch (err) {
            console.warn('[pdfEditor] form.flatten', err);
        }
    }

    global.PdfEditorApplyFormValues = {
        applyFormValues,
        updateFormAppearances,
        flattenForm,
    };
})(typeof window !== 'undefined' ? window : global);
