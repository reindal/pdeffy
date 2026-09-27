# GLiNER NER (anonimizzazione — stage 2)

Stage 1 resta **regex / structured** (`anonymize/structured/`). Stage 2 è **GLiNER**
via **ONNX Runtime** (`ort`), indipendente dal GGUF Qwen usato per `summarize_pdf`.

## Quale modello usare (IT / multilingua)

| Opzione | Modello | Pro | Contro |
|--------|---------|-----|--------|
| **Consigliato (prod)** | [`onnx-community/gliner_multi-v2.1`](https://huggingface.co/onnx-community/gliner_multi-v2.1) | Multilingua (incl. **IT**), Apache 2.0, ONNX + tokenizer già su HF (~183 MB `model_quantized.onnx`) | Pack transformers.js: va verificato I/O vs export ufficiale GLiNER; RAM ~400–700 MB in inferenza |
| Alternativa leggera EN-centrica | [`onnx-community/gliner_small-v2.1`](https://huggingface.co/onnx-community/gliner_small-v2.1) | Più piccolo, stesso layout HF | Nomi/org italiani meno affidabili |
| Massima qualità IT (export manuale) | [`urchade/gliner_multi-v2.1`](https://huggingface.co/urchade/gliner_multi-v2.1) PyTorch → ONNX | Stesso training ufficiale, script `convert_to_onnx.py` + INT8 | Devi hostare tu il `.onnx` (o farlo scaricare una volta dall’app dopo export CI) |

**Export PyTorch → ONNX (ufficiale GLiNER):**

```bash
pip install 'gliner[onnx]'
python convert_to_onnx.py \
  --model_path urchade/gliner_multi-v2.1 \
  --save_path ./gliner_multi_onnx \
  --quantize
```

Output tipico: `model.onnx`, `model_quantized.onnx`, tokenizer e `gliner_config.json`.
Pro: grafo allineato a `gliner/onnx/model.py` (`TokenORTModel` / `SpanORTModel`).
Contro: passo build/CI, file ~600 MB (fp32) o ~180 MB (quantized).

L’app usa per default il pack **`gliner_multi-v2.1`** da `onnx-community` (vedi
`src-tauri/src/ai/anonymize/ner/config.rs`).

## Label zero-shot (runtime)

In `ner/engine.rs`, `DEFAULT_LABELS`:

- `person` → placeholder `NOME`
- `organization` → `ORGANIZZAZIONE`
- `address` → `INDIRIZZO`

Aggiungere categorie = estendere quell’array + mapping in `label_to_entity_type`.

## Pipeline (invariata per stage 1 / merge)

```text
PDF → pdf_text (+ OCR se serve) → testo normalizzato
  → stage1: structured recognizers (priority 0)
  → stage2: NerEngine::find (priority 10)
  → merge_spans (stage1 vince su overlap)
  → apply_placeholders
```

`structured.rs` **non** va modificato: il merge è già in `merge.rs`.

## RAM e ciclo di vita

- **Qwen / llama.cpp**: `AiState.engine` — load/unload con `unload-model`.
- **GLiNER**: `NerEngine` + sessione ONNX in cache processo — `unload-ner-model`
  libera la sessione; il GGUF resta untouched.

## Inferenza ONNX in Rust

GLiNER non è NER classico a 3 classi fisse: costruisce un prompt
`<<ENT>>label<<SEP>>` + token del testo e produce logits per span/token
(vedi `gliner/data_processing/processor.py`).

Il modulo `gliner_onnx.rs` carica la sessione `ort` e applica chunking +
ricostruzione span; il **decoder logits → span** va mantenuto allineato al pack
scaricato (test golden con frasi IT consigliati).

Fino a decoder completo, con pack assente o inferenza non pronta, stage 2 può
restituire zero span: stage 1 continua a funzionare.
