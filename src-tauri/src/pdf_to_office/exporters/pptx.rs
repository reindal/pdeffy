use super::ExportOutput;
use crate::pdf_to_office::error::PdfExportError;
use crate::pdf_to_office::layout::region_plain_text;
use crate::pdf_to_office::model::{DocumentModel, RegionType};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub fn export_pptx(model: &DocumentModel) -> Result<ExportOutput, PdfExportError> {
    let slide_count = model.pages.len().max(1);
    let (slide_w, slide_h) = slide_size_from_page(model.pages.first());

    let mut zip_buf = Cursor::new(Vec::new());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    {
        let mut writer = ZipWriter::new(&mut zip_buf);
        write_str(&mut writer, "[Content_Types].xml", &content_types(slide_count), options)?;
        write_str(
            &mut writer,
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>"#,
            options,
        )?;
        write_str(
            &mut writer,
            "ppt/presentation.xml",
            &presentation_xml(slide_count, slide_w, slide_h),
            options,
        )?;
        write_str(
            &mut writer,
            "ppt/_rels/presentation.xml.rels",
            &presentation_rels(slide_count),
            options,
        )?;

        for (idx, page) in model.pages.iter().enumerate() {
            let n = idx + 1;
            write_str(
                &mut writer,
                &format!("ppt/slides/slide{n}.xml"),
                &slide_xml(page, slide_w, slide_h),
                options,
            )?;
            write_str(
                &mut writer,
                &format!("ppt/slides/_rels/slide{n}.xml.rels"),
                r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"#,
                options,
            )?;
        }
        writer.finish().map_err(|e| PdfExportError::Export(e.to_string()))?;
    }

    Ok(ExportOutput {
        bytes: zip_buf.into_inner(),
        file_extension: "pptx".into(),
    })
}

fn slide_size_from_page(page: Option<&crate::pdf_to_office::model::PageModel>) -> (i32, i32) {
    let Some(p) = page else {
        return (9144000, 5143500);
    };
    let ratio = p.width / p.height.max(1.0);
    if ratio > 1.4 {
        (9144000, 5143500)
    } else {
        (9144000, 6858000)
    }
}

fn presentation_xml(slides: usize, w: i32, h: i32) -> String {
    let mut sld_ids = String::new();
    for i in 1..=slides {
        sld_ids.push_str(&format!(
            r#"<p:sldId id="{id}" r:id="rId{id}"/>"#,
            id = 255 + i
        ));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>{sld_ids}</p:sldIdLst>
  <p:sldSz cx="{w}" cy="{h}"/>
</p:presentation>"#
    )
}

fn presentation_rels(slides: usize) -> String {
    let mut rels = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
    );
    for i in 1..=slides {
        rels.push_str(&format!(
            r#"<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>"#,
            rid = 255 + i,
            i = i
        ));
    }
    rels.push_str("</Relationships>");
    rels
}

fn content_types(slides: usize) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>"#,
    );
    for i in 1..=slides {
        xml.push_str(&format!(
            r#"<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>"#
        ));
    }
    xml.push_str("</Types>");
    xml
}

fn slide_xml(page: &crate::pdf_to_office::model::PageModel, slide_w: i32, slide_h: i32) -> String {
    let scale_x = slide_w as f32 / page.width.max(1.0);
    let scale_y = slide_h as f32 / page.height.max(1.0);
    let mut shapes = String::new();

    for region in &page.regions {
        let (x, y, x2, y2) = region.bbox;
        let left = (x * scale_x) as i32;
        let top = (slide_h as f32 - y2 * scale_y) as i32;
        let width = ((x2 - x).max(1.0) * scale_x) as i32;
        let height = ((y2 - y).max(1.0) * scale_y) as i32;
        let text = xml_escape(&region_plain_text(region));
        let is_title = matches!(region.region_type, RegionType::Title | RegionType::SectionHeader);
        let sz = if is_title { 3200 } else { 1800 };

        shapes.push_str(&format!(
            r#"<p:sp><p:nvSpPr><p:cNvPr id="1" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{left}" y="{top}"/><a:ext cx="{width}" cy="{height}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>
<a:p><a:r><a:rPr sz="{sz}" b="{bold}"/><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp>"#,
            bold = if is_title { "1" } else { "0" }
        ));
    }

    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
  <p:grpSpPr/>{shapes}</p:spTree></p:cSld></p:sld>"#
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn write_str(
    writer: &mut ZipWriter<&mut Cursor<Vec<u8>>>,
    name: &str,
    content: &str,
    options: SimpleFileOptions,
) -> Result<(), PdfExportError> {
    writer
        .start_file(name, options)
        .map_err(|e| PdfExportError::Export(e.to_string()))?;
    writer
        .write_all(content.as_bytes())
        .map_err(|e| PdfExportError::Export(e.to_string()))?;
    Ok(())
}
