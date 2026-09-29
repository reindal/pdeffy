use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RegionType {
    Title,
    Text,
    Table,
    Figure,
    ListItem,
    Caption,
    Footer,
    PageHeader,
    SectionHeader,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextStyleFlags {
    pub bold: bool,
    pub italic: bool,
    pub font_size_pt: Option<f32>,
    pub font_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBlock {
    pub text: String,
    pub bbox: (f32, f32, f32, f32),
    pub style: TextStyleFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutRegion {
    pub region_type: RegionType,
    pub bbox: (f32, f32, f32, f32),
    pub text_blocks: Vec<TextBlock>,
    pub table_cells: Option<Vec<Vec<String>>>,
    /// Raw image bytes (PNG/JPEG) when region is Figure and extraction succeeded.
    pub figure_image: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageModel {
    pub width: f32,
    pub height: f32,
    pub regions: Vec<LayoutRegion>,
    pub rendered_image: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentModel {
    pub pages: Vec<PageModel>,
}
