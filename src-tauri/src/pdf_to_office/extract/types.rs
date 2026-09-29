use crate::pdf_to_office::model::TextBlock;

#[derive(Debug, Clone)]
pub struct ExtractedPage {
    pub width: f32,
    pub height: f32,
    pub text_blocks: Vec<TextBlock>,
    pub rendered_image: Option<Vec<u8>>,
}
