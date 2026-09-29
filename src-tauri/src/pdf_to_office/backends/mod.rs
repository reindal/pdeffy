mod libreoffice;
mod pdfium_layout;

pub use libreoffice::LibreOfficePdfBackend;
pub use pdfium_layout::PdfiumLayoutBackend;

use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::exporters::ExportOutput;
use crate::pdf_to_office::format::PdfExportFormat;
use std::path::Path;

pub trait PdfToOfficeConverter: Send + Sync {
    fn name(&self) -> &'static str;
    fn is_available(&self) -> bool;
    fn supports_format(&self, format: PdfExportFormat) -> bool;
    fn convert(
        &self,
        input_path: &Path,
        format: PdfExportFormat,
        image_dpi: u32,
        ghostscript: Option<&Path>,
    ) -> Result<ExportOutput, PdfExportError>;
}

pub fn default_layout_backend() -> PdfiumLayoutBackend {
    PdfiumLayoutBackend
}

pub fn libreoffice_backend() -> LibreOfficePdfBackend {
    LibreOfficePdfBackend
}
