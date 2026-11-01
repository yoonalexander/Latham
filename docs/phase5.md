# Visual thumbnail matching — Phase 5

Phase 5 resolves visual references within reviewed YouTube video results. It
adds explicit image-capture consent, local Windows OCR/layout matching,
optional Ollama/Gemini visual matching, target outlines and explicit navigation.
It does not enable desktop screenshots, arbitrary-site vision or coordinate
clicking. Existing text/DOM commands remain the first route for labeled controls.

## Setup and use

Build as in [Chrome setup](phase2.md), or extract the unsigned
`Latham-0.8.0-win-x64-preview.zip`. Register this build's Chrome host and load
extension **0.8.0**; the native relay remains protocol 2. The package includes
`Latham.ImageOcr.exe`, using installed Windows OCR components through Framework
4.8. No SDK, OCR runtime or visual model is downloaded automatically. The tested
Windows 11 machine has the en-US OCR language available.

1. Approve YouTube in the extension and start a Chrome session in Latham.
2. In the extension, choose **Allow YouTube thumbnail images**. Chrome requests
   the separate optional `https://i.ytimg.com/*` image grant. It does not grant
   access to another page or enable capture by itself. **Revoke thumbnail images**
   removes that grant; permission removal pauses the connected session.
3. Open a supported YouTube results/home/watch page with reviewed video cards
   and fully visible thumbnails. Current profiles use `ytd-video-renderer` and
   `ytd-rich-item-renderer`; other layouts can be unsupported. Unknown overlays,
   hidden/clipped/filtered images and unsupported sources are omitted.
4. Under **Find a video by its thumbnail**, enable **Allow thumbnail capture for
   this session**. Activation does not persist across Stop, reconnect or restart.
5. Choose a route explicitly:
   - **Local OCR and layout:** Windows OCR recognizes printed English text.
     Examples: `text PIANO`, `thumbnail with VIOLIN`, `topmost thumbnail`.
     A tied row/column asks for clarification. This route does not recognize faces
     or icons and does not contact an AI service.
   - **Installed Ollama vision model:** enter an already installed vision-capable
     model. Only loopback `127.0.0.1:11434` is used. Remote/cloud metadata,
     missing vision capability and unavailable models block. Models are not
     pulled or silently substituted. An actual installed vision model was not
     available for live acceptance; protocol behavior is fixture-tested.
   - **Gemini:** uses your DPAPI-protected key and explicitly sends only captured
     thumbnails, OCR and bounded labels to Google. Your separate speech-provider
     choice does not automatically enable this visual route.
6. Enter the description and choose **Capture and find thumbnail**. Latham
   captures at most four candidates and displays their exact captured assets.
   A unique match receives a blue outline in Chrome. Multiple matches are listed
   for clarification; absent/uncertain matches produce no proposal.
7. Review the previews and outline. Use **Highlight candidate N** to choose an
   alternative explicitly, then **Open highlighted video**. Only reviewed video
   navigation is available; a provider cannot authorize a different effect.
8. **Stop and clear visual capture**, the global Stop button, tray Pause/Stop,
   or Ctrl+Alt+. cancel pending work and clear consent/previews. Resolve any
   uncertain navigation before starting again.

## Capture and privacy boundary

This is **source-isolated thumbnail capture**, not a cropped full-screen
screenshot. The extension first gates the current top-level origin, active
session and grants. It binds known video links to their matching public JPEG
asset on `i.ytimg.com/vi/VIDEO_ID/`. Credentials and redirects are excluded.
Other image origins, arbitrary URLs, frames, canvases, video frames and desktop
surfaces cannot enter this adapter.
CDN query parameters are omitted from the asset fetch; the original displayed
source is still checked for changes before opening. WebP/animated sources remain
unsupported by this initial profile.

The extension decodes each permitted asset into an isolated OffscreenCanvas,
normalizes it to 192×108 JPEG and discards metadata. Output is capped at 8 KiB
per image and four images per capture. No frame, password field, page overlay
or surrounding desktop pixel is an input to that canvas. Image bodies and
dimensions are bounded; assets with an unprovable source/target relationship
are omitted, and a surface without safe candidates is blocked. This avoids
capturing denied pixels first and trying to redact them afterward.

These assets are separate from the page's composited pixels: badges, page
filters and surrounding UI are not photographed. A server can update an asset
at the same URL. Review the exact preview rather than assuming it reproduces
every pixel currently shown on the website. No general screen-capture guarantee
or fallback is implied.

Local OCR runs in a disposable child with bounded stdin/stdout and a five-second
deadline. Recognition has a 25-second overall deadline. Captured images/OCR and
query text remain in transient memory; default diagnostics contain none of them.
No screenshot files or visual history are written by the product. Test artifacts
explicitly contain only generated synthetic fixtures and are ignored by Git.

## Grounding, clarification and cancellation

Each capture binds the Chrome window/tab/document, isolated document token,
connection epoch, captured DOM element/revision, video URL, image source and
geometry. Scroll position, viewport size/scale, mutations, replaced controls,
image changes, visibility and occlusion are checked again before highlighting
and opening. CSS geometry describes the proposal; it never authorizes an OS
coordinate click. A page, zoom, overlay or document change requires recapture.

Providers return a bounded list of known candidate IDs. Zero matches abstain;
multiple matches require explicit clarification. Duplicate/invented IDs and
extra action fields fail validation. Even a wrong model classification remains
a proposal: navigation needs a separate user action and a fresh DOM/effect check.
This does not make model recognition infallible.

The page-side capture expires after 60 seconds; the main proposal expires 30
seconds after recognition. Stop/revocation invalidates generations and the
executor fence clears outlines. Late OCR/model replies cannot restore previews
or open videos. Manual app actions and hands-free capture are separated from
in-flight visual work. Visual navigation uses the existing durable uncertainty
and verified read-query navigation path. Stop cannot undo a navigation already
issued; unknown results still require inspection, with no automatic retry.

## Evidence and limits

```powershell
npm run check
npm run test:visual
node scripts/evaluate-visual.mjs
node scripts/evaluate-visual.mjs --cloud
npm run package:preview
node scripts/check-preview.mjs
```

The visual evaluation consumes the synthetic capture report generated by the
integration test. It compares expected unique matches, clarification sets and
abstentions, with separate cloud and local results. Cloud tests use public
generated images and the authorized development key; no website/private pixels
are uploaded. [Evaluation](evaluation.md) records actual counts, earlier cloud
failures, ambiguity correction, package checks and remaining limits.

The controlled dataset is four text/color/shape thumbnails in a 2×2 layout.
It does not establish real-photo/person matching, broad website compatibility,
local vision-model accuracy, physical multi-monitor capture or arbitrary icon
automation. The new optional image permission's native prompt/revoke UX has not
been manually accepted; isolated fixtures use explicit install-time grants for
positive cases and a genuinely missing optional grant for denial cases. The
existing native foreground-focus limitation remains separate from this Chrome
adapter. [Phase 6](phase6.md) expands the read-query catalog; visual capture remains limited to the reviewed YouTube thumbnail profile.

Platform references: [Chrome cross-origin requests and host grants](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[Windows OCR](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine),
[Ollama vision inputs](https://docs.ollama.com/capabilities/vision).
