use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use zip::read::ZipArchive;

/// True when the DOCX package contains Word header or footer parts.
pub fn docx_has_header_or_footer(path: &Path) -> bool {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut archive = match ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(_) => return false,
    };

    for i in 0..archive.len() {
        let Ok(entry) = archive.by_index(i) else {
            continue;
        };
        let name = entry.name();
        if name.starts_with("word/header") && name.ends_with(".xml") {
            return true;
        }
        if name.starts_with("word/footer") && name.ends_with(".xml") {
            return true;
        }
    }
    false
}

fn part_has_graphics(data: &[u8]) -> bool {
    let hay = String::from_utf8_lossy(data).to_ascii_lowercase();
    hay.contains("wp:drawing")
        || hay.contains("w:drawing")
        || hay.contains("w:pict")
        || hay.contains("v:shape")
        || hay.contains("v:imagedata")
        || hay.contains("a:blip")
        || hay.contains("pic:pic")
}

/// Footer/header con immagini, linee o forme — il motore interno e spesso LibreOffice li perdono.
pub fn docx_has_graphical_header_footer(path: &Path) -> bool {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut archive = match ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(_) => return false,
    };

    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else {
            continue;
        };
        let name = entry.name();
        let is_hf = (name.starts_with("word/header") || name.starts_with("word/footer"))
            && name.ends_with(".xml");
        if !is_hf {
            continue;
        }
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_err() {
            continue;
        }
        if part_has_graphics(&buf) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn minimal_docx_with_footer(dir: &Path) {
        let path = dir.join("hf.docx");
        let file = File::create(&path).unwrap();
        let mut zip = ZipWriter::new(file);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

        zip.start_file("[Content_Types].xml", opts).unwrap();
        zip.write_all(b"<Types/>").unwrap();
        zip.start_file("word/footer1.xml", opts).unwrap();
        zip.write_all(b"<w:ftr/>").unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn detects_footer_part() {
        let dir = std::env::temp_dir().join(format!("pdeffy_hf_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        minimal_docx_with_footer(&dir);
        assert!(docx_has_header_or_footer(&dir.join("hf.docx")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
