# Evaluation and acceptance

Status: acceptance plan only. No product tests or benchmarks have run.
`npm run check` currently validates TypeScript source syntax/types, not behavior.

## Evidence by milestone

| Milestone | Required evidence |
|---|---|
| Phase 0 | Typed fixture action, local authorization, observed result and executor cancellation fence |
| Phase 1 | Cloud/local final turns, Chrome pairing, remembered site grants and revocation |
| Phase 2 | Advertised real-site workflows plus fixtures; provider-route results and all P0 regressions |
| Phase 3 | Native-app fields, focus isolation, UIA worker failure/recovery and cancellation |
| Later phases | Separate hands-free, visual, broader-site, workflow and managed-service suites |

Tests live under `tests/fixtures`, `tests/e2e` and `tests/security`.
Package-level tests may accompany implementation when they exercise a meaningful
contract. Add Vitest/Playwright when actual behavior exists to test.

## Reporting rules

Use design section 11 for the full matrix and proposed thresholds. Report wrong
actions, abstentions, interventions, latency and resource use separately for
cloud and local routes. Include tested hardware/model/site assumptions.

A clarified search filter is distinct from a blocked job-application submission.
P0 secure fields have no typing override. Stop/Pause must distinguish queued work
from input already dispatched. A timeout after possible dispatch is not evidence
of failure and must not cause blind replay.

Creating directories or compiling empty modules does not satisfy a roadmap gate.
Keep acceptance items unmarked until reproducible evidence exists.
