# @latham/planner

Optional deterministic planning for reviewed single-site search goals.

`compileWorkflow` validates a structured goal and emits search, optional filter
and optional visible-result opening steps. It accepts no arbitrary tool list,
page instruction, code, selector or consequential operation. The main controller
and extension separately own scope, budgets, execution and verification.

Manual Chrome commands do not depend on a model planner. See
[Phase 7 setup](../../docs/phase7.md) for review, cancellation, shortcut storage
and the explicitly disabled consequential integrations.
