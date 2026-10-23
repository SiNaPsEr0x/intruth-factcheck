# Attribution

InTruth was created by **Risha Panigrahi**.

- Original repository: https://github.com/rpanigrahi222/intruth-factcheck
- Repository adapted here: https://github.com/SiNaPsEr0x/intruth-factcheck
- This derivative adds Codex CLI integration and the changes described in
  docs/MIGRATION.md. The original custom, noncommercial license remains in
  LICENSE. No license conversion is implied by this adaptation.

The vendored Transformers.js bundle is version 4.3.1, rebuilt against stable ONNX Runtime Web 1.30.0.
Build details and pinned sources: docs/SOFTWARE.md.
Transformers.js is an Apache-2.0 project:
https://github.com/huggingface/transformers.js/blob/main/LICENSE

The ONNX Runtime Web JavaScript/WASM assets are the matching stable 1.30.0 JSEP pair, replacing the input
repository’s older asyncify assets. ONNX Runtime is an MIT-licensed project:
https://github.com/microsoft/onnxruntime/blob/main/LICENSE

Whisper and optional MarianMT model weights are downloaded separately from
their respective Hugging Face repositories; consult those model cards for
their licenses. They are not bundled into the extension archives.
