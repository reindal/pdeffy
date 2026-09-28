fn main() {
    #[cfg(target_os = "macos")]
    if std::env::var("MACOSX_DEPLOYMENT_TARGET").is_err() {
        // Match CI: ggml/llama.cpp need C++17 filesystem (unavailable below macOS 10.15).
        std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "11.0");
    }

    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=ApplicationServices");

    tauri_build::build()
}
