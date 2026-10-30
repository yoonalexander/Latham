# Electron acceptance

Run `npm run test:e2e` from the root. Four flows exercise the real main process,
preload, React shell and sandboxed fixture:

1. Successful typed actions, ambiguous/blocked controls, redaction, isolation
   and denied external fetch.
2. A real mutation whose response is lost: unverified state, no silent retry,
   and explicit fixture-reset recovery.
3. Stop across delayed/queued work, document replacement, and consent revocation.
4. Consent persistence with paused startup and metadata-only diagnostic storage.

Each launch uses an isolated data directory. `.test-artifacts/e2e-results.json`
is machine-readable; screenshots and failure traces contain synthetic test
data and are ignored by Git. Electron downloads are prepared before timed tests.
