# Dependency provenance

Phase 0 direct dependencies, resolved in package-lock.json. Versions and license
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
No reference application, model weights, reference prompts or reference assets
are imported. The pinned Electron development binary is downloaded through its
official package installer; generated app bundles and node_modules are ignored.

Latham's own distribution license and contribution terms remain a separate
review point in decisions.md. Before distributing installers or additional
models/assets, review their actual license/notices and distribution obligations;
this list records provenance and is not a legal compliance determination.
