# Evaluation and acceptance

## Phase 1 evidence — October 30, 2026

Implemented setup and its reproducible commands are in [phase1.md](phase1.md).
The offline suite now has 36 unit/boundary cases and six integration flows
(four fixture flows plus real MV3/native-host tab controls and fake-device
microphone permission/capture boundaries). Run `npm run setup:browser` before
the integration suite. Close other Latham instances so the physical hotkey can
register; concurrent acceptance instances deliberately contend for that key.

Live provider evaluation used the public whisper.cpp `samples/jfk.wav` and
synthetic unique/ambiguous/missing candidate fixtures. Both Gemini
`gemini-3.1-flash-lite` and the local configuration produced usable final
transcripts and passed all three application-level candidate cases. The real
desktop flow also passed both routes, DPAPI ciphertext inspection, saved-key
reuse across restart, final-once preview and paused restart. No personal audio
or page contents were used in these provider checks.

| Route | Speech elapsed | Candidate elapsed (unique / ambiguous / missing) |
|---|---|---|
| whisper.cpp tiny.en + Ollama Qwen2.5 1.5B | 9.214 s | 9.481 / 8.245 / 7.990 s |
| Gemini 3.1 Flash-Lite | 3.329 s | 0.559 / 0.760 / 0.821 s |

These are individual runs under concurrent browser-test load on an i7-1065G7,
8 logical processors and 16 GB RAM, without discrete GPU use. Earlier isolated
speech runs took roughly 1.9–4.8 s. They are setup measurements, not latency
percentiles or a representative speech-accuracy benchmark. The local 0.5B
candidate missed a valid target; larger models still chose between duplicate
labels. Local indistinguishability checks therefore force abstention
independently of model output. One cloud comparison encountered a provider
availability error; no automatic retry or local-to-cloud fallback occurred.

Reports are ignored `.test-artifacts/provider-evaluation.json`,
`app-provider-acceptance.json`, `e2e-results.json`, and the interactive
`permission-acceptance.json` when that flow passes. Native integration caught
and fixed a synchronous duplex-pipe deadlock; the host now uses asynchronous
pipe handles. Tests verify actual returned tab identity/active state, not only
mocked Chrome responses. Navigation remains honestly reported as dispatched.

Interactive permission and physical-stop acceptance passed in a fresh visible
Chrome-for-Testing profile. The user approved Google Search; the authorized
native UI check approved YouTube. Assertions passed remembered restart without
reprompt, unapproved-origin denial, browser-side and Latham-side revoke,
disconnect/reconnect without replay, retained grants while paused, and physical
Ctrl+Alt+. changing an active Chrome session to a confirmed paused fence. The
new-site negative test serves synthetic content under a routed origin, avoiding
external DNS as a test dependency. No personal browser profile was used.

Native composed-window review also found and corrected fixture/setup overlap;
scrolling away now hides the separate fixture view. Real microphone recognition across speakers/noise,
stable-Chrome installation, additional languages/hardware, broad site tasks,
installer/signing and production distribution remain Phase 2 release work.

## Historical Phase 0 acceptance

**Result:** Phase 0 foundation accepted on October 30, 2026, after the checks
below. This is not acceptance of the Chrome MVP or later milestones.

## Reproduce

```powershell
npm ci
npm run setup:electron
npm run evaluate
```

At Phase 0, the evaluation command typechecked, ran contract/policy/storage tests, built
the app and ran actual Electron acceptance flows. That Phase 0-only suite
needed no separate test browser; the current suite also needs `setup:browser`.
Development setup could download dependencies/runtime binaries; that Phase 0
build had no connected external provider or website.

Tested environment: Windows, Node.js 22.13.0, npm 10.9.2, TypeScript 7.0.2,
Electron 45.2.0, Vitest 5.0.5, Playwright 1.64.1. Exact packages are locked.

## Evidence

| Check | Result |
|---|---|
| Shared TypeScript check and deterministic desktop build | Passed |
| 26 contract/policy/cancellation/privacy/storage cases | Passed |
| 4 real Electron flows | Passed |
| Native composed-window inspection | Passed: fixture visible in its separate view; command desk, settings and status legible |
| Physical Ctrl+Alt+. shortcut | Passed: Ready changed to Paused |
| Project whitespace/document links | Passed; 25 local links checked, with staged whitespace rechecked before commit |

The unit cases cover denied observation, paused authority, unknown/consequential
and secure-field blocks, ambiguity, boundary parsing, redaction, capture IDs,
serial dispatch, cancellation/revocation/reset, late results, unknown outcomes,
stale targets, old success markers, deadlines and persistence minimization.

The Electron flows cover:
1. Verified typing/search/filter actions, explicit ordinal disambiguation, effect
   blocks, secure/iframe redaction, runtime isolation and blocked external fetch.
2. A real edit with a lost response: unverified state, no silent continuation,
   and recovery after explicit fixture reset.
3. Stop across delayed/queued work, page replacement and scope revocation.
4. Saved consent with paused restart, and diagnostic content/clearing.

The unsafe fixture controls are also manually operable in the test, proving
that the negative cases prevent mutation rather than rely on inert controls.

## Reports and diagnostic data

`.test-artifacts/e2e-results.json` is the machine-readable Electron report.
Synthetic surface screenshots are saved there; failures retain traces. The
main renderer screenshot omits the separate native fixture view, so composition
was additionally checked through native window capture. Explicit test artifacts
are ignored by Git and may contain synthetic command/fixture contents.

Application diagnostics are separate: off by default, at most 50 metadata
events persisted when enabled, and clearable. Command text, page values,
snapshots and raw exception details are excluded. Test directories isolate
settings and browser state from the normal user profile.

## Gate and remaining scope

All Phase 0 roadmap items have implementation/evidence. No microphone capture,
AI call, Chrome extension connection, real-site automation or native-app control
is claimed. Real-site tasks and the full cloud/local speech configurations are
Phase 1–2 acceptance work. Product-wide latency/recognition targets remain
proposed until representative hardware and audio tests exist.

Use the design's result semantics: a clarified search filter differs from a
blocked application submission; secure fields have no P0 typing override; an
unknown dispatch cannot be retried as though nothing happened.
