/**
 * Detect and normalize AcroForm / Widget fields from pdf.js for interactive fill.
 */
(function (global) {
    function createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function normalizeChoiceValue(raw) {
        if (raw == null) return '';
        if (Array.isArray(raw)) return raw.length ? String(raw[0] ?? '') : '';
        return String(raw);
    }

    function classifyWidget(annot) {
        if (!annot || annot.subtype !== 'Widget') return null;
        if (annot.pushButton) return null;
        const fieldType = annot.fieldType;
        if (fieldType === 'Tx') return 'text';
        if (fieldType === 'Ch') return annot.combo ? 'dropdown' : 'listbox';
        if (fieldType === 'Btn') {
            if (annot.radioButton) return 'radio';
            if (annot.checkBox) return 'checkbox';
            return null;
        }
        if (fieldType === 'Sig') return null;
        return null;
    }

    function rectToNormalized(annotRect, viewport) {
        if (!annotRect || !viewport || typeof viewport.convertToViewportRectangle !== 'function') {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        const vr = viewport.convertToViewportRectangle(annotRect);
        const left = Math.min(vr[0], vr[2]);
        const top = Math.min(vr[1], vr[3]);
        const width = Math.abs(vr[2] - vr[0]);
        const height = Math.abs(vr[3] - vr[1]);
        const vw = viewport.width || 1;
        const vh = viewport.height || 1;
        return {
            x: Math.max(0, Math.min(1, left / vw)),
            y: Math.max(0, Math.min(1, top / vh)),
            width: Math.max(0, Math.min(1, width / vw)),
            height: Math.max(0, Math.min(1, height / vh)),
        };
    }

    function initialValueForWidget(type, annot) {
        if (type === 'checkbox') {
            const on = annot.exportValue || 'Yes';
            const v = annot.fieldValue;
            if (v == null || v === 'Off' || v === false || v === '') return false;
            return String(v) === String(on) || v === true;
        }
        if (type === 'radio') {
            return normalizeChoiceValue(annot.fieldValue);
        }
        if (type === 'dropdown' || type === 'listbox') {
            return normalizeChoiceValue(annot.fieldValue);
        }
        return annot.fieldValue == null ? '' : String(annot.fieldValue);
    }

    function optionsFromAnnot(type, annot) {
        if (type === 'radio') {
            const v = annot.buttonValue != null ? String(annot.buttonValue) : '';
            return v ? [{ value: v, label: v }] : [];
        }
        if (type === 'dropdown' || type === 'listbox') {
            return (annot.options || []).map((opt) => ({
                value: String(opt.exportValue ?? opt.displayValue ?? ''),
                label: String(opt.displayValue ?? opt.exportValue ?? ''),
            }));
        }
        if (type === 'checkbox') {
            const on = annot.exportValue || 'Yes';
            return [{ value: String(on), label: String(on) }];
        }
        return [];
    }

    /**
     * @returns {{ fields: object[], values: Record<string, any> }}
     */
    async function extractFormFields(pdfDoc, pages) {
        const fields = [];
        const values = {};
        if (!pdfDoc || !pages?.length) return { fields, values };

        const pageBySource = new Map(pages.map((p) => [p.sourceIndex, p]));

        for (let sourceIndex = 0; sourceIndex < pdfDoc.numPages; sourceIndex++) {
            const pageState = pageBySource.get(sourceIndex);
            if (!pageState || pageState.deleted) continue;
            let pdfPage;
            try {
                pdfPage = await pdfDoc.getPage(sourceIndex + 1);
            } catch (err) {
                console.warn('[pdfEditor] form page', sourceIndex, err);
                continue;
            }
            let annots = [];
            try {
                annots = await pdfPage.getAnnotations({ intent: 'display' });
            } catch (err) {
                console.warn('[pdfEditor] getAnnotations form', err);
                continue;
            }
            const viewport = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate || 0 });

            for (const annot of annots || []) {
                const type = classifyWidget(annot);
                if (!type) continue;
                const name = String(annot.fieldName || '').trim();
                if (!name) continue;
                if (annot.readOnly) {
                    // Still show read-only fields, but interaction is disabled.
                }
                const norm = rectToNormalized(annot.rect, viewport);
                if (norm.width < 0.002 || norm.height < 0.002) continue;

                const radioExport =
                    type === 'radio' && annot.buttonValue != null
                        ? String(annot.buttonValue)
                        : annot.exportValue != null
                          ? String(annot.exportValue)
                          : null;

                const widget = {
                    id: createId('ff'),
                    name,
                    type,
                    pageId: pageState.id,
                    sourceIndex,
                    x: norm.x,
                    y: norm.y,
                    width: norm.width,
                    height: norm.height,
                    readOnly: !!annot.readOnly,
                    required: !!annot.required,
                    multiLine: !!annot.multiLine,
                    maxLen: typeof annot.maxLen === 'number' ? annot.maxLen : null,
                    exportValue: radioExport,
                    buttonValue: annot.buttonValue != null ? String(annot.buttonValue) : null,
                    options: optionsFromAnnot(type, annot),
                    altText: String(annot.alternativeText || ''),
                    annotationId: annot.id || null,
                };
                fields.push(widget);

                if (!(name in values)) {
                    values[name] = initialValueForWidget(type, annot);
                } else if (type === 'radio' && values[name] === '') {
                    values[name] = initialValueForWidget(type, annot);
                }
            }
        }

        // Merge radio option lists for the inspector (one logical field per name).
        const radioOpts = new Map();
        fields.forEach((f) => {
            if (f.type !== 'radio') return;
            if (!radioOpts.has(f.name)) radioOpts.set(f.name, []);
            const list = radioOpts.get(f.name);
            const v = f.buttonValue || f.options[0]?.value;
            if (v && !list.some((o) => o.value === v)) {
                list.push({ value: v, label: v });
            }
        });
        fields.forEach((f) => {
            if (f.type === 'radio' && radioOpts.has(f.name)) {
                f.groupOptions = radioOpts.get(f.name);
            }
        });

        return { fields, values };
    }

    function hasFormEdits(model) {
        const current = model.formValues || {};
        const initial = model.formInitialValues || {};
        const keys = new Set([...Object.keys(current), ...Object.keys(initial)]);
        for (const k of keys) {
            const a = current[k];
            const b = initial[k];
            if (typeof a === 'boolean' || typeof b === 'boolean') {
                if (Boolean(a) !== Boolean(b)) return true;
            } else if (String(a ?? '') !== String(b ?? '')) {
                return true;
            }
        }
        return false;
    }

    function uniqueLogicalFields(fields) {
        const seen = new Set();
        const out = [];
        for (const f of fields || []) {
            if (seen.has(f.name)) continue;
            seen.add(f.name);
            out.push(f);
        }
        return out;
    }

    function setFormValue(model, name, value) {
        if (!model.formValues) model.formValues = {};
        model.formValues[name] = value;
    }

    function getFormValue(model, name) {
        return model.formValues ? model.formValues[name] : undefined;
    }

    function isCheckboxChecked(model, field) {
        const v = getFormValue(model, field.name);
        if (typeof v === 'boolean') return v;
        const on = field.exportValue || 'Yes';
        return String(v) === String(on);
    }

    function isRadioSelected(model, field) {
        const v = getFormValue(model, field.name);
        if (v == null || v === '') return false;
        const bv = field.buttonValue ?? '';
        if (String(v) === String(bv)) return true;
        if (field.exportValue != null && String(v) === String(field.exportValue)) return true;
        const opts = field.groupOptions || field.options || [];
        for (const opt of opts) {
            if (String(v) === String(opt.value)) {
                return String(opt.value) === String(bv) || String(opt.label) === String(bv);
            }
        }
        return false;
    }

    global.PdfEditorFormFields = {
        extractFormFields,
        hasFormEdits,
        uniqueLogicalFields,
        setFormValue,
        getFormValue,
        isCheckboxChecked,
        isRadioSelected,
        classifyWidget,
    };
})(typeof window !== 'undefined' ? window : global);
