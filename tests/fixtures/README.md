# Controlled browser fixture

`browser.html` and `browser.ts` provide text/search fields, a checkbox, duplicate
filter buttons, unknown/consequential controls, a simulated autosaving account
field, a synthetic password, page/node replacement, and an untrusted instruction.
`denied.html` is served from a different local host inside a sandboxed iframe.

These pages are compiled into the Electron test surface. They are not an
extension or a real website integration. All data and effects are synthetic.
The native Windows fixture app belongs to Phase 3.

The unsafe controls work when manually operated, allowing tests to establish
that policy prevention happens before mutation rather than hiding inert controls.
