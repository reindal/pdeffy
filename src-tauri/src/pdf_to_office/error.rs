use thiserror::Error;

#[derive(Debug, Error)]
pub enum PdfExportError {
    #[error("Format {format} is not supported by backend {backend}")]
    UnsupportedFormat { backend: &'static str, format: String },

    #[error("Layout pipeline failed: {0}")]
    Pipeline(String),

    #[error("Export failed: {0}")]
    Export(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

impl PdfExportError {
    pub fn user_message(&self) -> String {
        self.to_string()
    }
}
