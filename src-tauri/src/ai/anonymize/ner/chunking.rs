//! Split long documents for GLiNER context limits; map chunk-local spans → global UTF-8 offsets.

/// ~384 subword tokens ≈ this many chars for Latin scripts (conservative).
pub const CHUNK_CHAR_LIMIT: usize = 2_800;
pub const CHUNK_OVERLAP: usize = 240;

/// A slice of the original string with **byte** offsets `[start, end)` into the full document.
#[derive(Debug, Clone, Copy)]
pub struct TextChunk<'a> {
    pub start: usize,
    pub end: usize,
    pub text: &'a str,
}

/// Split `text` on char boundaries into overlapping chunks.
pub fn chunk_text(text: &str) -> Vec<TextChunk<'_>> {
    if text.is_empty() {
        return Vec::new();
    }
    if text.len() <= CHUNK_CHAR_LIMIT {
        return vec![TextChunk {
            start: 0,
            end: text.len(),
            text,
        }];
    }

    let mut out = Vec::new();
    let mut chunk_start = 0usize;

    while chunk_start < text.len() {
        let mut chunk_end = (chunk_start + CHUNK_CHAR_LIMIT).min(text.len());
        if chunk_end < text.len() {
            chunk_end = floor_char_boundary(text, chunk_end);
        }
        if chunk_end <= chunk_start {
            chunk_end = next_char_boundary(text, chunk_start);
        }
        let slice = &text[chunk_start..chunk_end];
        out.push(TextChunk {
            start: chunk_start,
            end: chunk_end,
            text: slice,
        });
        if chunk_end >= text.len() {
            break;
        }
        let next_start = chunk_end.saturating_sub(CHUNK_OVERLAP);
        chunk_start = if next_start <= chunk_start {
            chunk_end
        } else {
            ceil_char_boundary(text, next_start)
        };
    }

    out
}

/// Raw detection inside a chunk (local byte offsets relative to chunk text).
#[derive(Debug, Clone)]
pub struct ChunkEntity {
    pub local_start: usize,
    pub local_end: usize,
    pub label: String,
    pub score: f32,
}

/// Convert chunk-local spans to document-global offsets.
pub fn globalize_chunk_entities(chunk: TextChunk<'_>, local: Vec<ChunkEntity>) -> Vec<GlobalEntity> {
    local
        .into_iter()
        .filter_map(|e| {
            if e.local_end <= e.local_start {
                return None;
            }
            let start = chunk.start.checked_add(e.local_start)?;
            let end = chunk.start.checked_add(e.local_end)?;
            Some(GlobalEntity {
                start,
                end,
                label: e.label,
                score: e.score,
            })
        })
        .collect()
}

#[derive(Debug, Clone)]
pub struct GlobalEntity {
    pub start: usize,
    pub end: usize,
    pub label: String,
    pub score: f32,
}

/// Merge duplicate/overlapping entities from overlapping chunks (keep higher score).
pub fn dedupe_global_entities(mut entities: Vec<GlobalEntity>) -> Vec<GlobalEntity> {
    entities.sort_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| b.end.cmp(&a.end))
    });

    let mut kept: Vec<GlobalEntity> = Vec::new();
    for ent in entities {
        if ent.start >= ent.end {
            continue;
        }
        if let Some(last) = kept.last_mut() {
            if ent.start < last.end {
                // overlap — prefer higher score span
                if ent.score > last.score {
                    *last = ent;
                }
                continue;
            }
        }
        kept.push(ent);
    }
    kept
}

fn floor_char_boundary(text: &str, index: usize) -> usize {
    let mut i = index.min(text.len());
    while i > 0 && !text.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn ceil_char_boundary(text: &str, index: usize) -> usize {
    let mut i = index.min(text.len());
    while i < text.len() && !text.is_char_boundary(i) {
        i += 1;
    }
    i
}

fn next_char_boundary(text: &str, index: usize) -> usize {
    let mut i = (index + 1).min(text.len());
    while i < text.len() && !text.is_char_boundary(i) {
        i += 1;
    }
    i.max(index + 1).min(text.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_chunk_short_text() {
        let chunks = chunk_text("Ciao mondo");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].start, 0);
    }

    #[test]
    fn overlap_dedupe_prefers_higher_score() {
        let a = GlobalEntity {
            start: 10,
            end: 20,
            label: "person".into(),
            score: 0.9,
        };
        let b = GlobalEntity {
            start: 12,
            end: 18,
            label: "person".into(),
            score: 0.5,
        };
        let d = dedupe_global_entities(vec![b, a]);
        assert_eq!(d.len(), 1);
        assert!((d[0].score - 0.9).abs() < f32::EPSILON);
    }
}
