import { useState } from "react";
import type { SetupState } from "../../../../packages/contracts/src/setup";

export function DesktopPanel({ state, dirty, act }: { state: SetupState; dirty: boolean; act: (operation: () => Promise<unknown>) => Promise<void> }) {
  const native = state.desktop;
  const [selected, setSelected] = useState("");
  const [command, setCommand] = useState("dictate Hello from Latham");
  const windowId = native.windows.some(window => window.id === selected) ? selected : native.windows[0]?.id ?? "";
  const unavailable = !native.approved || native.denied || native.busy || !native.fenceConfirmed || native.needsReview;
  return <section className="setup-group desktop-panel" aria-label="Desktop applications">
    <div className="section-kicker">DESKTOP PREVIEW / PLAIN TEXT</div><h3>4. Use Notepad</h3>
    <p className="mini">Approve Notepad, open a plain document, then refresh and choose its window. Preparing brings that editor forward and binds its text field. Return here to hold to talk, review your transcript and insert it below. File saving, AI features and other apps are excluded.</p>
    <div className="setup-buttons">
      <label><input type="checkbox" checked={native.approved} disabled={native.denied} onChange={event => void act(() => window.setup.desktopPermission(event.target.checked, native.denied))} /> Allow Notepad</label>
      <label><input type="checkbox" checked={native.denied} onChange={event => void act(() => window.setup.desktopPermission(false, event.target.checked))} /> Block Notepad</label>
      <button disabled={!native.approved} onClick={() => void act(() => window.setup.desktopPermission(false, false))}>Revoke Notepad</button>
    </div>
    <p className="mini">Approval is remembered; every launch starts paused. The block list overrides approval. Browsers, terminals, password managers, elevated windows and secure fields cannot use this adapter.</p>
    <div className="setup-buttons"><button disabled={unavailable} onClick={() => void act(() => window.setup.desktopOpen())}>Open Notepad</button><button disabled={unavailable} onClick={() => void act(() => window.setup.desktopScan())}>Refresh editor windows</button></div>
    <label>Editor window<select value={windowId} onChange={event => setSelected(event.target.value)} disabled={unavailable || !native.windows.length}><option value="">Choose a refreshed window</option>{native.windows.map(window => <option key={window.id} value={window.id}>{window.name}</option>)}</select></label>
    <div className="setup-buttons"><button disabled={dirty || unavailable || !windowId} onClick={() => void act(() => window.setup.desktopPrepare(windowId))}>Prepare editor dictation</button><button disabled={dirty || !state.canInsertDesktopTranscript || native.busy} onClick={() => void act(() => window.setup.desktopInsertTranscript("append"))}>Append transcript to editor</button><button disabled={dirty || !state.canInsertDesktopTranscript || native.busy} onClick={() => void act(() => window.setup.desktopInsertTranscript("replace"))}>Replace editor with transcript</button><button disabled={!native.active || native.busy} onClick={() => void act(() => window.setup.desktopRun("undo dictation"))}>Undo editor dictation</button></div>
    {native.needsReview && <button disabled={!native.fenceConfirmed || native.active} onClick={() => void act(() => window.setup.desktopReconcile())}>I inspected the editor · clear uncertain result</button>}
    <p role="status" data-testid="desktop-status">Desktop: {native.active ? "Ready · editor bound" : native.fenceConfirmed ? "Paused · fence confirmed" : "Stopping · fence unconfirmed"}{native.busy ? " · Working" : ""}</p>
    <p role="status" data-testid="desktop-result">{native.result}</p>
    {native.last && <p className="mini">{native.last.outcome} · {native.last.elapsedMs} ms</p>}
    <details><summary>Typed editor commands</summary><form onSubmit={event => { event.preventDefault(); if (!dirty) void act(() => window.setup.desktopRun(command)); }}><label>Editor command<input value={command} maxLength={2000} onChange={event => setCommand(event.target.value)} /></label><button type="submit" disabled={dirty || !native.active || native.busy}>Run editor command</button></form><p className="mini">inspect editor · focus editor · dictate text · replace dictation with text · correct that to text · undo dictation · stop dictation</p><button disabled={!state.transcript} onClick={() => setCommand(state.transcript)}>Use transcript as editor command</button></details>
  </section>;
}
