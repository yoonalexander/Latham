import { useEffect, useState } from "react";
import type { SetupState } from "../../../../packages/contracts/src/setup";
type PanelProps = { state: SetupState; act(operation: () => Promise<unknown>): Promise<void> };

export function ComputerStart({ state, act, saveGemini }: PanelProps & { saveGemini(key: string): Promise<void> }) {
  const computer = state.computer;
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = ["thinking", "observing", "acting", "review"].includes(computer.phase);
  const canRun = computer.allowed && computer.fenceConfirmed && !computer.needsReview && !busy;
  const { mode, whisperExecutable, whisperModel } = state.settings;
  const needsVoiceSetup = mode === "cloud" ? !state.keyStored : mode === "local" ? !whisperExecutable || !whisperModel : !state.managed.signedIn;
  const enable = (): void => {
    void act(() => window.setup.computerConfigure({ allowed: true, images: false, browserAllowed: false, route: computer.route, model: computer.model, deniedApps: computer.deniedApps }));
  };
  return <section className="quick-start" aria-label="Universal computer use">
    <h2>{computer.allowed ? needsVoiceSetup ? "Try Latham" : "Hold Ctrl to talk" : "Start using Latham"}</h2>
    {computer.needsReview && !busy && <div className="onboarding-agreement" role="region" aria-label="Previous task recovery">
      <h3>Check the app you were using</h3><p>Look at the app to see what changed before starting another command.</p>
      {!computer.fenceConfirmed && <p role="status">Waiting for the previous input worker to stop.</p>}
      <button disabled={!computer.fenceConfirmed} onClick={() => void act(() => window.setup.computerReconcile())}>I've checked — continue</button>
    </div>}
    {!computer.allowed ? <div role="region" aria-label="Latham first-run agreement">
      <p>Let Latham read and control the active app when you ask. AI tasks share visible text and field values with {computer.route === "cloud" ? "Google Gemini" : "your local Ollama model"}.</p>
      <button className="primary" disabled={busy || !computer.fenceConfirmed || computer.needsReview} onClick={enable}>Enable Latham</button>
    </div> : <>
      <p>{needsVoiceSetup ? "Open Notepad now, or connect Gemini to use your voice." : <>Hold <kbd>Ctrl</kbd>, say “open Notepad,” then release.</>}</p>
      <div className="setup-buttons">
        <button disabled={!canRun} onClick={() => void act(() => window.setup.computerRun("Open Notepad"))}>Open Notepad</button>
        {!needsVoiceSetup && <button disabled={!canRun} onClick={() => void act(() => window.setup.talkFromCompanion())}>Talk with companion</button>}
      </div>
      {needsVoiceSetup && <form className="quick-voice" onSubmit={event => {
        event.preventDefault();
        if (!state.vaultAvailable || saving || !key.trim()) return;
        setSaving(true);
        void act(async () => { await saveGemini(key.trim()); setKey(""); }).finally(() => setSaving(false));
      }}>
        <label>Gemini API key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
        <button type="submit" className="primary" disabled={!state.vaultAvailable || saving || !key.trim()}>Connect Gemini</button>
        <p className="mini">Google Gemini processes your voice. The key is stored by Windows.</p>
      </form>}
    </>}
    <p role="status" data-testid="computer-status">{["complete", "blocked"].includes(computer.phase) ? computer.message : ""}</p>
  </section>;
}

export function ComputerPanel({ state, act }: { state: SetupState; act(operation: () => Promise<unknown>): Promise<void> }) {
  const firstRun = !state.computer.agreementAccepted, savedDenials = state.computer.deniedApps.join(", ");
  const [allowed, setAllowed] = useState(state.computer.allowed), [images, setImages] = useState(state.computer.images), [browser, setBrowser] = useState(state.computer.browserAllowed), [route, setRoute] = useState(state.computer.route), [model, setModel] = useState(state.computer.model), [denied, setDenied] = useState(savedDenials), [goal, setGoal] = useState("Explain the current window");
  useEffect(() => { setAllowed(state.computer.allowed); setImages(state.computer.images); setBrowser(state.computer.browserAllowed); setRoute(state.computer.route); setModel(state.computer.model); setDenied(savedDenials); }, [state.computer.allowed, state.computer.images, state.computer.browserAllowed, state.computer.route, state.computer.model, savedDenials]);
  const busy = state.computer.phase === "thinking" || state.computer.phase === "observing" || state.computer.phase === "acting" || state.computer.phase === "review";
  return <section className="setup-group" aria-label="Computer access"><h3>Universal assistant</h3>
    <fieldset className="computer-access-fields" disabled={firstRun || busy}>
    <label><input type="checkbox" checked={allowed} onChange={event => setAllowed(event.target.checked)} /> Enable universal assistant on this device (remember after restart)</label>
    <label><input type="checkbox" checked={images} onChange={event => setImages(event.target.checked)} /> Also allow foreground-window images (visible content, with detected password fields masked)</label>
    <label><input type="checkbox" checked={browser} onChange={event => setBrowser(event.target.checked)} /> Include browser windows without the extension</label>
    <label>Computer-use provider<select value={route} onChange={event => { setRoute(event.target.value as "cloud" | "local"); setModel(event.target.value === "cloud" ? "gemini-3.1-flash-lite" : state.settings.ollamaModel); }}><option value="cloud">My Gemini key</option><option value="local">Installed local Ollama model</option></select></label>
    <p className="mini">{route === "cloud" ? "Gemini receives your task, app text, field values, and any images you enable." : "Ollama processes app context locally. Images require a vision model."}</p>
    <label>Computer-use model<input value={model} readOnly={route === "cloud"} onChange={event => setModel(event.target.value)} maxLength={100} /></label>
    <label>Blocked process names (comma separated)<input value={denied} onChange={event => setDenied(event.target.value)} maxLength={1000} /></label>
    <div className="setup-buttons">
      <button onClick={() => void act(() => window.setup.computerConfigure({ allowed, images, browserAllowed: browser, route, model, deniedApps: denied.split(",").map(value => value.trim()).filter(Boolean) }))}>Save universal access settings</button>
      <button onClick={() => void act(() => window.setup.computerDisable())}>Disable universal mode / Stop</button>
    </div>
    <label>Universal task<input value={goal} maxLength={2000} onChange={event => setGoal(event.target.value)} /></label><button disabled={!state.computer.allowed || busy || state.computer.needsReview || !state.computer.fenceConfirmed} onClick={() => void act(() => window.setup.computerRun(goal))}>Run universal task</button><button onClick={() => void act(() => window.setup.computerReview())}>Show action / result</button>
    {state.computer.deniedOrigins.map(origin => <p key={origin}>Blocked website: {origin} <button disabled={busy} onClick={() => void act(() => window.setup.computerUnblock(origin))}>Explicitly clear this site block</button></p>)}
    </fieldset>
  </section>;
}
