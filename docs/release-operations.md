# Release and service launch gates

The 0.9 channel is an unsigned Windows developer preview. Billing is disabled.
This checklist records outstanding owner/external work; local fixture tests do
not close it. Keep the name Latham and preserve local/user-key modes.

- [ ] Select distribution/contribution terms, verify ownership/notices and
  branding, and establish support/privacy contacts.
- [ ] Review managed-provider eligibility/regions/age, free/paid terms and
  retention for the actual audience; publish the resulting privacy notice.
- [ ] Provision hosting/domain/TLS, secret management/rotation and a reviewed
  production authentication/recovery policy. Keep SQLite single-instance or
  replace quota reservations with a reviewed shared transactional store.
- [ ] Review rate/abuse controls against deployment traffic. Configure enforceable
  upstream cost ceilings, alerts, external readiness and real-provider probes,
  incident shutdown, data backup/restore and revocation/deletion reconciliation.
- [ ] Acquire a trusted Windows signing identity and independent release-manifest
  public-key distribution. Sign/timestamp every product executable, rebuild
  archives/checksums, sign the final manifest and pass the signature preflight.
- [ ] Verify a real packaged HTTPS account/speech/selection/usage/cancel/delete
  flow, outages, expired credentials, request-budget exhaustion, lost replies,
  clean-machine installation and matched-version rollback.
- [ ] Run the complete regression suite and resolve or explicitly constrain
  interactive Windows focus failures. Publish exact support/evidence limits.
- [ ] Review automatic update design separately before enabling downloads or
  executable installation. Current verification tools never install updates.

No billing/payment implementation is included. Offering paid plans needs a
separate approved billing/refund/tax/support design and acceptance suite.
See [Phase 8](phase8.md) for current architecture, setup and manual rollback.
See [Phase 9](phase9.md) for protocol-3 browser consent migration, Windows
compatibility and open platform/hardware/language/accessibility acceptance.
