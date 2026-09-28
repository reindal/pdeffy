/**
 * Digital signature presentation states (no PKCS validation in Pdeffy).
 */
(function (global) {
    /**
     * @typedef {'unknown'|'invalid'|'warning'|'checking'} SigUiKind
     */

    /** @param {import('./pdfDocumentExtras').SignatureEntry} sig */
    function singleSignatureUi(sig) {
        if (!sig) return { kind: 'unknown', labelKey: 'pdfEditorSigStateUnknown', fallback: 'Impossibile verificare la firma' };
        if (sig.intact === false) {
            return {
                kind: 'invalid',
                labelKey: 'pdfEditorSigStateInvalid',
                fallback: 'Integrità del documento compromessa (analisi ByteRange)',
            };
        }
        if (sig.intact === true) {
            return {
                kind: 'warning',
                labelKey: 'pdfEditorSigStateHeuristicOk',
                fallback: 'Firma rilevata · verifica certificato non disponibile',
            };
        }
        return {
            kind: 'unknown',
            labelKey: 'pdfEditorSigStateUnknown',
            fallback: 'Impossibile verificare la firma',
        };
    }

    /** @param {Array<any>} signatures */
    function aggregateSignatureUi(signatures) {
        if (!signatures?.length) return null;
        const per = signatures.map(singleSignatureUi);
        const invalid = per.filter((p) => p.kind === 'invalid').length;
        const warning = per.filter((p) => p.kind === 'warning').length;
        const unknown = per.filter((p) => p.kind === 'unknown').length;
        if (invalid > 0) {
            return {
                kind: 'invalid',
                labelKey: 'pdfEditorSigStateMultiInvalid',
                fallback: `${signatures.length} firme · ${invalid} con problemi di integrità`,
                counts: { total: signatures.length, invalid, warning, unknown },
            };
        }
        if (warning > 0 && unknown === 0) {
            return {
                kind: 'warning',
                labelKey: 'pdfEditorSigStateMultiHeuristic',
                fallback: `${signatures.length} firme rilevate · verifica certificato non disponibile`,
                counts: { total: signatures.length, invalid, warning, unknown },
            };
        }
        return {
            kind: 'unknown',
            labelKey: 'pdfEditorSigStateMultiUnknown',
            fallback: `${signatures.length} firme digitali · verifica non disponibile`,
            counts: { total: signatures.length, invalid, warning, unknown },
        };
    }

    global.PdfEditorSignatureStatus = {
        singleSignatureUi,
        aggregateSignatureUi,
    };
})(typeof window !== 'undefined' ? window : global);
