# Chrome extension

Phase 1 MV3 worker and popup. `background.js` owns native messaging,
optional-host grants, remembered consent and deterministic Chrome commands.
`popup.js` requests exact site patterns only from user gestures. No content
script or page observation is installed; the old `src` directories remain
reserved for Phase 2's scoped DOM adapter.

Run the root build and load `dist/chrome-extension` unpacked. Register the native
host in the desktop app and connect from the popup. See
[setup and protocol](../../docs/phase1.md). The manifest contains a development
public key for stable identity, not a signing secret. Web Store packaging and
the production identity need release review before distribution.
