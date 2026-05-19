/**
 * Coordinate helpers: PDF.js viewport (pixels) ↔ normalized 0–1 page space.
 */
(function (global) {
    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function normalizedToViewport(rect, viewportWidth, viewportHeight) {
        return {
            x: rect.x * viewportWidth,
            y: rect.y * viewportHeight,
            width: rect.width * viewportWidth,
            height: rect.height * viewportHeight,
        };
    }

    function viewportToNormalized(x, y, width, height, viewportWidth, viewportHeight) {
        if (!viewportWidth || !viewportHeight) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        return {
            x: clamp01(x / viewportWidth),
            y: clamp01(y / viewportHeight),
            width: clamp01(width / viewportWidth),
            height: clamp01(height / viewportHeight),
        };
    }

    global.PdfEditorCoords = {
        clamp01,
        normalizedToViewport,
        viewportToNormalized,
    };
})(typeof window !== 'undefined' ? window : global);
