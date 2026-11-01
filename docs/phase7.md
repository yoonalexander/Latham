# Bounded search workflows — Phase 7

The **0.7 unsigned Windows preview** can carry a reviewed search goal through
several verified Chrome operations. It also saves explicit, encrypted workflow
shortcuts. This milestone enables **read-query workflows only**; no send, upload,
application, account-changing or purchasing integration is enabled. Phase 8 and
the planned Handy speech migration remain separate work.

## Prepare, review, run

1. Follow [Chrome setup](phase2.md), load desktop/extension **0.7.0** (protocol 2),
   approve a [catalog site](phase6.md), open that site and start a Chrome session.
2. In **Bounded workflows**, choose the same website, enter a query, optionally
   select a reviewed filter, and choose whether to open a visible result.
   Push-to-talk can produce a reviewed transcript; **Use transcript as workflow
   search text** copies up to 300 characters literally. It never runs the goal.
3. Choose **Prepare workflow**. This observes the permitted tab and presents the
   exact steps, limits, bound tab and expiry. No search/filter/open is dispatched.
4. Choose **Run reviewed workflow**. Its preview token is single-use. Changed
   draft text requires preparation again. Earlier verified steps remain visible
   if a later operation fails or is interrupted.
5. Use **Cancel workflow**, physical Stop, Ctrl+Alt+., or the tray Stop at any time.
   An already-issued effect may have happened. An uncertain effect is inspected
   and reconciled through the existing Chrome recovery controls, never replayed.

Example: on approved USAJOBS, search `software`, filter `remote`, open the first
visible reviewed result. The steps are public search, a URL-based remote filter
and opening a job announcement. This never clicks Apply or uploads a resume.

The planner is a local deterministic compiler for this structured goal. It makes
**zero model requests**, needs no provider key or Ollama model, and cannot infer
extra tasks from a query or page text. Existing speech/target-selection provider
settings retain their separate routing. A general natural-language/model planner
is not included in this release.

## Limits and verification

| Limit | Enforced behavior |
|---|---|
| Goal | One catalog site, query up to 300 characters, reviewed filter, optional result ordinal 1–3 |
| Plan | Search; optional filter; optional reviewed-result opening. No arbitrary tool sequences |
| Preview | 60-second expiry, active approved tab/document/session, single-use Run ID |
| Run | 60 seconds, at most 8 action attempts and 20 desktop-to-extension requests |
| Result discovery | Two waits of 750 ms and at most three downward scrolls |
| Completion | Every planned step and final lease release must verify |
| Persistence | No plans, run tokens, scopes or execution history are saved |

Main and extension independently enforce their budgets. Request counts include
lease setup/start, scoped observations, action attempts and release; they do not
claim to count every bounded internal Chrome API call. Each navigation has the
existing 12-second verification window. Search/filter URL recipes and result
effects remain in the compiled site catalog, with no browser permission increase.

Result numbers mean **currently visible reviewed results**. The planner waits
briefly and scrolls within its published limit, then stops if the selected result
is absent. It does not substitute another result, invent offscreen rows, click an
unknown handler, continue through a CAPTCHA or replan from page instructions.
Google and DuckDuckGo workflows leave results open; those profiles have no
reviewed ordinary-result opener. Google supports all/images/videos/news filters;
USAJOBS supports all/remote. Other sites retain [their exact restrictions](phase6.md).

The extension first checks the selected origin/path using browser identity,
**before injection or page-label observation**. Its workflow lease pins tab,
window, Chrome document ID, isolated document token, URL, session and epoch.
Every step validates that lease and freshly captured result references.
An unexpected same-URL reload or replaced root cannot reuse a prepared plan.
Known navigations can establish the next scoped document; arbitrary changes
cannot. URL normalization is limited to the previously reviewed catalog cases.

Trusted pointer/key/input/wheel/scroll events, iframe focus, tab/window changes,
unexpected navigation, revoked access, disconnect, app hiding, renderer loss or
Stop invalidate remaining work. Programmatic workflow scrolling has one bounded
expected-scroll allowance. Event trust is a cancellation signal, not human
authentication; site-generated browser behavior can conservatively interrupt a
run. Only an already-attached document's DOM events can be monitored. Events
during a new document's pre-injection interval are not a certified interaction
history; loaded URL, identity and fresh control checks still gate continuation.

Outcomes are explicit: **completed**, **partial**, **blocked**, **cancelled** or
**unknown**. Action attempts are counted before dispatch, so a denied attempt can
consume a budget without causing a website effect. No failure or timeout
silently starts another run. Manual commands, dictation, visual operations and
hands-free sessions cannot race a prepared/running workflow.

## Save, edit and revoke shortcuts

After a complete verified run, expand **Saved workflow shortcuts**, name the goal
and explicitly save it. Loading a shortcut only fills the form. Prepare and review
again for every run; launch/restart never executes one automatically.

To edit: load a saved shortcut, change its goal, prepare/run it successfully,
then choose **Update shortcut with completed goal**. To revoke: delete the
selected shortcut or all shortcuts. Deletion cancels prepared/running work and
pauses Chrome. An old Run ID cannot recover a deleted shortcut's authority.

Up to ten shortcuts contain only ID, name (80 characters maximum) and a validated
goal. `workflow-shortcuts.bin` uses Windows DPAPI via Electron safeStorage; there
is no plaintext fallback. Failed writes preserve the prior file and in-memory
list. Corrupt/unavailable encryption locks the store instead of replacing it;
**Delete all saved shortcuts** explicitly discards the damaged saved data.
Queries/names are retained only through this explicit save, not default logs.
See [threat boundaries](threat-model.md) and [evaluation](evaluation.md).

## Consequential-integration review record

The Phase 7 review selected **no consequential integration for enablement**.
Existing profiles can establish read-query outcomes, but do not establish exact
recipient/payload identity, trusted approval and delivery/idempotency contracts
for the operations below. A Run token is not an approval override.

| Candidate | Decision and missing evidence |
|---|---|
| Send a message/email | Disabled: needs a dedicated typed send operation, exact recipient/body/attachment preview, trusted single-use approval bound to payload digest and current account/context, expiry, focus restoration/revalidation and delivery receipt/idempotency semantics |
| Upload a resume/file or submit an application | Disabled: needs explicit file bytes/identity, destination/account/form/payload preview, a dedicated operation/approval contract and duplicate-submission/recovery acceptance |
| Change an account or create a saved search/alert | Disabled: needs exact account/setting diff, dedicated effect verification, scoped approval and recovery rules |
| Purchase/payment, destructive action, permission grant or scheduled unattended work | Excluded; not introduced by this milestone or by shortcut saving |

Before any future candidate is enabled, separately review its operation and
approval UI, account/recipient/payload binding, single-use authority, focus and
freshness checks, deadlines, duplicate prevention and unknown-result recovery.
Test Stop, stale approval, manual edits, account/window changes, prompt injection,
restarts and lost acknowledgements against that actual integration. No generic
confirm/allow action, speech-only permission approval or arbitrary tool endpoint
is present in 0.7.

## Validation and references

Use `npm run check`, then serial Playwright integration checks. The shared test
fixture uses isolated install-time grants; it does not accept native permission
prompts. `node scripts/evaluate-workflows.mjs` measures signed-out public USAJOBS,
Wikipedia and MDN goals through the actual runtime, recording complete, partial
and unknown outcomes separately. Current evidence is in [evaluation](evaluation.md).

Primary platform references: [Chrome tab identity/events](https://developer.chrome.com/docs/extensions/reference/api/tabs),
[isolated content worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#isolated_world),
and [DOM event trust](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted).
