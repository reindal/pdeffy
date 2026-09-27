/**
 * Apply watermarks, redactions, and visual signatures to a pdf-lib document.
 */
(function (global) {
    const { rgb, degrees } = require('pdf-lib');

    function hexToRgb(hex) {
        const h = String(hex || '#000000').replace('#', '');
        return rgb(
            parseInt(h.substring(0, 2), 16) / 255,
            parseInt(h.substring(2, 4), 16) / 255,
            parseInt(h.substring(4, 6), 16) / 255
        );
    }

    function textColorFromLayer(layer) {
        if (typeof layer.color === 'string' && layer.color.startsWith('#')) {
            return hexToRgb(layer.color);
        }
        switch (layer.color) {
            case 'red':
                return rgb(0.8, 0, 0);
            case 'gray':
                return rgb(0.5, 0.5, 0.5);
            case 'blue':
                return rgb(0, 0, 0.8);
            case 'green':
                return rgb(0, 0.6, 0);
            default:
                return rgb(0, 0, 0);
        }
    }

    async function applyWatermarks(pdfDoc, watermarks) {
        if (!watermarks.length) return;

        const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');
        const pages = pdfDoc.getPages();

        for (const layer of watermarks) {
            if (layer.type === 'image' && layer.imageBytes && !layer.embeddedPdfImage) {
                const isJpeg =
                    layer.imageMediaType === 'image/jpeg' || layer.imageMediaType === 'image/jpg';
                layer.embeddedPdfImage = isJpeg
                    ? await pdfDoc.embedJpg(layer.imageBytes)
                    : await pdfDoc.embedPng(layer.imageBytes);
            }
        }

        pages.forEach((page) => {
            const { width, height } = page.getSize();
            watermarks.forEach((layer) => {
                const x = (layer.posX / 100) * width;
                const y = (layer.posY / 100) * height;
                const rotationAngle = layer.rotation || 0;
                const rotationRad = (rotationAngle * Math.PI) / 180;

                if (layer.type === 'image' && layer.embeddedPdfImage) {
                    const scaledDims = layer.embeddedPdfImage.scale((layer.imageScale || 50) / 100);
                    const offsetX =
                        (scaledDims.width / 2) * Math.cos(rotationRad) -
                        (scaledDims.height / 2) * Math.sin(rotationRad);
                    const offsetY =
                        (scaledDims.width / 2) * Math.sin(rotationRad) +
                        (scaledDims.height / 2) * Math.cos(rotationRad);
                    page.drawImage(layer.embeddedPdfImage, {
                        x: x - offsetX,
                        y: y - offsetY,
                        width: scaledDims.width,
                        height: scaledDims.height,
                        opacity: layer.opacity ?? 0.3,
                        rotate: degrees(rotationAngle),
                    });
                } else if (layer.type === 'text' && layer.text) {
                    const textWidth = helveticaFont.widthOfTextAtSize(layer.text, layer.fontSize || 48);
                    const textHeight = layer.fontSize || 48;
                    const offsetX =
                        (textWidth / 2) * Math.cos(rotationRad) +
                        (textHeight / 2) * Math.sin(rotationRad);
                    const offsetY =
                        (textWidth / 2) * Math.sin(rotationRad) -
                        (textHeight / 2) * Math.cos(rotationRad);
                    page.drawText(layer.text, {
                        x: x - offsetX,
                        y: y - offsetY,
                        size: layer.fontSize || 48,
                        font: helveticaFont,
                        color: textColorFromLayer(layer),
                        opacity: layer.opacity ?? 0.3,
                        rotate: degrees(rotationAngle),
                    });
                }
            });
        });
    }

    function applyRedactions(pdfDoc, redactions, pageIdToOutIndex) {
        redactions.forEach((r) => {
            const outIdx = pageIdToOutIndex.get(r.pageId);
            if (outIdx === undefined) return;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const pdfW = r.width * width;
            const pdfH = r.height * height;
            const pdfX = r.x * width;
            const pdfY = height - r.y * height - pdfH;
            page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: pdfW,
                height: pdfH,
                color: hexToRgb(r.color),
                borderWidth: 0,
            });
        });
    }

    function applyMarkups(pdfDoc, markups, pageIdToOutIndex) {
        (markups || []).forEach((m) => {
            const outIdx = pageIdToOutIndex.get(m.pageId);
            if (outIdx === undefined) return;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const pdfW = m.width * width;
            const pdfH = m.height * height;
            const pdfX = m.x * width;
            const pdfY = height - m.y * height - pdfH;
            if (m.type === 'underline') {
                page.drawLine({
                    start: { x: pdfX, y: pdfY },
                    end: { x: pdfX + pdfW, y: pdfY },
                    thickness: Math.max(1, pdfH * 0.12),
                    color: hexToRgb(m.color || '#1a73e8'),
                    opacity: 0.95,
                });
            } else {
                page.drawRectangle({
                    x: pdfX,
                    y: pdfY,
                    width: pdfW,
                    height: pdfH,
                    color: hexToRgb(m.color || '#ffe066'),
                    opacity: 0.45,
                    borderWidth: 0,
                });
            }
        });
    }

    function layoutWrappedLines(text, font, fontSize, maxWidth) {
        const out = [];
        const paras = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
        const pushBrokenWord = (word) => {
            let chunk = '';
            for (const ch of word) {
                const next = chunk + ch;
                if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) chunk = next;
                else {
                    if (chunk) out.push(chunk);
                    chunk = ch;
                }
            }
            if (chunk) out.push(chunk);
        };
        for (const para of paras) {
            if (!para) {
                out.push('');
                continue;
            }
            let line = '';
            for (const word of para.split(/\s+/)) {
                if (!word) continue;
                const candidate = line ? `${line} ${word}` : word;
                if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
                    line = candidate;
                    continue;
                }
                if (line) out.push(line);
                if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
                    pushBrokenWord(word);
                    line = '';
                } else {
                    line = word;
                }
            }
            if (line) out.push(line);
        }
        return out;
    }

    function drawManualTextInBox(page, text, pdfX, pdfY, pdfW, pdfH, font, opts = {}) {
        const pad = 2;
        const innerW = Math.max(4, pdfW - pad * 2);
        const innerH = Math.max(4, pdfH - pad * 2);
        const lineGap = 1.2;
        const ink =
            typeof opts.color === 'string' && opts.color.startsWith('#')
                ? hexToRgb(opts.color)
                : rgb(0, 0, 0);
        let fontSize = Math.min(Math.max(6, opts.fontSize || 12), innerH * 0.45);
        let lines = [];
        for (let attempt = 0; attempt < 10; attempt++) {
            lines = layoutWrappedLines(text, font, fontSize, innerW);
            const blockH = lines.length * fontSize * lineGap;
            if (blockH <= innerH || fontSize <= 6) break;
            fontSize = Math.max(6, fontSize * (innerH / blockH) * 0.95);
        }
        let baselineY = pdfY + pdfH - pad - fontSize;
        const minY = pdfY + pad;
        for (const line of lines) {
            if (baselineY < minY) break;
            if (line) {
                page.drawText(line, {
                    x: pdfX + pad,
                    y: baselineY,
                    size: fontSize,
                    font,
                    color: ink,
                });
            }
            baselineY -= fontSize * lineGap;
        }
    }

    async function applyManualFormFills(pdfDoc, entries, pageIdToOutIndex) {
        const font = await pdfDoc.embedFont('Helvetica');
        for (const entry of entries || []) {
            const outIdx = pageIdToOutIndex.get(entry.pageId);
            if (outIdx === undefined) continue;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const pdfW = (entry.width || 0.2) * width;
            const pdfH = (entry.height || 0.03) * height;
            const pdfX = entry.x * width;
            const pdfY = height - entry.y * height - pdfH;

            const framed = entry.framed !== false;
            const cx = pdfX + pdfW / 2;
            const cy = pdfY + pdfH / 2;
            const size = Math.min(pdfW, pdfH) * 0.85;
            const ink = hexToRgb(entry.color || '#000000');

            if (entry.type === 'check') {
                if (framed) {
                    page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: pdfW,
                        height: pdfH,
                        borderColor: ink,
                        borderWidth: 1,
                    });
                }
                if (entry.checked !== false) {
                    page.drawLine({
                        start: { x: cx - size * 0.35, y: cy },
                        end: { x: cx - size * 0.05, y: cy - size * 0.3 },
                        thickness: Math.max(1, size * 0.12),
                        color: ink,
                    });
                    page.drawLine({
                        start: { x: cx - size * 0.05, y: cy - size * 0.3 },
                        end: { x: cx + size * 0.4, y: cy + size * 0.35 },
                        thickness: Math.max(1, size * 0.12),
                        color: ink,
                    });
                }
            } else if (entry.type === 'radio') {
                const outerR = size * 0.38;
                const innerR = size * 0.2;
                if (framed) {
                    page.drawEllipse({
                        x: cx - outerR,
                        y: cy - outerR,
                        xScale: outerR,
                        yScale: outerR,
                        borderColor: ink,
                        borderWidth: 1,
                        color: undefined,
                    });
                }
                if (entry.checked !== false) {
                    page.drawEllipse({
                        x: cx - innerR,
                        y: cy - innerR,
                        xScale: innerR,
                        yScale: innerR,
                        color: ink,
                        borderWidth: 0,
                    });
                }
            } else if (entry.type === 'text' && entry.text) {
                drawManualTextInBox(page, entry.text, pdfX, pdfY, pdfW, pdfH, font, {
                    fontSize: entry.fontSize,
                    color: entry.color,
                });
            }
        }
    }

    async function applySignatures(pdfDoc, signatures, pageIdToOutIndex) {
        const font = await pdfDoc.embedFont('Helvetica');
        for (const sig of signatures) {
            const outIdx = pageIdToOutIndex.get(sig.pageId);
            if (outIdx === undefined) continue;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const pdfW = sig.width * width;
            const pdfH = sig.height * height;
            const pdfX = sig.x * width;
            const pdfY = height - sig.y * height - pdfH;

            if (sig.type === 'text' && sig.text) {
                let size = Math.max(6, pdfH * 0.85);
                let textWidth = font.widthOfTextAtSize(sig.text, size);
                if (textWidth > pdfW && pdfW > 0) {
                    size = Math.max(6, size * (pdfW / textWidth) * 0.98);
                    textWidth = font.widthOfTextAtSize(sig.text, size);
                }
                page.drawText(sig.text, {
                    x: pdfX + Math.max(0, (pdfW - textWidth) / 2),
                    y: pdfY + Math.max(0, (pdfH - size) / 2),
                    size,
                    font,
                    color: hexToRgb(sig.color || '#000000'),
                });
            } else if (sig.pngBytes) {
                const img = await pdfDoc.embedPng(sig.pngBytes);
                page.drawImage(img, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfW,
                    height: pdfH,
                });
            }
        }
    }

    function applyInks(pdfDoc, inks, pageIdToOutIndex) {
        (inks || []).forEach((ink) => {
            const outIdx = pageIdToOutIndex.get(ink.pageId);
            if (outIdx === undefined) return;
            const pts = ink.points || [];
            if (pts.length < 2) return;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const color = hexToRgb(ink.color || '#e53935');
            const thickness = Math.max(0.5, Number(ink.width) || 2.5);
            const shape = ink.shape || 'freehand';
            const toPdf = (p) => ({ x: p.x * width, y: height - p.y * height });

            const drawSegments = (points, close) => {
                const list = points.slice();
                if (close && list.length >= 3) list.push(list[0]);
                for (let i = 1; i < list.length; i++) {
                    const a = toPdf(list[i - 1]);
                    const b = toPdf(list[i]);
                    page.drawLine({
                        start: a,
                        end: b,
                        thickness,
                        color,
                        lineCap: 1,
                    });
                }
            };

            if (shape === 'rect') {
                const a = pts[0];
                const b = pts[1];
                drawSegments(
                    [
                        { x: a.x, y: a.y },
                        { x: b.x, y: a.y },
                        { x: b.x, y: b.y },
                        { x: a.x, y: b.y },
                    ],
                    true
                );
                return;
            }

            if (shape === 'ellipse') {
                const a = pts[0];
                const b = pts[1];
                const cx = (a.x + b.x) / 2;
                const cy = (a.y + b.y) / 2;
                const rx = Math.abs(b.x - a.x) / 2;
                const ry = Math.abs(b.y - a.y) / 2;
                const steps = 48;
                const ring = [];
                for (let i = 0; i < steps; i++) {
                    const t = (i / steps) * Math.PI * 2;
                    ring.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
                }
                drawSegments(ring, true);
                return;
            }

            if (shape === 'arrow') {
                const a = pts[0];
                const b = pts[1];
                drawSegments([a, b], false);
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                // Head size in normalized page space (approx from thickness).
                const head = Math.max(0.012, (thickness / Math.max(width, height)) * 8);
                const a1 = angle + Math.PI * 0.82;
                const a2 = angle - Math.PI * 0.82;
                const h1 = { x: b.x + Math.cos(a1) * head, y: b.y + Math.sin(a1) * head };
                const h2 = { x: b.x + Math.cos(a2) * head, y: b.y + Math.sin(a2) * head };
                drawSegments([h1, b, h2], false);
                return;
            }

            if (shape === 'polygon') {
                drawSegments(pts, true);
                return;
            }

            drawSegments(pts, false);
        });
    }

    async function applyComments(pdfDoc, comments, pageIdToOutIndex) {
        if (!comments?.length) return;
        const font = await pdfDoc.embedFont('Helvetica');
        for (const c of comments) {
            const outIdx = pageIdToOutIndex.get(c.pageId);
            if (outIdx === undefined) continue;
            const page = pdfDoc.getPage(outIdx);
            const { width, height } = page.getSize();
            const size = 10;
            const x = c.x * width;
            const y = height - c.y * height - size;
            // Pin marker
            page.drawCircle({
                x: x + 4,
                y: y + 4,
                size: 5,
                color: hexToRgb(c.color || '#f4b400'),
            });
            const label = String(c.text || '').slice(0, 80);
            if (label) {
                page.drawText(label, {
                    x: x + 12,
                    y: y,
                    size,
                    font,
                    color: hexToRgb('#333333'),
                    maxWidth: Math.max(40, width - x - 20),
                });
            }
        }
    }

    function applyBookmarks(pdfDoc, bookmarks, pageIdToOutIndex) {
        // In-app bookmarks are primary; outline export is best-effort via pdf-lib low-level API.
        const list = (bookmarks || [])
            .map((b) => {
                const outIdx = pageIdToOutIndex.get(b.pageId);
                if (outIdx === undefined) return null;
                return { title: String(b.title || `Page ${outIdx + 1}`), pageIndex: outIdx, y: b.y || 0 };
            })
            .filter(Boolean);
        if (!list.length) return;
        try {
            const pdfLib = require('pdf-lib');
            const { PDFName, PDFNumber, PDFString } = pdfLib;
            const context = pdfDoc.context;
            const catalog = pdfDoc.catalog;
            if (!context?.obj || !catalog?.set) return;

            let firstRef = null;
            let lastRef = null;
            let prevItem = null;
            let prevRef = null;
            let count = 0;

            for (const bm of list) {
                const page = pdfDoc.getPage(bm.pageIndex);
                const { height } = page.getSize();
                const dest = context.obj([
                    page.ref,
                    PDFName.of('XYZ'),
                    null,
                    PDFNumber.of(height * (1 - (bm.y || 0))),
                    null,
                ]);
                const itemDict = {
                    Title: PDFString.of(bm.title),
                    Dest: dest,
                };
                const item = context.obj(itemDict);
                const itemRef = context.register(item);
                if (!firstRef) firstRef = itemRef;
                if (prevItem && prevRef) {
                    prevItem.set(PDFName.of('Next'), itemRef);
                    item.set(PDFName.of('Prev'), prevRef);
                }
                prevItem = item;
                prevRef = itemRef;
                lastRef = itemRef;
                count += 1;
            }

            if (!count || !firstRef || !lastRef) return;
            const outlines = context.obj({
                Type: PDFName.of('Outlines'),
                First: firstRef,
                Last: lastRef,
                Count: PDFNumber.of(count),
            });
            const outlinesRef = context.register(outlines);
            // Link Parent on each item
            // (skipped if Parent causes cycles — viewers still show First/Last chain)
            catalog.set(PDFName.of('Outlines'), outlinesRef);
        } catch (err) {
            console.warn('[pdfEditor] bookmarks outline export skipped', err);
        }
    }

    global.PdfEditorApplyAnnotations = {
        applyWatermarks,
        applyRedactions,
        applyMarkups,
        applyManualFormFills,
        applySignatures,
        applyInks,
        applyComments,
        applyBookmarks,
        hexToRgb,
    };
})(typeof window !== 'undefined' ? window : global);
