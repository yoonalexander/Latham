# Phase 9 — Windows compatibility and sustained evaluation

The owner selected **Windows only for now; keep other platform gates open**.
Version **0.9.0** implements that scope. It does not complete every long-term
platform, language or website ambition. The release remains an unsigned Windows
x64 developer preview with billing disabled and the [Phase 8 launch gates](release-operations.md)
still open. Handy remains planned, not implemented.

## Choose Chrome or Edge explicitly

1. Build/run the desktop, then choose **Controlled browser** in setup.
2. Register that browser's host. Load `dist/chrome-extension` from
   `chrome://extensions` or `edge://extensions` with developer mode enabled.
3. Open the extension, connect and approve supported sites. Start a session in
   Latham. This does not enable arbitrary sites, signed-in flows or account actions.

Desktop/extension **0.9.0** and native protocol **3** must match. Register the new
host after upgrading. Hosts use separate `native/chrome` and `native/edge`
directories and current-user registry entries. Chrome also registers its
Chromium test adapter; Edge has its own Microsoft registry entry. Launch buttons
use fixed standard install locations, not arbitrary executable paths.

Browser switching stops work, waits for the previous browser fence, rejects an
uncertain result, disconnects the old relay and clears its effective grants and
bindings. Reconcile the old result before switching if Latham requests inspection.
It never launches another browser, starts a session or transfers site approvals
automatically. One selected browser/profile can connect at a time. Simultaneous
Chrome/Edge sessions and multiple personal profiles are not supported. The
manifest explicitly disables incognito/InPrivate access.

Site consent is separate per browser. Legacy 0.8 settings migrate to **Chrome
only**; Edge starts unapproved. The extension also keeps its own per-profile
consent, intersected with Latham consent and current host grants. Returning to a
previously approved browser retains approval, while connection and execution
start paused. Revoke in either UI retains the existing cancellation behavior.

Edge can otherwise fall back to Chrome's host registration. The relay therefore
checks its actual launching browser process family before greeting main; main
also requires the selected browser in the protocol-3 greeting. Direct launches
and one verified Windows System32/SysWOW64 `cmd.exe` intermediary are supported;
arbitrary shell ancestry is rejected. Chrome test binaries use the existing
`latham-test-browser.exe` name. This identifies the browser family for normal
launches; it is not publisher attestation against same-user malware/renamed
executables. No new process-launch, shell-command or UIA API is exposed.

## Support matrix

| Surface | 0.9 claim | Limits / next acceptance |
|---|---|---|
| Windows Chrome | Existing reviewed profiles, dictation, workflows, visual/hands-free routes | Isolated Chrome for Testing regression; stable personal-profile installation remains a separate gate. |
| Windows Edge | Explicit selection, dedicated host/consent, same typed reviewed operations | Installed Edge fixture and signed-out live evidence in [evaluation](evaluation.md); native optional-permission prompt UX/store distribution remain unverified. |
| Windows native apps | Existing Notepad plain-text profile | Foreground activation can fail; this milestone does not weaken its focus checks or certify new native editing. |
| Websites | The existing [eight-origin catalog](phase6.md) | English public read-query profiles only. Closed components, denied frames, unknown effects, sends/uploads/account actions remain blocked. |
| Languages | Existing supported ASR model/language configuration | Model language choices do not translate English command grammar, site profiles or en-US wake/stop. Broader language accuracy needs actual speakers/corpora. |
| Keyboard/accessibility | Skip link, visible focus for links/selects/summaries, responsive layout, local Escape Stop | Keyboard/UI tests are not Narrator/assistive-technology or full WCAG certification. |
| Displays | Work-area clamping and cancellation on display additions/removal/metrics changes | Simulated negative coordinates/removal and actual single-display UI checks; physical mixed-DPI/multi-monitor acceptance stays open. |
| macOS/Linux/Firefox/Safari | Unsupported | No native adapter or permission acceptance is claimed. Non-Windows desktop startup fails before adapter activation. |

The every-website ambition is unchanged. New origins still need reviewed
read/query/effect profiles, per-origin consent, adversarial fixtures and live
evidence. A label, model answer or browser choice does not authorize an effect.
Maintain each recipe against actual site restrictions; a CAPTCHA or unsupported
page remains a stop, not an invitation to bypass access controls.

## Keyboard and display behavior

Tab to **Skip to assistant setup** and press Enter to focus setup without
changing the privileged document URL. Tab/Shift+Tab navigate controls; Enter or
Space operate standard controls, and the existing hold-to-talk supports a held
keyboard key. Focus indicators cover buttons, inputs, links, selects, summaries
and text areas. Local **Escape** invokes the same Stop path as the visible
button; global Ctrl+Alt+. and tray Stop remain independent alternatives.

The window initially fits the primary display work area. At narrow widths the
setup grid becomes one column. Showing a window clamps it into a current work
area; display configuration changes stop active execution/audio, clear bindings
and proposals and re-fit the window. No coordinate conversion is used to resume
an old native edit or visual proposal. Explicitly start and prepare the target
again. Physical hotplug, mixed DPI, maximized-window and assistive-technology
acceptance still require the corresponding hardware/users.

## Optional, local user evaluation

In **Compatibility and optional feedback**, expand the evaluation form after
trying a task. Select its task/browser/provider/outcome, measure elapsed seconds,
count permission prompts and rate effort/resource-or-cost burden. Check **Save
this one evaluation locally** for each entry, then save. This is self-reported
feedback, distinct from verified action receipts and automated fixture results.

Only fixed categories and bounded integers are accepted. There is no task text,
URL, title, user ID, audio, transcript, screenshot or free-text field. Nothing is
collected automatically or uploaded. At most 50 entries persist in local
`evaluation.json`; the UI shows counts of completion, intervention, incorrect
actions and high resource burden. **Clear saved task evaluations** removes them
and any interrupted temporary write. Corrupt/newer evaluation stores lock until
explicit clear. These non-content metrics are not encrypted account credentials;
do not treat them as a verified billing ledger or an anonymization guarantee.

Use real entries to prioritize repeated blocks, incorrect actions, high prompt
friction, slow completions and high resource/cost burden. No user-study results
are invented here; tests use synthetic entries and clear them. Broader demand,
speakers and assistive-technology needs remain an ongoing evaluation track.

## Repeatable compatibility checks

Run GUI checks serially on an interactive Windows desktop:

```powershell
npm run check
npm run evaluate:compatibility -- chrome
npm run evaluate:compatibility -- edge
node scripts/evaluate-workflows.mjs edge
```

The Chrome run exercises the full default browser/fixture project, including
explicit Edge isolation cases. The Edge run executes the browser/workflow suites
using the installed Edge with isolated profiles and install-time fixture grants.
Each run saves its own Playwright report plus version/count/timing metadata in
`.test-artifacts/phase9-{chrome|edge}-*`. Native tests have their own report and
must not be counted as passed when foreground activation fails. The live
workflow runner uses public synthetic queries, no model calls, no personal
profile and no challenge bypass; restrictions remain in its separate report.

Fixture browser profiles created by the helper are removed after closing that
test's browser, with an absolute-path guard. Reports/traces, desktop test data,
earlier profiles and personal browsers are retained. This bounds repeated test
disk growth; it is not permission to clean unrelated user data.

## Upgrade and recovery

Provider/browser settings now use schema 2. The migration preserves local/BYOK/
managed route settings, keys, uncertainty and Chrome consent; it adds separate
Edge consent and a saved browser choice without activating anything. A corrupt
or newer provider schema locks against overwrite and retains uncertainty. Quit,
preserve `providers.json` for recovery, inspect prior uncertain effects and use
the matching/newer build or an explicitly reviewed reset. Never erase an unknown
effect marker merely to make a compatibility check pass.

The portable release and extension must be upgraded together; register the new
host for the chosen browser. Managed-session policy is unchanged. Rollback to
0.8 cannot read the new browser-consent map safely: keep the current data backed
up, inspect unknown effects, quit, and restore a known-compatible pre-upgrade
settings backup only after reconciling permissions and uncertainty. Do not copy
Edge consent into Chrome or restore a session/executor as active. See
[release operations](release-operations.md); automatic updates and trusted
signing remain outside this unsigned channel.

## Platform and hardware gates still open

Windows UIA, DPAPI, HKCU native registration, WinRT OCR and System.Speech are
actual dependencies, not evidence of cross-platform support. macOS needs its own
Accessibility/permission and process/storage/browser contracts; Linux needs its
own AT-SPI/session/display/permission contracts. Each must independently pass
secure-field/denied-scope, field binding, Stop, crash/no-replay, provider privacy,
packaging and real-app/browser acceptance on that platform. No such adapters
were added on this Windows-only machine.

Continue actual language/speaker, assistive-technology, multi-display, stable
browser/store, signing, deployment and longitudinal user testing as separately
scoped follow-ups. The local Windows milestone does not mark those gates done.

Primary references checked November 1, 2026:
[Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging),
[Edge direct versus cmd host policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/nativehostsexecutableslaunchdirectly),
[Windows process snapshot structure](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/ns-tlhelp32-processentry32w),
[Electron display APIs](https://www.electronjs.org/docs/latest/api/screen),
[W3C focus-visible technique](https://www.w3.org/WAI/WCAG21/Techniques/css/C45),
[Apple Accessibility trust](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions),
[GNOME accessibility infrastructure](https://gnome.pages.gitlab.gnome.org/at-spi2-core/devel-docs/).
