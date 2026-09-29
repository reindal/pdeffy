use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
}

impl ImageFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfExportFormat {
    Docx,
    Xlsx,
    Pptx,
    Txt,
    Markdown,
    Image(ImageFormat),
}

impl PdfExportFormat {
    pub fn from_convert_param(format: &str) -> Option<Self> {
        let f = format.trim().to_ascii_lowercase();
        match f.as_str() {
            "docx" => Some(Self::Docx),
            "xlsx" => Some(Self::Xlsx),
            "pptx" => Some(Self::Pptx),
            "txt" | "text" => Some(Self::Txt),
            "md" | "markdown" => Some(Self::Markdown),
            "png" => Some(Self::Image(ImageFormat::Png)),
            "jpg" | "jpeg" => Some(Self::Image(ImageFormat::Jpeg)),
            "zip" => None,
            _ => None,
        }
    }
}

impl FromStr for PdfExportFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_convert_param(s).ok_or_else(|| format!("Unsupported export format: {s}"))
    }
}
