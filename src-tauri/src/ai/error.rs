use thiserror::Error;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("{0}")]
    Message(String),

    #[error("Model is not downloaded yet. Call download_model first.")]
    ModelNotDownloaded,

    #[error("Model file is missing or incomplete.")]
    ModelMissing,

    #[error("Failed to load model into memory: {0}")]
    ModelLoad(String),

    #[error("Insufficient memory to load or run the model: {0}")]
    OutOfMemory(String),

    #[error("PDF could not be parsed or has no extractable text: {0}")]
    PdfUnreadable(String),

    #[error("No extractable text in this PDF (scanned/image-only). OCR is not available yet.")]
    PdfNoText,

    #[error("Download failed: {0}")]
    Download(String),

    #[error("Inference failed: {0}")]
    Inference(String),

    #[error("OCR failed: {0}")]
    Ocr(String),

    #[error("OCR pack is not downloaded yet. Open Settings and download RapidOCR.")]
    OcrNotDownloaded,

    #[error("NER model pack is not downloaded yet. Open Settings and download GLiNER.")]
    NerNotDownloaded,

    #[error("AI engine is busy.")]
    Busy,
}

impl AiError {
    pub fn to_frontend(self) -> String {
        match &self {
            Self::ModelNotDownloaded => {
                "Model not downloaded yet. Open Settings → Local AI model and download it."
                    .into()
            }
            Self::ModelMissing => "Model file is missing or incomplete. Download it again from Settings.".into(),
            Self::PdfNoText => {
                "This PDF has no extractable text (it may be scanned). OCR is not available yet."
                    .into()
            }
            Self::OcrNotDownloaded => {
                "OCR pack not downloaded. Open Settings → RapidOCR and download it for scanned PDFs."
                    .into()
            }
            Self::NerNotDownloaded => {
                "NER model not downloaded. Open Settings and download the GLiNER pack for anonymization."
                    .into()
            }
            Self::Busy => "The AI engine is busy. Wait a moment and try again.".into(),
            _ => self.to_string(),
        }
    }
}

impl From<String> for AiError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

impl From<&str> for AiError {
    fn from(value: &str) -> Self {
        Self::Message(value.to_string())
    }
}
