use crate::ai::engine::ModelEngine;
use crate::ai::error::AiError;
use crate::ai::functions::AiFunction;
use crate::ai::pdf_text;
use crate::commands::settings;
use tauri::AppHandle;

pub struct Summarize;

fn output_language_name(app: &AppHandle) -> &'static str {
    let code = settings::get_language(app.clone()).unwrap_or_else(|_| "en".into());
    match code.to_lowercase().as_str() {
        "it" => "Italian",
        "pl" => "Polish",
        "es" => "Spanish",
        _ => "English",
    }
}

impl AiFunction for Summarize {
    fn id(&self) -> &'static str {
        "summarize"
    }

    fn run(
        &self,
        text: &str,
        engine: &ModelEngine,
        app: &AppHandle,
    ) -> Result<String, AiError> {
        let (body, truncated) = pdf_text::truncate_for_prompt(text);
        let trunc_note = if truncated {
            "\n(Note: the source was truncated to fit the context window.)\n"
        } else {
            ""
        };

        let lang = output_language_name(app);

        // Instruct models to answer in the app UI language (not the document language).
        let prompt = format!(
            "<|system|>\nYou are a helpful assistant that summarizes documents clearly and accurately. \
Write the entire summary in {lang} only, regardless of the source document language. \
Produce a concise summary with the key points. Do not invent facts. Do not add a language label.\n<|end|>\n\
             <|user|>\nSummarize the following document in {lang}:{trunc_note}\n\n{body}\n<|end|>\n\
             <|assistant|>\n"
        );

        engine.generate(&prompt, app, None)
    }
}
