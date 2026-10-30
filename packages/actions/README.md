# @latham/actions

Phase 0 reviewed fixture profiles and effect-specific verification. Allowed
operations are bounded local draft/search edits, fixture read-query search,
and known filter controls. Secure, consequential and unknown effects are blocked.

Profiles are local code. Names, target keys and model confidence alone never
authorize an arbitrary web action. Click verification requires a new expected
fixture result, so an old success marker cannot masquerade as a fresh effect.

No real browser or native-app executor is included. The Electron fixture adapter
rechecks document, node identity and control revision inside its dispatch call.
