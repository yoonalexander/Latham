# Website coverage — Phase 6

Phase 6 expands the compiled catalog to eight origins. Chrome on Windows remains
the original supported browser. [Phase 9](phase9.md) adds explicit Windows Edge
preview support with its own evidence and limits. See [evaluation](evaluation.md)
for fixture versus live results and restrictions. [Phase 7](phase7.md) adds bounded read-query workflows.

## Setup and commands

Build/register the current desktop host and load extension **0.9.0**, protocol 3.
Use [Chrome setup](phase2.md) for installation, key/local speech configuration and
recovery. Each origin requires its own optional Chrome grant **and** Latham
consent through the extension popup. Existing approvals remain remembered;
new entries start unapproved. Start a session explicitly. No all-sites grant,
persistent content script, background scan, new model or new dependency is added.

After opening an approved catalog site, run `inspect page`, `search piano`,
`scroll down`, then `open first result` if a reviewed result is visible. Result
ordinals refer to the **current visible, supported results**, not every result
on the page. Inspect again after layout changes. A quoted label is unnecessary:
`focus Search Wikipedia` focuses that exact observed label. Multiple matches
require clarification; missing/unsupported controls abstain.

| Origin | Reviewed read-query recipe | Result navigation | Editing / filters |
|---|---|---|---|
| www.google.com | `/search?q=…` | Existing Google result navigation remains excluded | Existing bound plain-search dictation; all/images/videos/news |
| www.youtube.com | `/results?search_query=…` | Reviewed visible video links | Existing bound search dictation; Phase 5 thumbnails remain YouTube-only |
| en.wikipedia.org | `Special:Search`, fulltext query | Main-namespace article links in search results | Focus only; no article editing or special namespaces |
| github.com | `/search?q=…&type=repositories` | Public repository root links in result cards | Focus only; no issues, stars, forks or account actions; signed-in/private-repository behavior unaccepted |
| developer.mozilla.org | `/en-US/search?q=…` | English documentation links in search results, including open components | Focus only; no content editing or account operations |
| www.usajobs.gov | `/Search/Results?k=…` | Numeric public job announcements | `filter remote` / `filter all`; no application, resume upload, login, saved search or alert |
| duckduckgo.com | `/?q=…` | External destinations excluded | Focus only when a visible accessible search field exists |
| stackoverflow.com | `/search?q=…` | Numeric question links in results | Focus only; human verification is a known live restriction |

These are narrow public English profiles. They do not establish universal-site,
signed-in, alternate-domain, localization or mobile-layout compatibility.
Search query text goes to the chosen website through normal HTTPS navigation.
Keys, microphone and provider routing retain the prior explicit settings.

## What generalizes, and what still needs a profile

`packages/contracts/src/sites.ts` owns origins, reviewed paths, query encoding,
filters, result URL shapes and navigation comparison. It is bundled for the
desktop and extension from one source. `src/semantics.ts` shares accessible-name
handling (ARIA references/labels, associated labels, title/text), visible/enabled
checks, open-root discovery and result collection. Collection is bounded to
16 roots, 4,000 discovery visits, 96 selector matches and 24 exposed targets.
Main content gets priority over large navigation menus.

An accessible name or GET form does **not** prove an editing effect. Added sites
expose suitable fields as **focus-only**. `search …` constructs a reviewed URL;
it never calls a site's submit/click/input handler. Arbitrary text fields,
autosave, unknown buttons and application submissions remain blocked. The
existing Google/YouTube dictation profiles retain their separate evidence.

To enable another origin: review its read-query paths and consequences, add an
exact optional grant, fixtures for positive and adversarial variants, then
measure signed-out live tasks. Publish separate search, navigation and editing
results. Unknown effects require a dedicated reviewed operation; a model cannot
create that authority. Selectors/URL recipes are maintenance obligations.

Navigation requires matching origin/path/query values, a loaded document and a
reviewed search/content marker. It waits for 400 ms of URL stability and retries
only transient **observations**, never navigation dispatch. Only observed fixed
normalizations are accepted: Wikipedia `ns0=1`, DuckDuckGo `ia=web`.
Unexpected queries, redirects, challenge/login pages, loading and missing
evidence block or leave an unknown outcome requiring inspection. Nothing is
replayed after an unknown result.

## Frames and changing pages

`inspect page` still observes the root only. **`inspect frames`** explicitly
inspects at most four visible same-origin iframe documents with reviewed paths.
It exposes a bounded count of supported controls, without field values, titles
or arbitrary child text. `open frame 1` rechecks the iframe node, child Document,
URL, root document and active permission/epoch before opening that reviewed URL
**in the main tab**. It does not type or click inside the frame.

Cross-origin frames (even another approved catalog origin), hidden frames,
srcdoc/about:blank, sandbox-inaccessible documents, unreviewed auth routes,
redirected children and nested frames remain excluded. There is no broader
frame permission or screenshot/UIA fallback.

Open shadow roots and fields in already-open dialogs can expose reviewed
controls. Closed roots, unopened dialogs and unrendered virtual rows cannot.
Fresh snapshots handle SPA changes; replaced controls or a recycled node with a
changed label/href invalidate old receipts. Scroll can expose more rows, but
Latham never invents offscreen result numbers or opens a consequential dialog.

## Browser evaluation and release limits

The historical `node scripts/evaluate-edge.mjs` probes installed Edge in an isolated
profile. The separate `edge experiment` Playwright case tests native pairing,
reviewed search, Stop acknowledgement and revocation. Production browser
selection/launch, native permission-prompt acceptance, store identity,
signed-in live flows and the full regression set are **not accepted for Edge**.
The current production selection/launch path and browser regression runner are
documented in [Phase 9](phase9.md); the limitations above describe the original
Phase 6 experiment, not a claim of complete current Edge acceptance.
Firefox needs different manifest/native-host integration and remains untested;
Safari and other platforms remain later work.

Revoking a grant pauses the session and discards targets. A live document whose
permission was removed may require reload/reconnect before a new executor fence
can be acknowledged. Latham preserves that fail-closed behavior.

Run controlled checks with `npm run check` and
`npx playwright test --project=chrome-and-fixture --no-deps`.
`node scripts/evaluate-catalog.mjs` measures live public sites with synthetic
queries and explicitly documented **install-time fixture grants**. It does not
accept native permission prompts or bypass verification. Those prompts remain a
separate manual acceptance path; existing Google/YouTube acceptance does not
prove every new prompt. Preview ZIPs remain local, unsigned developer artifacts.

## Primary references

- [GitHub repository search](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)
- [MediaWiki search](https://www.mediawiki.org/wiki/Help:Searching/en)
- [USAJOBS location and remote filtering](https://help.usajobs.gov/how-to/search/filters/location)
- [DuckDuckGo URL parameters](https://duckduckgo.com/duckduckgo-help-pages/settings/params)
- [Edge native messaging and registry fallback](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
- [Edge sideloading](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)

Live MDN open-component structure and USAJOBS `data-search-result` links were
inspected directly on their public pages. No reference repository code was
copied, forked or incorporated.
