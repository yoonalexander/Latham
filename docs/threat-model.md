# Threat model preparation

Status: initial scope from design section 8; not a completed implementation audit.

## Planned trust boundaries

- Microphone input and webpages are untrusted inputs.
- Model providers select proposals, not authorization or grants.
- Renderer/preload/main, extension/background/content, and native helper IPC
  require narrow contracts and ownership checks.
- Site consent, Chrome grants, current document identity and active sessions
  jointly constrain browser access.
- Local-only processing must not silently fall back to cloud endpoints.

## Required validation areas

The first executable slice must demonstrate denied/revoked-scope handling,
stale-target rejection, unknown-effect blocks, cancellation races and accurate
unknown-dispatch reporting. Later work adds provider/secret handling, prompt
injection, frame boundaries, helper failures and native/visual surfaces.

See [the design](../Latham_Design_Document.md) for the threat/mitigation table and
[the evaluation plan](evaluation.md) for intended evidence. Add implementation
entry points, asset flows, concrete threats and validation results as components
are built. No secrets, screen capture, provider calls or OS-control permissions
are implemented by this scaffold.
