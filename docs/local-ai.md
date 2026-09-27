# Local AI layer (on-device)

Pdeffy can run a small instruct model **entirely on the user’s machine** via
[llama.cpp](https://github.com/ggml-org/llama.cpp) Rust bindings (`llama-cpp-2`).
No inference traffic leaves the device. The GGUF weights are **not** shipped in
the app bundle; they are downloaded on first use into the app data directory.

## Layout

```
src-tauri/src/ai/
  config.rs          # model id, URL, context sizes
  download.rs        # GGUF download + ai-progress events
  engine/            # load / unload / generate (shared)
  functions/         # summarize, anonymize (stub), …
  pdf_text.rs        # pdf-extract + normalize
  progress.rs        # event payloads
commands/ai.rs       # Tauri commands
```

Adding a new AI capability (e.g. classify) = new file under `functions/` + one
command in `commands/ai.rs`. Do **not** change `engine/` for prompt-only features.

## Cargo features

| Feature | Meaning |
|---------|---------|
| `ai` (default) | Enable local AI modules + `llama-cpp-2` + `reqwest` |
| `ai-metal` (default on macOS builds) | GPU offload via Metal |
| `ai-cuda` / `ai-vulkan` | Optional GPU backends |

Build without AI (faster CI / no C++ toolchain):

```bash
cd src-tauri && cargo check --no-default-features
```

macOS release (default):

```bash
cargo build --release
# implies --features ai,ai-metal
```

Requirements: working C/C++ toolchain and `clang` (bindgen). On macOS, Xcode
CLTs are enough for Metal.

## OCR (RapidOCR)

Scanned PDFs (no text layer) use **RapidOCR** (`ppocrv6-tiny` ONNX via
[`rapidocr-core`](https://crates.io/crates/rapidocr-core)):

1. Download the pack from **Settings → RapidOCR** (~15–25 MB).
2. On summarize, if `pdf-extract` returns empty text, pages are rasterized with
   **Ghostscript** (150 DPI, up to 8 pages) and OCR’d locally.
3. Models live under `<app_data_dir>/ocr/ppocrv6-tiny/`.

| Command | Role |
|---------|------|
| `get-ocr-status` | pack downloaded / size |
| `download-ocr-models` | fetch ONNX det+rec+dict |
| `get-ner-status` | GLiNER NER pack for anonymization |
| `download-ner-models` | fetch GLiNER ONNX + tokenizer |
| `unload-ner-model` | free GLiNER session RAM (Qwen unchanged) |

See [gliner-ner.md](./gliner-ner.md) for model choice and pipeline.

Ghostscript must be installed for the rasterize step.

Supported GGUF models live in [`src-tauri/src/ai/config.rs`](../src-tauri/src/ai/config.rs) (`MODELS`).
The user picks one in **Settings → Local AI model**. Selection is stored in
`<app_data_dir>/ai-settings.json`. Weights download into `<app_data_dir>/models/`.

| Id | Role | Approx size |
|----|------|-------------|
| `qwen2.5-1.5b-instruct-Q4_K_M` | Fast / light | ~1.1 GB |
| `phi-4-mini-instruct-Q4_K_M` | Default / recommended | ~2.5 GB |
| `llama-3.2-3b-instruct-Q4_K_M` | Quality alternative | ~2.0 GB |

## Tauri commands

| Command | Role |
|---------|------|
| `list-ai-models` | catalog + downloaded/selected flags + specs |
| `set-selected-model` | persist selection (unloads RAM if file changes) |
| `get-model-status` | status of the selected model |
| `download-model` | fetch selected (or given) GGUF; emits `ai-progress` |
| `unload-model` | free RAM |
| `summarize-pdf` | extract text → summarize with selected model |
| `anonymize-pdf` | stub (`NotImplemented`) |

Listen for progress:

```js
import { listen } from '@tauri-apps/api/event'
await listen('ai-progress', (e) => console.log(e.payload))
```

Phases: `download`, `loading`, `generating`, `ready`, `unloaded`, `error`.

## Errors (propagated as strings)

- Model not downloaded
- PDF unreadable / no extractable text (scanned PDFs → OCR later)
- Load / OOM / inference failures

## Note on privacy

Download of the GGUF uses HTTPS to Hugging Face (one-time weight fetch). After
that, all PDF text and generation stay local. Inference never calls a cloud LLM API.
