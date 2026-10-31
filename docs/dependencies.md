# Dependency provenance

Direct npm dependencies, resolved in package-lock.json. Versions and license
labels below were read from the installed package manifests.

| Dependency | Version | Purpose | Declared license | Source |
|---|---|---|---|---|
| @playwright/test | 1.64.1 | Development/build/test | Apache-2.0 | https://registry.npmjs.org/@playwright/test/1.64.1 |
| @types/node | 26.6.6 | Development/build/test | MIT | https://registry.npmjs.org/@types/node/26.6.6 |
| @types/react | 19.3.0 | Development/build/test | MIT | https://registry.npmjs.org/@types/react/19.3.0 |
| @types/react-dom | 19.3.0 | Development/build/test | MIT | https://registry.npmjs.org/@types/react-dom/19.3.0 |
| electron | 45.2.0 | Development/build/test | MIT | https://registry.npmjs.org/electron/45.2.0 |
| esbuild | 0.28.2 | Development/build/test | MIT | https://registry.npmjs.org/esbuild/0.28.2 |
| typescript | 7.0.2 | Development/build/test | Apache-2.0 | https://registry.npmjs.org/typescript/7.0.2 |
| vitest | 5.0.5 | Development/build/test | MIT | https://registry.npmjs.org/vitest/5.0.5 |
| react | 19.3.1 | Desktop renderer | MIT | https://registry.npmjs.org/react/19.3.1 |
| react-dom | 19.3.1 | Desktop renderer | MIT | https://registry.npmjs.org/react-dom/19.3.1 |

The ordinary SDK/library dependencies above are distinct from reference-app code.
No reference application, reference prompts or reference assets are imported.
Model weights are external local setup, not tracked repository files. The pinned
Electron development binary is downloaded through its
official package installer; generated app bundles and node_modules are ignored.

Latham's own distribution license and contribution terms remain a separate
review point in decisions.md. Before distributing installers or additional
models/assets, review their actual license/notices and distribution obligations;
this list records provenance and is not a legal compliance determination.

## Phase 1 external components

| Component | Tested version | Declared terms | Delivery |
|---|---|---|---|
| whisper.cpp Windows CPU | v1.8.2 | MIT | Explicit official runtime download |
| Whisper tiny.en GGML weights | Model SHA-256 in phase1.md | MIT model card | Explicit model download, 77.7 MB |
| Whisper base.en GGML weights | SHA-256 in phase2.md | MIT model card | Phase 2 recommended English model; explicit download, about 142 MiB |
| Ollama Windows | v0.40.13 | MIT | Explicit portable runtime/installation |
| Qwen2.5 1.5B Q4_K_M | `qwen2.5:1.5b` | Apache-2.0 | Explicit Ollama pull, about 986 MB |
| Google Gemini | `gemini-3.1-flash-lite` | Google API/account terms | User-key hosted service, not bundled weights |
| .NET Framework | Windows-provided compiler/runtime, tested 4.8 | Microsoft Windows/runtime terms | No runtime copied into the repository |
| Playwright Chromium | Bundled test browser revision 1248 | Chromium and bundled component notices | Development acceptance only |

Download sources, exact speech hashes, destinations and tested setup are in
[phase1.md](phase1.md). The optional runtime/model files live in ignored test
artifacts during evaluation and are not committed. The C# relay, desktop
supervisor/MTA worker, native fixture and extension are Latham's own code. Phase
3 uses the existing Windows .NET Framework 4.8 UIAutomationClient/Types and
WindowsBase assemblies; no new runtime/dependency download is required. The
WinForms fixture is excluded from portable packages. No reference repository
was forked or copied.

Phase 4 adds no package or model download. Its own `SpeechDetector.cs` uses the
Windows Framework 4.8 `System.Speech` assembly and an installed en-US desktop
recognizer (`MS-1033-80-DESK` on the test machine). Windows components remain
subject to Windows terms; they are not copied into the repository/package.
The compiled Latham helper is bundled; missing installed recognizers fail closed.
