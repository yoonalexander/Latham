import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { speechLanguages, type ProviderSettings, type SetupBridge, type SetupState } from "../../../../packages/contracts/src/setup";
import { DesktopPanel } from "./desktop";
import { HandsfreePanel } from "./handsfree";
import { VisualPanel } from "./visual";
import { WorkflowPanel } from "./workflow";
import { ManagedPanel } from "./managed";
import { CompatibilityPanel } from "./compatibility";
import { ComputerPanel, ComputerStart } from "./computer";
import { browsers, type BrowserId } from "../../../../packages/contracts/src/compatibility";
import { workflowActive } from "../../../../packages/contracts/src/workflow";
declare global { interface Window { setup: SetupBridge } }
type Recording = { id: number; sequence: number; stream?: MediaStream; context?: AudioContext; node?: ScriptProcessorNode; chunks: Int16Array[]; samples: number; timer?: ReturnType<typeof setTimeout> };
const settingsPages = ["General", "Voice", "App access", "Shortcuts", "Advanced settings"] as const;
type SettingsPage = typeof settingsPages[number];

export function SetupPanel({ fixtureControls }: { fixtureControls: ReactNode }) {
  const [page, setPage] = useState<SettingsPage>("General");
  const pageContent = useRef<HTMLDivElement>(null);
  const focusPage = useRef(false);
  const [state, setState] = useState<SetupState>();
  const [draft, setDraft] = useState<ProviderSettings>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [key, setKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [microphone, setMicrophone] = useState<string>();
  const [error, setError] = useState("");
  const [command, setCommand] = useState("new tab");
  const savedSettings = useRef<ProviderSettings | null>(null);
  const dirty = !!state && !!draft && Object.keys(state.settings).some(key => state.settings[key as keyof ProviderSettings] !== draft[key as keyof ProviderSettings]);
  const recording = useRef<Recording | null>(null);
  const clean = (): Recording | null => { const current = recording.current; recording.current = null; if (current) { clearTimeout(current.timer); current.node?.disconnect(); current.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); void current.context?.close(); } return current; };
  const act = async (operation: () => Promise<unknown>): Promise<void> => {
    setError(""); try { await operation(); } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(code.includes("invalid_key") ? "Enter a valid Gemini API key." : code.includes("inspect_previous_result_first") ? "Inspect the last browser or editor result before switching browsers." : code.includes("executor_fence_unconfirmed") ? "The browser has not confirmed Stop. Reconnect it and try again." : "Could not complete that step. Check your settings and try again.");
    }
  };
  const showPage = (next: SettingsPage, focusContent = false): void => {
    if (next === page) return;
    if (recording.current) { clean(); void act(() => window.setup.cancelTurn()); }
    focusPage.current = focusContent;
    setPage(next);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (focusPage.current) pageContent.current?.focus({ preventScroll: true });
    focusPage.current = false;
  }, [page]);
  useEffect(() => {
    const receive = (next: SetupState): void => {
      const previous = savedSettings.current; savedSettings.current = next.settings;
      setDraft(current => {
        const merged = { ...next.settings };
        if (current && previous) {
          for (const key of Object.keys(previous) as (keyof ProviderSettings)[]) {
            if (current[key] !== previous[key]) Object.assign(merged, { [key]: current[key] });
          }
        }
        return merged;
      });
      setState(next); if (next.voice === "idle") clean();
    };
    const unsubscribe = window.setup.subscribe(receive);
    void window.setup.state().then(receive);
    const blur = (): void => { if (recording.current) { clean(); void window.setup.cancelTurn(); } };
    window.addEventListener("blur", blur);
    return () => { unsubscribe(); clean(); void window.setup.cancelTurn(); window.removeEventListener("blur", blur); };
  }, []);
  const finish = async (): Promise<void> => {
    const current = clean(); if (!current) return;
    const pcm = new Int16Array(current.samples); let offset = 0; for (const chunk of current.chunks) { pcm.set(chunk, offset); offset += chunk.length; }
    await act(() => window.setup.finishTurn(current.id, pcm.buffer));
  };
  const begin = async (): Promise<void> => {
    if (recording.current || !state || state.voice !== "idle" || dirty) return;
    setError("");
    const current: Recording = { id: -1, sequence: 0, chunks: [], samples: 0 }; recording.current = current;
    try {
      current.id = await window.setup.beginTurn(); if (recording.current !== current) { await window.setup.cancelTurn(); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(state.settings.microphoneId ? { deviceId: { exact: state.settings.microphoneId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (recording.current !== current) { stream.getTracks().forEach(track => track.stop()); return; }
      current.stream = stream;
      stream.getAudioTracks().forEach(track => { track.onended = () => { clean(); setError("Microphone disconnected. This turn was cancelled."); void window.setup.cancelTurn(); }; });
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput"));
      const context = new AudioContext({ sampleRate: 16000 }); current.context = context;
      if (context.sampleRate !== 16000) throw new Error("unsupported_sample_rate");
      const source = context.createMediaStreamSource(stream), node = context.createScriptProcessor(2048, 1, 1); current.node = node;
      node.onaudioprocess = event => {
        if (recording.current !== current) return;
        const data = event.inputBuffer.getChannelData(0), count = Math.min(data.length, 16000 * 30 - current.samples), chunk = new Int16Array(count);
        for (let index = 0; index < count; index++) chunk[index] = Math.round(Math.max(-1, Math.min(1, data[index]!)) * 32767);
        current.chunks.push(chunk); current.samples += count;
        window.setup.voiceFrame(current.id, current.sequence++, chunk.buffer);
        if (current.samples >= 16000 * 30) void finish();
      };
      source.connect(node); node.connect(context.destination); await context.resume(); current.timer = setTimeout(() => void finish(), 30000);
    } catch (cause) {
      if (recording.current === current) { clean(); await window.setup.cancelTurn(); const name = (cause as Error).name; setError(name === "NotAllowedError" ? "Microphone permission denied. Enable it in Windows settings, then hold to talk again." : name === "NotFoundError" || name === "OverconstrainedError" ? "Selected microphone unavailable. Choose the system default or reconnect it." : "Microphone capture failed. No audio was transcribed."); }
    }
  };
  if (!state || !draft) return <main id="assistant-setup" tabIndex={-1} className="settings-loading">Loading settings…</main>;
  const patch = (value: Partial<ProviderSettings>): void => setDraft({ ...draft, ...value });
  const manualBusy = workflowActive(state.workflow.phase) || state.handsfree.phase !== "off" || state.visual.busy;
  const { mode, whisperExecutable, whisperModel, microphoneId } = state.settings;
  const voiceReady = mode === "cloud" ? state.keyStored : mode === "local" ? !!(whisperExecutable && whisperModel) : state.managed.signedIn;
  const voiceProvider = mode === "cloud" ? "Gemini" : mode === "local" ? "Local Whisper" : "Latham-managed AI";
  const geminiConfigured = mode === "cloud" && state.keyStored;
  const selectedMicrophone = microphone ?? microphoneId;
  const saveVoice = (operation: () => Promise<unknown>): void => {
    if (savingVoice) return;
    setSavingVoice(true);
    void act(operation).finally(() => setSavingVoice(false));
  };
  const connectGemini = (event: FormEvent): void => {
    event.preventDefault();
    if (!key.trim() || !state.vaultAvailable || state.providerSettingsLocked || manualBusy) return;
    saveVoice(async () => {
      await window.setup.key(key.trim());
      setKey("");
      await window.setup.save({ ...state.settings, mode: "cloud" });
      setEditingKey(false);
    });
  };

  return <div className="settings-layout">
    <div className="settings-sidebar">
      <nav className="settings-rail" aria-label="Settings categories">
        {settingsPages.map(item => <button key={item} aria-current={page === item ? "page" : undefined} onClick={() => showPage(item)}>{item}</button>)}
      </nav>
    </div>
    <main id="assistant-setup" ref={pageContent} tabIndex={-1} className="settings-content" aria-label={`${page} settings`}>
    {state.providerSettingsLocked && <p className="error" role="alert">Saved AI settings could not be read. See the Windows recovery guide.</p>}
    {(error || state.error) && <p className="error" role="alert">{error || state.error.replaceAll("_", " ")}</p>}
    {page !== "General" && state.computer.needsReview && <div className="settings-recovery" role="status">
      Check the previous app result before starting another command. <button onClick={() => showPage("General", true)}>Review in General</button>
    </div>}

    <div hidden={page !== "General"}>
      <ComputerStart state={state} act={act} voiceReady={voiceReady} showVoice={() => showPage("Voice", true)} />
      <section className="settings-card" aria-labelledby="current-setup">
        <h3 id="current-setup">Current setup</h3>
        <dl className="settings-rows">
          <div><dt>Voice</dt><dd>{voiceReady ? voiceProvider : "Disconnected"}</dd></div>
          <div><dt>Window images</dt><dd>{state.computer.allowed && state.computer.images ? "On" : "Off"}</dd></div>
        </dl>
      </section>
    </div>

    <div hidden={page !== "Voice"}>
      <h2>Voice</h2>
      <fieldset className="manual-controls voice-settings" disabled={manualBusy || savingVoice}>
        <section className="settings-card setup-group" aria-label="Voice provider">
          <h3>Voice provider</h3>
          {voiceReady && <p role="status">{voiceProvider} configured</p>}
          {geminiConfigured && !editingKey ? <div className="setup-buttons">
            <button disabled={state.providerSettingsLocked} onClick={() => setEditingKey(true)}>Change key</button>
            <button onClick={() => saveVoice(() => window.setup.removeKey())}>Disconnect Gemini</button>
          </div> : <>
            <form className="quick-voice" onSubmit={connectGemini}>
              <label>Gemini API key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
              <p className="muted">Google Gemini processes your voice. Windows protects your saved key.</p>
              <div className="setup-buttons">
                <button type="submit" className="primary" disabled={!state.vaultAvailable || state.providerSettingsLocked || !key.trim()}>{geminiConfigured ? "Save key" : "Connect Gemini"}</button>
                {editingKey && <button type="button" onClick={() => { setEditingKey(false); setKey(""); }}>Cancel</button>}
              </div>
            </form>
            {state.keyStored && !geminiConfigured && <button className="settings-fit" disabled={state.providerSettingsLocked} onClick={() => saveVoice(() => window.setup.save({ ...state.settings, mode: "cloud" }))}>Use saved Gemini key</button>}
          </>}
          {!state.vaultAvailable && <p className="muted">Windows credential protection is unavailable.</p>}
          {state.canImportEnvironmentKey && <details className="access-options">
            <summary>Development setup</summary>
            <button disabled={!state.vaultAvailable || state.providerSettingsLocked} onClick={() => saveVoice(async () => {
              await window.setup.importEnvironmentKey();
              await window.setup.save({ ...state.settings, mode: "cloud" });
            })}>Import GEMINI_API_KEY from .env.local</button>
          </details>}
        </section>
        <section className="settings-card setup-group" aria-label="Microphone settings">
          <h3>Microphone</h3>
          <select aria-label="Microphone" value={selectedMicrophone} onChange={event => setMicrophone(event.target.value)}>
            <option value="">System default</option>
            {devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}
            {selectedMicrophone && !devices.some(device => device.deviceId === selectedMicrophone) && <option value={selectedMicrophone}>Saved microphone</option>}
          </select>
          <p className="muted">Microphone names appear after a voice test in Advanced settings.</p>
          {selectedMicrophone !== microphoneId && <button className="primary settings-fit" disabled={state.providerSettingsLocked || state.voice !== "idle"} onClick={() => saveVoice(async () => {
            await window.setup.save({ ...state.settings, microphoneId: selectedMicrophone });
            setMicrophone(undefined);
          })}>Save microphone</button>}
        </section>
      </fieldset>
    </div>

    <div hidden={page !== "App access"}>
      <h2>App access</h2>
      <fieldset className="manual-controls" disabled={manualBusy}>
        <ComputerPanel state={state} act={act} />
      </fieldset>
    </div>

    <div hidden={page !== "Shortcuts"}>
      <h2>Shortcuts</h2>
      <div className="settings-card">
        <dl className="settings-rows">
          <div><dt>Talk while pressed</dt><dd><kbd>Hold Ctrl</kbd></dd></div>
          <div><dt>Talk for one command</dt><dd><kbd>Ctrl + Alt + Space</kbd></dd></div>
          <div><dt>Stop</dt><dd><kbd>Ctrl + Alt + .</kbd></dd></div>
          <div><dt>Confirm a pending action</dt><dd><kbd>Ctrl + Alt + Enter</kbd></dd></div>
        </dl>
      </div>
    </div>

    <div hidden={page !== "Advanced settings"} className="advanced-settings-content">
      <h2>Advanced settings</h2>
    <fieldset className="manual-controls" disabled={manualBusy}>
    <div className="setup-grid">
      <div className="setup-group"><h3>1. Choose your AI</h3>
        <label><input type="radio" name="provider" checked={draft.mode === "local"} onChange={() => patch({ mode: "local" })} /> Use local AI</label>
        <label><input type="radio" name="provider" checked={draft.mode === "cloud"} onChange={() => patch({ mode: "cloud" })} /> Use my API key (Gemini)</label>
        <label><input type="radio" name="provider" checked={draft.mode === "managed"} onChange={() => patch({ mode: "managed" })} /> Latham-managed AI (optional local preview)</label>
        <p className="mini">{draft.mode === "managed" ? `Audio and bounded visible control labels: ${state.managed.origin || "sign in below"}, then Google Gemini. This route needs explicit service consent; it does not use your saved Gemini key.` : draft.mode === "local" ? "Audio: local whisper.cpp. Candidate labels: Ollama at 127.0.0.1:11434. No cloud fallback. Install a local model separately." : "Audio and bounded visible control labels go to Google Gemini. Google's account terms and free-tier quotas apply. Field values, frames and screenshots are excluded from target selection."}</p>
        {draft.mode === "local" ? <><label>whisper-cli.exe path<input value={draft.whisperExecutable} onChange={event => patch({ whisperExecutable: event.target.value })} spellCheck={false} /></label><label>Whisper English model path (base.en recommended)<input value={draft.whisperModel} onChange={event => patch({ whisperModel: event.target.value })} spellCheck={false} /></label><label>Installed Ollama model<input value={draft.ollamaModel} onChange={event => patch({ ollamaModel: event.target.value })} /></label></> : draft.mode === "cloud" && <button className="settings-fit" onClick={() => showPage("Voice", true)}>Manage Gemini key</button>}
        <details><summary>Local speech model options</summary>
          <label>Speech language<select value={draft.speechLanguage} onChange={event => patch({ speechLanguage: event.target.value })}>{speechLanguages.map(language => <option key={language} value={language}>{language === "auto" ? "Detect language (multilingual model)" : language}</option>)}</select></label>
          <label>Vocabulary hints (local only)<input value={draft.speechVocabulary} maxLength={400} onChange={event => patch({ speechVocabulary: event.target.value })} /></label>
          <label>Speech CPU threads<select value={draft.speechThreads} onChange={event => patch({ speechThreads: Number(event.target.value) })}>{[1, 2, 3, 4].map(threads => <option key={threads} value={threads}>{threads}</option>)}</select></label>
          <p className="mini">English .en models require en. Other languages need separately installed multilingual weights. Hints can bias recognition; they never authorize an action. Two threads leave CPU room for the local stop detector. Models load per turn and release on cancellation.</p>
          <button disabled={dirty || state.voice !== "idle"} onClick={() => void act(() => window.setup.checkLocalModel())}>Check saved local model</button><p role="status">{state.localModel}</p>
        </details>
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.save(draft))}>Save AI setup</button><button disabled={state.voice !== "idle" || dirty} onClick={() => void act(() => window.setup.testDecision())}>Test saved decision setup</button></div>
        {dirty && <p className="mini" role="status">Unsaved AI setup changes. Save before recording; saving pauses current work.</p>}
      </div>
      <div className="setup-group"><h3>2. Test your voice</h3><p className="mini">Gemini streams words while you speak and finalizes on release. Local/managed mode uses a provisional Windows caption and your chosen final transcription provider. Interim words may change; only final words can run a command.</p>
        <button className="primary talk" disabled={dirty || state.voice === "testing" || state.voice === "transcribing"} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void begin(); }} onPointerUp={() => void finish()} onPointerCancel={() => { clean(); void window.setup.cancelTurn(); }} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void begin(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); void finish(); } }}>Hold to talk</button>
        <p role="status" data-testid="voice-status">Voice: {state.voice}</p><p className="mini" data-testid="speech-preview" aria-live="polite">{state.speechPreview.status === "final" ? "Final words" : draft.mode === "cloud" ? "Gemini live transcript (may change)" : "Local live preview (may change)"}: {state.speechPreview.text || (state.speechPreview.status === "unavailable" ? draft.mode === "cloud" ? "Live transcription unavailable. Check your key, quota and connection." : "Preview unavailable for the installed speech language; final transcription still works." : state.voice === "recording" ? "Listening…" : "Microphone off")}</p><label htmlFor="transcript-preview">Final transcript</label><textarea id="transcript-preview" readOnly value={state.transcript} rows={3} />
        <div className="setup-buttons"><button disabled={!state.transcript} onClick={() => setCommand(state.transcript)}>Use transcript as browser command</button><button onClick={() => { clean(); void act(() => window.setup.cancelTurn()); }}>Cancel / clear speech</button></div>
        <p className="mini">Dictation: {state.desktop.bound ? "ready for the selected Notepad editor" : state.page.dictation ? `ready for ${state.page.dictation}` : "not bound"}. Prepare Search or editor dictation first, then record and review your words.</p>
        <button disabled={dirty || !state.chromeConnected || state.chromeNeedsReview || state.page.busy || (!state.chromeActive && !state.chromeFenceConfirmed)} onClick={() => void act(() => window.setup.prepareDictation())}>Prepare Search dictation</button>
        {!!state.transcript && !state.canInsertTranscript && !state.canInsertDesktopTranscript && <p className="mini" role="status">This transcript has no current field binding. Prepare Search or editor dictation, then record again to insert it safely.</p>}
        <div className="setup-buttons"><button disabled={dirty || !state.canInsertTranscript || state.page.busy} onClick={() => void act(() => window.setup.insertTranscript("append"))}>Append transcript</button><button disabled={dirty || !state.canInsertTranscript || state.page.busy} onClick={() => void act(() => window.setup.insertTranscript("replace"))}>Replace field with transcript</button></div>
        <p className="mini" role="status">{state.notice}</p>
      </div>
      <div className="setup-group"><h3>3. Connect a browser</h3><label>Controlled browser<select value={state.browser} onChange={event => void act(() => window.setup.chooseBrowser(event.target.value as BrowserId))}>{state.browserChoices.map(browser => <option key={browser.id} value={browser.id}>{browser.label}{browser.installed ? "" : " (not found in standard locations)"}</option>)}</select></label><p className="mini">Register this build's host for {browsers[state.browser]}, load the supplied extension from that browser's developer extension screen, then choose Connect. Switching pauses and disconnects; approve sites separately in each browser. Use one browser profile at a time. No administrator access is needed.</p>
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.installHost())}>Register {browsers[state.browser]} host</button><button onClick={() => void act(() => window.setup.launchBrowser())}>Launch {browsers[state.browser]}</button><button disabled={!state.chromeConnected || state.chromeActive || !state.chromeFenceConfirmed || state.chromeNeedsReview} onClick={() => void act(() => window.setup.chromeResume())}>Start {browsers[state.browser]} session</button>{state.chromeNeedsReview && <button disabled={!state.chromeFenceConfirmed} onClick={() => void act(() => window.setup.reconcileChrome())}>I inspected Chrome · clear uncertain result</button>}</div>
        <p role="status">{browsers[state.browser]}: {state.chromeConnected ? state.chromeActive ? "Connected · Active" : state.chromeFenceConfirmed ? "Connected · Paused (fence confirmed)" : "Connected · Pause requested (fence unconfirmed)" : "Disconnected"}</p>
        <ul>{state.sites.map(site => <li key={site.origin}>{site.name}: {site.effective ? "Approved" : site.consent ? "Chrome grant missing / disconnected" : "Not approved"} <button disabled={!site.consent && !site.chromeGranted} onClick={() => void act(() => window.setup.revoke(site.origin))}>Revoke {site.name}</button></li>)}</ul>
        <p className="mini">Approve websites in the extension popup. Consent and Chrome's host grant are both required. Returning to a site retains approval; every restart starts paused.</p>
        <div className="setup-buttons">{["inspect page", "inspect frames", "focus Search", "start dictation", "undo dictation", "stop dictation"].map(action => <button key={action} disabled={!state.chromeActive || state.page.busy} onClick={() => void act(() => window.setup.chromeRun(action))}>{action}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); if (!dirty) void act(() => window.setup.chromeRun(command)); }}><label>Browser command<input value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} /></label><button disabled={dirty || !state.chromeActive || state.page.busy} type="submit">Run browser command</button></form><p className="mini">inspect page · focus Search · start dictation · dictate music · correct that to piano · undo dictation · stop dictation · click Search · search music · scroll down · open first result (reviewed same-site links) · filter images (Google) · filter remote (USAJOBS) · inspect frames · open frame 1</p><p role="status" data-testid="chrome-result">{state.chromeResult}</p>
        <p role="status" data-testid="page-status">{state.page.status}{state.page.busy ? " · Working" : ""}</p>
        {state.page.last && <p className="mini" data-testid="page-result">{state.page.last.outcome}: {state.page.last.reason} ({state.page.last.elapsedMs} ms)</p>}
        {state.page.clarification.length > 0 && <div aria-label="Choose a matching target">{state.page.clarification.map((label, index) => <button key={index} onClick={() => void act(() => window.setup.chromeRun(`choose ${index + 1}`))}>{label}</button>)}</div>}
        <p className="mini">New catalog sites support public search and reviewed result navigation. Search fields there are focus-only; dictation remains limited to Google/YouTube. Inspect frames reads eligible same-origin frames only; open frame 1 opens one in the main tab. Closed components, account actions and applications remain unsupported.</p><details><summary>Supported controls on the last observed page</summary><ul>{state.page.targets.map((target, index) => <li key={index}>{target.name} · {target.role}</li>)}</ul></details>
      </div>
    </div>
    <ManagedPanel state={state} act={act} />
    <DesktopPanel state={state} dirty={dirty} act={act} />
    </fieldset>
    <HandsfreePanel state={state} dirty={dirty} />
    <VisualPanel state={state} act={act} />
    <WorkflowPanel state={state} dirty={dirty} />
    <CompatibilityPanel state={state} act={act} />
      {fixtureControls}
    </div>
    </main>
  </div>;
}
