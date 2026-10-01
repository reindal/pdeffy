/**
 * PDF document / file metadata for the document information inspector.
 */
(function (global) {
    function formatBytes(n) {
        const size = Number(n) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    /** @param {string} raw */
    function parsePdfDate(raw) {
        const s = String(raw || '').trim();
        if (!s) return '';
        const m = s.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?/i);
        if (!m) return s;
        const y = m[1];
        const mo = m[2] || '01';
        const d = m[3] || '01';
        const h = m[4] || '00';
        const mi = m[5] || '00';
        const se = m[6] || '00';
        try {
            const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}`;
            const dt = new Date(iso);
            if (Number.isNaN(dt.getTime())) return s;
            return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        } catch (_) {
            return s;
        }
    }

    function basename(filePath) {
        if (!filePath) return '';
        const p = String(filePath).replace(/\\/g, '/');
        const i = p.lastIndexOf('/');
        return i >= 0 ? p.slice(i + 1) : p;
    }

    function pushField(list, labelKey, fallback, value) {
        const v = value === null || value === undefined ? '' : String(value).trim();
        if (!v) return;
        list.push({ labelKey, fallback, value: v });
    }

    function pushBool(list, labelKey, fallback, value, yesKey, yesFb, noKey, noFb) {
        if (value === null || value === undefined) return;
        list.push({
            labelKey,
            fallback,
            value: value ? yesFb : noFb,
            valueKey: value ? yesKey : noKey,
        });
    }

    /** @param {Record<string, unknown>} info @param {string[]} keys */
    function infoGet(info, ...keys) {
        if (!info || typeof info !== 'object') return '';
        for (const key of keys) {
            if (info[key] != null && String(info[key]).trim()) return String(info[key]).trim();
            const lower = key.toLowerCase();
            for (const [k, v] of Object.entries(info)) {
                if (k.toLowerCase() === lower && v != null && String(v).trim()) return String(v).trim();
            }
        }
        return '';
    }

    /** @param {object|null} xmp */
    function metaGet(xmp, ...keys) {
        if (!xmp) return '';
        if (typeof xmp.get === 'function') {
            for (const key of keys) {
                const v = xmp.get(key);
                if (v != null && String(v).trim()) return String(v).trim();
            }
        }
        if (typeof xmp.getAll === 'function') {
            for (const key of keys) {
                try {
                    const all = xmp.getAll(key);
                    if (Array.isArray(all) && all.length) {
                        const first = all.find((x) => x != null && String(x).trim());
                        if (first) return String(first).trim();
                    }
                } catch (_) {
                    /* ignore */
                }
            }
        }
        return '';
    }

    /** @param {object|null} xmp @param {string} tag */
    function scrapeXmpTag(xmp, tag) {
        const direct = metaGet(xmp, tag);
        if (direct) return direct;
        const raw =
            xmp?.serializable ||
            xmp?.metadata ||
            xmp?._metadataMap ||
            (typeof xmp?.getRaw === 'function' ? xmp.getRaw() : '');
        const xml = typeof raw === 'string' ? raw : '';
        if (!xml) return '';
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`<${escaped}[^>]*>([^<]+)</${escaped}>`, 'i');
        const m = xml.match(re);
        if (m?.[1]) return m[1].trim();
        const reLi = new RegExp(`<${escaped}[\\s\\S]*?<rdf:li[^>]*>([^<]+)</rdf:li>`, 'i');
        const m2 = xml.match(reLi);
        return m2?.[1]?.trim() || '';
    }

    function firstNonEmpty(...values) {
        for (const v of values) {
            const s = v == null ? '' : String(v).trim();
            if (s) return s;
        }
        return '';
    }

    /**
     * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
     * @param {object} ctx
     */
    async function inspectPdfMetadata(pdfDoc, ctx = {}) {
        /** @type {{ id: string, titleKey: string, titleFallback: string, fields: object[] }[]} */
        const sections = [];

        const fileFields = [];
        pushField(fileFields, 'pdfEditorMetaFileName', 'Nome file', ctx.fileName);
        const pathLabel = basename(ctx.filePath);
        if (pathLabel && pathLabel !== ctx.fileName) {
            pushField(fileFields, 'pdfEditorMetaFilePath', 'Percorso', pathLabel);
        }
        if (ctx.byteLength) {
            pushField(fileFields, 'pdfEditorMetaFileSize', 'Dimensione file', formatBytes(ctx.byteLength));
        }
        const pages = ctx.pageCount ?? pdfDoc?.numPages;
        if (pages) {
            pushField(
                fileFields,
                'pdfEditorMetaPageCount',
                'Pagine',
                ctx.activePageCount != null && ctx.activePageCount !== pages
                    ? `${ctx.activePageCount} / ${pages}`
                    : String(pages)
            );
        }
        if (fileFields.length) {
            sections.push({
                id: 'file',
                titleKey: 'pdfEditorMetaSectionFile',
                titleFallback: 'File',
                fields: fileFields,
            });
        }

        let info = {};
        /** @type {object|null} */
        let xmp = null;
        try {
            const meta = await pdfDoc.getMetadata();
            info = meta?.info || {};
            xmp = meta?.metadata || null;
        } catch (_) {
            info = {};
        }

        const docFields = [];
        const title = firstNonEmpty(
            infoGet(info, 'Title'),
            metaGet(xmp, 'dc:title', 'pdf:Title'),
            scrapeXmpTag(xmp, 'dc:title')
        );
        const author = firstNonEmpty(
            infoGet(info, 'Author'),
            metaGet(xmp, 'dc:creator', 'pdf:Author', 'xmp:Creator'),
            scrapeXmpTag(xmp, 'dc:creator')
        );
        const subject = firstNonEmpty(
            infoGet(info, 'Subject'),
            metaGet(xmp, 'dc:description', 'pdf:Subject'),
            scrapeXmpTag(xmp, 'dc:description')
        );
        const keywords = firstNonEmpty(
            infoGet(info, 'Keywords'),
            metaGet(xmp, 'pdf:Keywords', 'dc:subject'),
            scrapeXmpTag(xmp, 'pdf:Keywords')
        );
        const language = firstNonEmpty(infoGet(info, 'Language'), metaGet(xmp, 'dc:language'));

        docFields.push({
            labelKey: 'pdfEditorMetaTitle',
            fallback: 'Titolo',
            value: title || '—',
        });
        docFields.push({
            labelKey: 'pdfEditorMetaAuthor',
            fallback: 'Autore',
            value: author || '—',
        });
        pushField(docFields, 'pdfEditorMetaSubject', 'Oggetto', subject);
        pushField(docFields, 'pdfEditorMetaKeywords', 'Parole chiave', keywords);
        pushField(docFields, 'pdfEditorMetaLanguage', 'Lingua', language);
        const created = infoGet(info, 'CreationDate');
        const modified = infoGet(info, 'ModDate');
        if (created) {
            pushField(docFields, 'pdfEditorMetaCreated', 'Creato', parsePdfDate(created));
        }
        if (modified) {
            pushField(docFields, 'pdfEditorMetaModified', 'Ultima modifica', parsePdfDate(modified));
        }
        if (docFields.length) {
            sections.push({
                id: 'document',
                titleKey: 'pdfEditorMetaSectionDocument',
                titleFallback: 'Documento',
                fields: docFields,
            });
        }

        const prodFields = [];
        pushField(
            prodFields,
            'pdfEditorMetaCreator',
            'Creato con',
            firstNonEmpty(infoGet(info, 'Creator'), metaGet(xmp, 'xmp:CreatorTool'))
        );
        pushField(
            prodFields,
            'pdfEditorMetaProducer',
            'Prodotto con',
            firstNonEmpty(infoGet(info, 'Producer'), metaGet(xmp, 'pdf:Producer'))
        );
        if (prodFields.length) {
            sections.push({
                id: 'production',
                titleKey: 'pdfEditorMetaSectionProduction',
                titleFallback: 'Produzione',
                fields: prodFields,
            });
        }

        const pdfFields = [];
        let pdfVersion = '';
        try {
            pdfVersion = pdfDoc?._pdfInfo?.pdfFormatVersion || pdfDoc?.pdfInfo?.pdfFormatVersion || '';
        } catch (_) {
            /* ignore */
        }
        if (!pdfVersion) pdfVersion = infoGet(info, 'PDFFormatVersion');
        pushField(pdfFields, 'pdfEditorMetaPdfVersion', 'Versione PDF', pdfVersion ? `PDF ${pdfVersion}` : '');

        const trapped = infoGet(info, 'Trapped');
        if (trapped) {
            pushField(pdfFields, 'pdfEditorMetaTrapped', 'Trapped', trapped);
        }

        pushBool(
            pdfFields,
            'pdfEditorMetaEncrypted',
            'Protetto da password',
            ctx.isEncrypted,
            'pdfEditorMetaYes',
            'Sì',
            'pdfEditorMetaNo',
            'No'
        );
        pushBool(
            pdfFields,
            'pdfEditorMetaAcroForm',
            'Moduli interattivi (AcroForm)',
            ctx.acroFormPresent,
            'pdfEditorMetaYes',
            'Sì',
            'pdfEditorMetaNo',
            'No'
        );
        if (ctx.hasEmbeddedText === false || ctx.textSelectionWeak === true) {
            pushField(
                pdfFields,
                'pdfEditorMetaTextLayer',
                'Testo selezionabile',
                ctx.hasEmbeddedText === false
                    ? 'Limitato (probabilmente solo immagini)'
                    : 'Limitato (selezione per area)'
            );
        } else if (ctx.hasEmbeddedText === true) {
            pushBool(
                pdfFields,
                'pdfEditorMetaTextLayer',
                'Testo selezionabile',
                true,
                'pdfEditorMetaYes',
                'Sì',
                'pdfEditorMetaNo',
                'No'
            );
        }

        if (info.IsLinearized === true || info.IsLinearized === 'true') {
            pushField(pdfFields, 'pdfEditorMetaLinearized', 'Fast Web View', 'Sì');
        }

        if (pdfFields.length) {
            sections.push({
                id: 'pdf',
                titleKey: 'pdfEditorMetaSectionPdf',
                titleFallback: 'PDF',
                fields: pdfFields,
            });
        }

        return { sections, fetchedAt: Date.now() };
    }

    global.PdfEditorDocumentMetadata = {
        inspectPdfMetadata,
        formatBytes,
        parsePdfDate,
    };
})(typeof window !== 'undefined' ? window : global);
