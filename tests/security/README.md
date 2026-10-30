# Contract and policy regressions

Run `npm test` for the 26 Phase 0 cases covering denied observation, paused-session
authority, effect blocks, ambiguity, IPC parsing, secure/hidden-value redaction,
capture IDs, serialized actions, cancellation/revocation/reset, late observations,
unknown dispatch, stale targets, old success markers, deadlines, storage and
diagnostic minimization.

These are scoped automated regressions, not a full repository security audit or
evidence of real-site/native-app safety. Add cases at each actual trust boundary
as later adapters are introduced.
