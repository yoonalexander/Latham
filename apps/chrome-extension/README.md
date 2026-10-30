# Chrome extension

Reserved Manifest V3 application. `src/background` will own permission state
and native messaging; `src/content` will own scoped DOM observation and actions.

The scaffold manifest requests no permissions and loads no scripts. It is an
inactive placeholder, not a working Latham extension. TypeScript sources must
be built and explicitly wired into the manifest during implementation.

Phase 1 adds pairing and remembered per-site optional host grants. Phase 2
adds supported-site observation and execution. A missing or denied grant never
enables a different adapter as a bypass. No site access is granted here.
