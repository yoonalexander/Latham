# Latham 0.3 Windows desktop preview

Phase 3 adds a narrow **Notepad document-text workflow** to the existing Chrome
assistant. It supports explicit app approval, opening Notepad, choosing a window,
preparing its editor, reviewed speech insertion, correction and guarded undo.
It does not add hands-free listening, general app control or a planner.

## Supported application

| Application | Accepted configuration | Supported effects |
|---|---|---|
| Microsoft Notepad | Windows 11 Home 10.0.26100; Notepad 11.2607.14.0; English UI with a visible Plain text status indicator | Launch; scoped window choice; focus/bind/inspect editor; append/replace/correct/undo document text |
| Latham native fixture | Development tests only; excluded from packaged builds | Synthetic text, secure/read-only controls, focus/replacement, reactive edits, stalls and recovery |

Only the standard system Notepad path or the protected Microsoft WindowsApps
Notepad package path is accepted, with a matching top-level window class,
same-user/session process and non-elevated token. Executable paths cannot be
supplied through the renderer. Other editors and Notepad versions need their own
acceptance; a missing supported pattern blocks rather than simulating keystrokes.

Notepad may restore previous tabs when launched. Opening the app does not select
or authorize a particular document. Choose the intended window and current tab
before preparing. The English **Plain text** status indicator must be visible
and is rechecked before edits. Missing indicators and Markdown mode block.
Formatting, saving, file dialogs, Markdown/AI
features, account actions and menu/button automation are outside this profile.
Notepad's own draft recovery or autosave behavior remains its responsibility;
editing a document is not a promise that the application retains nothing.

Browsers, terminals, password managers, elevated processes, secure desktops and
credential controls are excluded. Native permission never grants browser/site
access and cannot work around a denied Chrome extension.

## Use the preview

Build/run from source as in [Chrome/provider setup](phase2.md), or extract the
**unsigned** `Latham-0.3.0-win-x64-preview.zip` and run `Latham.exe`. Load the
matching extension 0.3.0 and register this build's host when using Chrome. The
The current browser relay uses protocol 3 (see [Phase 9](phase9.md)); the desktop agent is bundled separately.
The native helper uses Windows .NET Framework 4.8, with no .NET SDK installation.
Run Latham normally, without **Run as administrator**; the desktop helper also
rejects an elevated token of its own.

1. Configure and save Gemini or local speech as described in [phase2.md](phase2.md).
   The existing microphone and provider controls serve both Chrome and desktop.
2. In **Use Notepad**, select **Allow Notepad**. Permission is remembered, but
   every Latham launch and worker replacement starts without an active binding.
   **Block Notepad** overrides permission; removing the block does not reapprove
   it. **Revoke Notepad** pauses pending work and removes approval.
3. Open a plain document, choose **Refresh editor windows**, and select its
   titled window. The list contains only approved profile windows. Titles are
   transient local UI data; they are not sent to a model or logged.
4. Choose **Prepare editor dictation**. This explicitly focuses that editor and
   binds the process instance, window, current document/control and edit state.
   If Windows refuses focus, select the editor manually and prepare again.
5. Return to Latham, hold **Hold to talk**, speak, release and review the final
   transcript. Choose **Append transcript to editor** or **Replace editor with
   transcript**. Recording must have begun under that same binding. Preparing
   again clears older speech; record again afterward.
6. **Undo editor dictation** restores only the most recent unchanged Latham edit.
   It does not undo manual work or act as a general Notepad undo command.

Known editor commands avoid model selection because the reviewed field is
already explicit. Use the shared transcript as an editor command only after
reviewing it, or expand **Typed editor commands**:

```text
inspect editor
focus editor
dictate piano music
replace dictation with orchestral music
correct that to violin music
undo dictation
stop dictation
stop
```

Words following dictation commands remain literal text. Append adds a separating
space when needed. Correction preserves the last insertion's append/replace
mode. Each utterance is limited to 1,000 characters and the document to 20,000.
The adapter sets the reviewed control's value and reads it back, including a
150 ms check for reactive changes. It does not insert into whichever app happens
to receive a global key or clipboard paste.

## Freshness, Stop and recovery

User edits, tab/document changes, replaced controls, a different focused field
or a third foreground app suspend dictation and cancel outstanding speech.
Moving from the same editor field to Latham's recording window preserves that
field binding. Before each action the worker rechecks process start time,
user/session/integrity, root HWND, document title, UIA runtime identity, supported
field properties, GUI-thread focus, edit events and expected text. A title or
process name alone is insufficient.

All UIA calls run in a separate non-window-owning MTA process. A separate C#
supervisor accepts Stop independently of a stalled provider. Stop signals an
executor fence, kills the worker, and acknowledges only after exit is confirmed.
The app reports an unconfirmed fence if that fails. Five-second operation
deadlines use the same cancellation path. An app call already issued may still
complete; killing a worker does not roll back a target application's work.

Potential mutations persist an uncertainty marker **before dispatch**. Missing
replies, worker loss and failed verification require inspecting the document,
confirmed Stop and **I inspected the editor · clear uncertain result**. Then
refresh windows and prepare anew. Restart preserves that marker and never
replays edits. Keep the document open for inspection if an edit's outcome is
unknown. A disk-write failure cannot prevent the priority Stop signal.

If the supervisor connection itself disappears, its acknowledgement is unavailable:
Stop remains unconfirmed. The worker's parent watchdog exits it; restart Latham
and inspect the document before clearing uncertainty. A late successful reply
cannot restore a binding after Stop, including during verification callbacks.
Failed settings writes cannot grant approval or clear the uncertainty marker.

Switching between fixture, Chrome and desktop cancels the prior executor and
waits for its fence. Unresolved effects block switching into new mutations.
Button Stop, tray Pause/Stop and Ctrl+Alt+. reach all adapters. The spoken word
Stop works only as an explicitly reviewed captured command; Phase 4's independent
hands-free stop detector has not been implemented.

`desktop.json` stores approval, block choice and uncertainty only. Document
contents, undo values and UIA references remain in worker memory and disappear
when the worker exits. Default diagnostics do not contain titles, speech or
document text. The selected cloud speech route still sends the active recording
to Google; local speech does not fall back to cloud.

## Verification and limits

```powershell
npm run evaluate
npm run package:preview
node scripts/check-preview.mjs
node scripts/accept-desktop.mjs --voice --cloud
```

Live acceptance requires a manually created blank Untitled Notepad window or
the existing synthetic acceptance document. It refuses other document titles.
Speech input uses the fixed clean synthetic corpus, verified base.en runtime
and authorized Gemini key; this is separate from physical microphone evidence.
The script writes only public/synthetic test reports under ignored artifacts.
The native fixture activates its own window before binding; keep an interactive
desktop available. The test projects run native checks before browser fixtures
so those windows do not take its foreground. No focus or permission guard is
disabled for testing.

The fixture exercises window movement and 1.5x control-layout scaling without
coordinate input. This laptop has one physical monitor; live mixed-DPI and
multi-monitor hardware compatibility is not established. Unsupported/off-screen
controls block. No Windows display or security setting is changed by evaluation.
Broader hardware, languages and human speech accuracy remain preview limits.
See [evaluation](evaluation.md) for actual results and measured cancellation.

All Latham binaries remain unsigned developer-preview artifacts. Signing,
trusted public distribution, automatic updates and source/contribution licensing
remain separate release decisions. No Phase 4 capability is included.

## Platform references

The implementation is independent. Its platform contracts follow Microsoft's
[UIA threading guidance](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-threading),
[screen-scaling guidance](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-screenscaling)
and [ValuePattern.SetValue contract](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.valuepattern.setvalue).
The reviewed Notepad RichEdit path can use its exact native control handle when
UIA exposes readable text without a settable ValuePattern; that path is not a
general window-message API or a keyboard/clipboard fallback.
