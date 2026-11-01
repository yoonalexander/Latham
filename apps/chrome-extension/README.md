# Chrome extension

MV3 worker and popup, expanded through the Windows Phase 9 milestone. `background.js` owns native messaging,
optional-host grants, remembered consent, Chrome commands and scoped page RPC.
`popup.js` requests exact site patterns only from user gestures. No persistent
content script is installed. `src/page.ts` is injected into the root document's
isolated world only for explicit active requests on the [reviewed catalog](../../docs/phase6.md).
The shared catalog compiles from packages/contracts/src/sites.ts into catalog.js.
New-site fields are focus-only; frames require an explicit same-origin inspection.
The page agent binds live controls, executes locally permitted effects and verifies
readback; page text never grants action authority. `workflow.js` adds an expiring,
single-use tab/document lease and independently bounded read-query tools; see
[workflow scope and recovery](../../docs/phase7.md).

Run the root build and load `dist/chrome-extension` unpacked. Register the native
host in the desktop app and connect from the popup. See
[setup and protocol](../../docs/phase2.md). Desktop/extension 0.9.0 and relay
protocol 3 must agree; Chrome 120 is the API minimum, not a full tested-version
matrix. The manifest contains a development
public key for stable identity, not a signing secret. Web Store packaging and
the production identity need release review before distribution.

[Phase 9](../../docs/phase9.md) adds explicit Windows Edge selection, separate
host/consent and browser-family checks. Use the extension in one selected
browser/profile at a time; switching never transfers approval or starts work.
