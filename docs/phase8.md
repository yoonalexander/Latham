# Phase 8 — optional managed AI, local preview

Introduced in **0.8.0** and retained in the current **0.9.0** preview, November 1, 2026, within the owner's chosen scope:
**build locally; billing disabled**. This is an invitation-based local service
and desktop integration, not a deployed or commercial service. Public hosting,
trusted Windows signing and commercial launch remain explicit gates below.
Current Windows browser compatibility is documented in [Phase 9](phase9.md).
The planned Handy migration is not included.

## Start the local service

Use Node **22.13.0 or newer** (tested 22.13.0). Its built-in `node:sqlite` is
experimental in that version; no new npm dependency is needed. From the root:

```powershell
npm run build:service
npm run service:invite
npm run service
```

For an explicit real-provider recheck with the previously prepared public speech
fixture, run `node --env-file-if-exists=.env.local scripts/evaluate-managed.mjs --live`.
It makes at most two inference calls, verifies quota/deletion, and writes
metadata-only results to ignored `.test-artifacts/phase8-live-managed.json`.

`service:invite` prints an account ID and a **one-time invitation secret** in the
operator's terminal. Treat it as a credential; do not paste it in chat or logs.
It expires after 24 hours. `service` reads `GEMINI_API_KEY` from the ignored
`.env.local` or process environment, keeps it server-side, and binds only
`127.0.0.1:47831`. No paid account/billing enrollment is performed. The server
does not start without a key. Use the existing free key only with synthetic,
non-sensitive content; free quota/outages still apply.

Build/run the development desktop with `npm run dev`. In **Managed AI account**,
enter the local address and invitation, accept the displayed routing/retention
disclosure, and sign in. Sign-in alone leaves the saved route unchanged. Choose
**Latham-managed AI**, then **Save AI setup**, test the decision setup and record
a short utterance. Review the transcript before insertion or execution.

Development allows HTTP only for exact `127.0.0.1`. Packaged builds require HTTPS,
including for managed account setup, and ship no service address, key, database,
session, invite or signing key. An HTTPS ingress and its operational/privacy
review are still needed for packaged managed-service acceptance. The portable
preview keeps local/BYOK operation; it does not require this service.

## Account and service contract

- Operators provision accounts locally; no public signup, passwords, email,
  external identity provider or payment collection is introduced. Random
  invitations are single-use; random bearer sessions last 30 days. Only SHA-256
  hashes of these high-entropy secrets reach the server database. Desktop
  sessions use Windows DPAPI with no plaintext fallback and never enter renderer
  state, extension messages or diagnostics. A corrupt session needs explicit
  local recovery, never silent replacement.
- **Refresh usage** shows admitted requests for the UTC day and account limit.
  One transcription or candidate selection costs one request. Invalid inputs
  and rejected requests do not spend a provider request. Once admitted, a
  failed/cancelled/uncertain provider attempt still counts. No automatic retry,
  model switch, BYOK substitution or local/cloud fallback occurs.
- **Sign out** revokes the current server session, then removes local credentials.
  **Cancel** disables this account's inference and aborts in-flight work, while
  retaining authenticated access to deletion/sign-out. Only an operator-issued
  replacement invite reactivates it. **Delete** removes the account, invitations,
  sessions and identifiable usage, aborts active work, then removes local
  credentials. Anonymous global request totals remain to prevent budget reset.
- Account UI requires typing `cancel` or `delete` before those buttons enable.
  All account changes pause execution/microphone work. Unknown responses are
  reported as unconfirmed; local credentials stay available for reconciliation.
  **Forget** removes only this device's credentials and explicitly does not
  claim revocation, cancellation or server deletion. A saved managed route
  stays managed after sign-out/deletion and fails closed until the user changes
  it; it never silently uses an existing provider key.
- Recovery: `npm run service:invite -- ACCOUNT_ID` invalidates all old sessions
  and invites and provisions a new invitation. Use operator access to the same
  database; the command is never a public HTTP endpoint. Expired sessions and
  invitations are pruned, account usage is retained at most 31 days, and accounts
  with neither a session nor invitation are removed on the next maintenance
  request window. Protect the service data directory with operator-only OS ACLs.

## Routing, privacy and operation limits

The explicitly selected managed route sends **active** 16 kHz mono PCM speech
(maximum 30 seconds), or a request (maximum 2,000 characters) and up to 24 visible
candidate IDs/labels/roles, from Electron main to the configured service and
then Google Gemini using the existing fixed-model adapter. No client-supplied
URL, model, provider key, tool/action list, field value, arbitrary page dump or
image is accepted by the service. Managed vision is not enabled; visual choices
remain separately disclosed local OCR/Ollama or user-key Gemini.

The service has no execution, browser, native helper, permissions or workflow
authority. Candidate output is revalidated on both sides and still passes the
existing scope/effect/executor rules. Deterministic workflows use no model.
Stop remains local and independent of account/provider availability. The server
aborts on disconnect, account cancellation/deletion or its 45-second inference
deadline; the client discards late results. Neither cancellation nor deleting
Latham data recalls content already sent to Google.

Raw requests/responses/audio/transcripts are held transiently, with no body or
credential logging. Live account/session/usage deletion uses SQLite foreign-key
cascades and secure deletion with the default rollback journal. No automatic
backups, request logging or analytics are configured. Operator-made backups and
reverse-proxy logs need separately enforced retention/deletion; restoring a
backup must not resurrect revoked/deleted accounts or reset global spend. Do
not restore account backups into service without a reconciled revocation and
budget ledger. Google processing/retention is separate: unpaid-service content
may be reviewed by people and used for product improvement. This preview is
not a promise of zero provider retention or a compliance certification.

Defaults, configured only on the server before startup:

| Control | Default |
|---|---|
| `LATHAM_ACCOUNT_DAILY_REQUESTS` | 20 (new/recovery invites; 1–1,000) |
| `LATHAM_SERVICE_DAILY_REQUESTS` | 100 across all accounts |
| `LATHAM_SERVICE_TOTAL_REQUESTS` | 1,000 across all days/accounts/restarts |
| Per-account minute admissions | 6 |
| Concurrent provider calls | 1/account, 2/service |
| HTTP requests/minute | 120/service; enrollment 6, authenticated routes 60 |
| Concurrent HTTP handlers / connections | 8 / 16 |
| Request body / upstream response | 1,300,000 / 65,536 bytes |
| Provider output | 1,024 maximum tokens, no automatic retries |

SQLite reservations are transactional and persist **before** dispatch. Deleting
accounts, restarts, provider errors and crossing midnight cannot reset the
service lifetime guard. These are bounded request/input/output budgets, **not
dollar billing or a guarantee about future provider prices**. Commercial spend
limits require owner-approved prices, upstream quotas/billing controls and
reconciliation before launch. Billing, subscriptions, trials with a card and
automatic payments are disabled and have no endpoint.

`GET /health` is a local readiness check, not a live-provider probe. Opt in to
`LATHAM_SERVICE_DIAGNOSTICS=1` for minute-level in-memory admitted/succeeded/failed/
active counters. No content, account ID, tokens or keys are printed by these
diagnostics. An operator must add process supervision, external availability
checks, provider-failure alerting and a tested backup/deletion policy before
hosting. Daily/lifetime caps and fixed concurrency also bound incident exposure.

## Release integrity and rollback

The distribution stays **unsigned developer preview**, with no automatic update
download/install. Versioned desktop/extension pairing remains exact (0.9.0,
relay protocol 3). Legacy local/BYOK settings migrate without activation;
managed sessions use policy `latham-managed-local-v1`, and service schema version
1 rejects future schemas rather than overwriting them.

`npm run build:release-tools` builds an offline manifest tool outside the desktop
bundle. An operator can sign `release-manifest.json` with a private Ed25519 key
stored outside the repo/package:

```powershell
node .test-artifacts/release-tools/integrity.cjs sign RELEASE_DIRECTORY PRIVATE_KEY_FILE
node .test-artifacts/release-tools/integrity.cjs verify RELEASE_DIRECTORY PINNED_PUBLIC_KEY_FILE 0.7.0
```

Verification authenticates the exact manifest and both Windows/extension ZIPs,
rejects replay/downgrade, duplicate/path-escaping entries and altered bytes, and
does not extract or run anything. Obtain the **pinned public key through an
independent trusted channel**, not the same download. No production publisher
key has been chosen or shipped. Fixture test keys authenticate only test data.

Manifest signing is distinct from Windows Authenticode. Before a public build,
sign the product executable and all four bundled helpers using the owner's
trusted code-signing identity and timestamp service, regenerate archives/hashes,
then sign the final manifest. The fail-closed preflight is:

```powershell
powershell -NoProfile -File scripts/check-release-signatures.ps1 -PackageDirectory PACKAGE_DIRECTORY -PublisherThumbprint TRUSTED_CERTIFICATE_THUMBPRINT
```

It requires valid timestamped signatures from the expected publisher on every
product executable. An unsigned preview must fail this check. No certificate
is fabricated and no OS warning/verification is bypassed.

Updates remain manual portable replacements: verify the candidate offline,
stop/quit Latham, retain the prior portable directory, extract to a new versioned
directory, register its host and load its matching extension, then run the
packaged acceptance check. Keep user data separate and protected. For rollback,
quit, restore the prior desktop **and matching extension/host**, and explicitly
forget a newer managed session using 0.8 before running 0.7. The older parser
rejects `mode: managed` to local defaults; do not use a rollback to bypass unknown
effect recovery or reactivate microphone/executor authority. Future schema
changes need a backup/migration/recovery suite before enabling automated updates.

## Commercial readiness review — no launch authorization implied

| Area | Review result / launch requirement |
|---|---|
| Independent source/assets | No fork or reference-app imports; existing own UI/assets retained. |
| Libraries/models/notices | [Dependency inventory](dependencies.md); no new npm/model dependency. Node/SQLite runtime terms apply to the separately installed server. Review pinned redistributable notices and model terms for the actual release. |
| Product branding | Keep **Latham**. No trademark clearance or ownership registration is claimed. |
| Source/contributor rights | Own distribution license and contribution policy remain owner decisions. Do not accept outside contributions or publish a commercial binary under unspecified terms. |
| Provider/privacy | Review the current Gemini eligibility, regions, paid/free routing, retention and user disclosures against intended users. The local synthetic preview is not clearance for a consumer-facing managed service. |
| Billing/support | Billing disabled. No subscriptions or paid support promised. Local service operator handles invitations/revocation and diagnostics; choose support/privacy contacts before launch. |
| Operations | Public TLS/domain/hosting, secret rotation, production authentication/recovery, incident runbooks, alerts, backup deletion, trusted signing and real packaged HTTPS acceptance remain unconfigured. |

Owner scope explicitly defers public deployment/signing, rather than marking
those production gates passed. See [evaluation](evaluation.md) for actual test
evidence and [release operations](release-operations.md) for the launch checklist.

Primary references checked November 1, 2026: [Node 22.13 SQLite](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html),
[Gemini terms](https://ai.google.dev/gemini-api/terms),
[Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing),
and [Electron updates](https://www.electronjs.org/docs/latest/tutorial/updates).
