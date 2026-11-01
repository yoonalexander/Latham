# Chrome extension

Phase 2 MV3 worker and popup. `background.js` owns native messaging,
optional-host grants, remembered consent, Chrome commands and scoped page RPC.
`popup.js` requests exact site patterns only from user gestures. No persistent
content script is installed. `src/page.ts` is injected into the root document's
isolated world only for explicit active requests on reviewed Google/YouTube
profiles. It binds live controls, executes locally permitted effects and verifies
readback; page text never grants action authority.

Run the root build and load `dist/chrome-extension` unpacked. Register the native
host in the desktop app and connect from the popup. See
[setup and protocol](../../docs/phase2.md). Desktop/extension 0.5.0 and relay
protocol 2 must agree; Chrome 120 is the API minimum, not a full tested-version
matrix. The manifest contains a development
public key for stable identity, not a signing secret. Web Store packaging and
the production identity need release review before distribution.
