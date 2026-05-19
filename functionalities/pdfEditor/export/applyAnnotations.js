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
                const size = Math.min(sig.fontSize || 24, pdfH * 0.9);
                page.drawText(sig.text, {
                    x: pdfX,
                    y: pdfY + (pdfH - size) / 2,
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

    global.PdfEditorApplyAnnotations = {
        applyWatermarks,
        applyRedactions,
        applySignatures,
        hexToRgb,
    };
})(typeof window !== 'undefined' ? window : global);
