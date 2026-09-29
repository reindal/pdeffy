//! NER model pack metadata (ONNX + tokenizer assets).

/// Hugging Face repo with pre-exported ONNX (multilingual v2.1).
pub const NER_PACK_ID: &str = "gliner_multi-v2.1-onnx";

/// User-facing download size (matches settings copy: GLiNER · ~200 MB).
pub const NER_PACK_SIZE_LABEL: &str = "~200 MB";

/// Progress bar total (~200 MiB); ONNX + tokenizer assets are ~183–200 MB on disk.
pub const NER_PACK_EXPECTED_BYTES: u64 = 200 * 1024 * 1024;

/// One file in the on-disk NER pack.
#[derive(Debug, Clone, Copy)]
pub struct NerAsset {
    pub filename: &'static str,
    pub url: &'static str,
    /// Minimum size to treat download as complete.
    pub min_bytes: u64,
}

pub const NER_ONNX_FILE: &str = "model_quantized.onnx";

/// Files required under `<app_data>/models/ner/gliner_multi-v2.1-onnx/`.
pub const NER_ASSETS: &[NerAsset] = &[
    NerAsset {
        filename: NER_ONNX_FILE,
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/onnx/model_quantized.onnx",
        min_bytes: 100_000_000,
    },
    NerAsset {
        filename: "tokenizer.json",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/tokenizer.json",
        min_bytes: 100_000,
    },
    NerAsset {
        filename: "gliner_config.json",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/gliner_config.json",
        min_bytes: 100,
    },
    NerAsset {
        filename: "spm.model",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/spm.model",
        min_bytes: 100_000,
    },
    NerAsset {
        filename: "tokenizer_config.json",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/tokenizer_config.json",
        min_bytes: 50,
    },
    NerAsset {
        filename: "special_tokens_map.json",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/special_tokens_map.json",
        min_bytes: 50,
    },
    NerAsset {
        filename: "added_tokens.json",
        url: "https://huggingface.co/onnx-community/gliner_multi-v2.1/resolve/main/added_tokens.json",
        min_bytes: 10,
    },
];

pub fn pack_subdir() -> &'static str {
    NER_PACK_ID
}
