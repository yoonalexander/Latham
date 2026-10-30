# @latham/decisions

Phase 0 deterministic grammar for fixture typing, search, checkbox filtering
and label-based clicks, including explicit first/second choices. Unknown
commands abstain; duplicate labels never select randomly.

No cloud or local language-model adapter is connected yet. Phase 1 adds provider
fixtures; Phase 2 adds bounded target selection on the supported Chrome sites.
Model output must still pass the local policy and executor boundary.
