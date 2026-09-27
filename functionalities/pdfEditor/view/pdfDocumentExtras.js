/**
 * PDF attachments (EmbeddedFiles + FileAttachment annots) and digital signatures.
 */
(function (global) {
    function asUint8(data) {
        if (!data) return new Uint8Array(0);
        if (data instanceof Uint8Array) return data;
        if (data instanceof ArrayBuffer) return new Uint8Array(data);
        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }
        return new Uint8Array(data);
    }

    function formatBytes(n) {
        const size = Number(n) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function guessMime(filename) {
        const ext = String(filename || '')
            .split('.')
            .pop()
            ?.toLowerCase();
        const map = {
            pdf: 'application/pdf',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            txt: 'text/plain',
            csv: 'text/csv',
            html: 'text/html',
            htm: 'text/html',
            xml: 'application/xml',
            json: 'application/json',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            zip: 'application/zip',
        };
        return map[ext] || 'application/octet-stream';
    }

    function canPreview(filename) {
        const mime = guessMime(filename);
        return (
            mime.startsWith('image/') ||
            mime === 'application/pdf' ||
            mime.startsWith('text/') ||
            mime === 'application/json' ||
            mime === 'application/xml'
        );
    }

    function normalizeAttachment(entry, source) {
        if (!entry) return null;
        const filename = entry.filename || entry.rawFilename || entry.name || 'unnamed';
        const content = asUint8(entry.content);
        if (!content.length && !entry.description) {
            // Still list metadata-only specs.
        }
        return {
            id: `${source}:${filename}:${content.length}`,
            filename,
            description: entry.description || '',
            content,
            size: content.length,
            sizeLabel: formatBytes(content.length),
            mime: guessMime(filename),
            canPreview: canPreview(filename) && content.length > 0,
            source,
        };
    }

    async function extractAttachments(pdfDoc) {
        const list = [];
        const seen = new Set();

        const push = (raw, source) => {
            const item = normalizeAttachment(raw, source);
            if (!item) return;
            const key = `${item.filename}|${item.size}`;
            if (seen.has(key)) return;
            seen.add(key);
            list.push(item);
        };

        try {
            const embedded = await pdfDoc.getAttachments();
            if (embedded && typeof embedded === 'object') {
                Object.keys(embedded).forEach((key) => {
                    push(embedded[key], 'embedded');
                });
            }
        } catch (err) {
            console.warn('[pdfEditor] getAttachments', err);
        }

        try {
            const n = pdfDoc.numPages || 0;
            for (let i = 1; i <= n; i++) {
                const page = await pdfDoc.getPage(i);
                const annots = await page.getAnnotations();
                (annots || []).forEach((a) => {
                    if (a?.subtype === 'FileAttachment' || a?.file) {
                        push(a.file || a, `page:${i}`);
                    }
                });
            }
        } catch (err) {
            console.warn('[pdfEditor] page attachments', err);
        }

        return list;
    }

    function extractPdfLiteral(chunk, key) {
        // /Key (string) or /Key <hex> or /Key /Name
        const reParen = new RegExp(`${key}\\s*\\((?:\\\\.|[^\\\\)])*\\)`);
        const mParen = chunk.match(reParen);
        if (mParen) {
            return unescapePdfString(mParen[0].slice(mParen[0].indexOf('(') + 1, -1));
        }
        const reHex = new RegExp(`${key}\\s*<([0-9A-Fa-f\\s]+)>`);
        const mHex = chunk.match(reHex);
        if (mHex) {
            try {
                const hex = mHex[1].replace(/\s+/g, '');
                const bytes = new Uint8Array(hex.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
                }
                return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            } catch (_) {
                return '';
            }
        }
        const reName = new RegExp(`${key}\\s*/([^\\s/\\[\\]<>()]+)`);
        const mName = chunk.match(reName);
        return mName ? mName[1] : '';
    }

    function unescapePdfString(raw) {
        return String(raw || '')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
            .replace(/\\(.)/g, '$1');
    }

    function parsePdfDate(raw) {
        if (!raw) return null;
        const m = String(raw).match(
            /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/
        );
        if (!m) {
            const d = Date.parse(raw);
            return Number.isFinite(d) ? new Date(d) : null;
        }
        const [, y, mo = '01', da = '01', h = '00', mi = '00', s = '00'] = m;
        const date = new Date(
            Date.UTC(
                Number(y),
                Number(mo) - 1,
                Number(da),
                Number(h),
                Number(mi),
                Number(s)
            )
        );
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatSigDate(date) {
        if (!date) return '';
        try {
            return date.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
            });
        } catch (_) {
            return date.toISOString();
        }
    }

    /**
     * Best-effort scan of digital signature dictionaries via /ByteRange.
     * Does not cryptographically validate certificates (needs a PKI stack).
     */
    function extractDigitalSignatures(buffer) {
        const u8 = asUint8(buffer);
        if (u8.length < 64) return [];
        const text = new TextDecoder('latin1').decode(u8);
        const fileLen = u8.length;
        const out = [];
        const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
        let match;
        let index = 0;

        while ((match = re.exec(text))) {
            const b0 = Number(match[1]);
            const l0 = Number(match[2]);
            const b1 = Number(match[3]);
            const l1 = Number(match[4]);
            const dictStart = Math.max(0, match.index - 2500);
            const dictEnd = Math.min(text.length, match.index + 400);
            const chunk = text.slice(dictStart, dictEnd);

            const contentsIdx = text.indexOf('/Contents', match.index);
            let contentsStart = -1;
            let contentsEnd = -1;
            if (contentsIdx >= 0 && contentsIdx < match.index + 8000) {
                const lt = text.indexOf('<', contentsIdx);
                if (lt >= 0) {
                    const gt = text.indexOf('>', lt + 1);
                    if (gt > lt) {
                        contentsStart = lt;
                        contentsEnd = gt + 1;
                    }
                }
            }

            const coversDoc =
                b0 === 0 &&
                Number.isFinite(b0 + l0) &&
                Number.isFinite(b1 + l1) &&
                b0 + l0 <= b1 &&
                b1 + l1 === fileLen;

            const byteRangeAligned =
                contentsStart >= 0
                    ? b0 + l0 === contentsStart && b1 === contentsEnd
                    : coversDoc;

            const certified = /\/TransformMethod\s*\/DocMDP/.test(chunk);
            const name = extractPdfLiteral(chunk, '/Name') || '';
            const reason = extractPdfLiteral(chunk, '/Reason') || '';
            const location = extractPdfLiteral(chunk, '/Location') || '';
            const contact = extractPdfLiteral(chunk, '/ContactInfo') || '';
            const filter = extractPdfLiteral(chunk, '/Filter') || '';
            const subFilter = extractPdfLiteral(chunk, '/SubFilter') || '';
            const dateRaw = extractPdfLiteral(chunk, '/M') || '';
            const signedAt = parsePdfDate(dateRaw);

            index += 1;
            out.push({
                id: `sig_${index}`,
                index,
                name: name || `Firma ${index}`,
                reason,
                location,
                contact,
                filter,
                subFilter,
                dateRaw,
                signedAt,
                signedAtLabel: formatSigDate(signedAt),
                certified,
                byteRange: [b0, l0, b1, l1],
                coversDocument: coversDoc,
                byteRangeAligned,
                // Heuristic integrity: ranges cover whole file excluding Contents.
                intact: coversDoc && (contentsStart < 0 || byteRangeAligned),
            });
        }

        // Catalog-level DocMDP without a visible ByteRange still means certified.
        if (!out.some((s) => s.certified) && /\/DocMDP\b/.test(text)) {
            out.push({
                id: 'sig_docmdp',
                index: out.length + 1,
                name: 'DocMDP',
                reason: '',
                location: '',
                contact: '',
                filter: '',
                subFilter: '',
                dateRaw: '',
                signedAt: null,
                signedAtLabel: '',
                certified: true,
                byteRange: null,
                coversDocument: false,
                byteRangeAligned: false,
                intact: null,
            });
        }

        return out;
    }

    async function inspectPdfDocument(pdfDoc, originalBuffer) {
        const [attachments, signatures] = await Promise.all([
            extractAttachments(pdfDoc),
            Promise.resolve(extractDigitalSignatures(originalBuffer)),
        ]);
        return {
            attachments,
            signatures,
            hasAttachments: attachments.length > 0,
            hasSignatures: signatures.length > 0,
            isCertified: signatures.some((s) => s.certified),
        };
    }

    global.PdfEditorDocumentExtras = {
        inspectPdfDocument,
        extractAttachments,
        extractDigitalSignatures,
        formatBytes,
        guessMime,
        canPreview,
    };
})(typeof window !== 'undefined' ? window : global);
