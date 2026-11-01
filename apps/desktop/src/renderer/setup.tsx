import { useEffect, useRef, useState } from "react";
import { speechLanguages, type ProviderSettings, type SetupBridge, type SetupState } from "../../../../packages/contracts/src/setup";
import { DesktopPanel } from "./desktop";
import { HandsfreePanel } from "./handsfree";
import { VisualPanel } from "./visual";
import { WorkflowPanel } from "./workflow";
import { ManagedPanel } from "./managed";
import { workflowActive } from "../../../../packages/contracts/src/workflow";
declare global { interface Window { setup: SetupBridge } }
type Recording = { id: number; stream?: MediaStream; context?: AudioContext; node?: ScriptProcessorNode; chunks: Int16Array[]; samples: number; timer?: ReturnType<typeof setTimeout> };
export function SetupPanel() {
  const [state, setState] = useState<SetupState>();
  const [draft, setDraft] = useState<ProviderSettings>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState("new tab");
  const savedSettings = useRef<ProviderSettings | null>(null);
  const dirty = !!state && !!draft && Object.keys(state.settings).some(key => state.settings[key as keyof ProviderSettings] !== draft[key as keyof ProviderSettings]);
  const recording = useRef<Recording | null>(null);
  const clean = (): Recording | null => { const current = recording.current; recording.current = null; if (current) { clearTimeout(current.timer); current.node?.disconnect(); current.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); void current.context?.close(); } return current; };
  const act = async (operation: () => Promise<unknown>): Promise<void> => { setError(""); try { await operation(); } catch { setError("Setup could not complete. Check the saved paths, provider key, Chrome connection, and permissions, then try again."); } };
  useEffect(() => {
    const receive = (next: SetupState): void => {
      const previous = savedSettings.current; savedSettings.current = next.settings;
      setDraft(current => !current || !previous || Object.keys(previous).every(key => previous[key as keyof ProviderSettings] === current[key as keyof ProviderSettings]) ? { ...next.settings } : current);
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
    const current: Recording = { id: -1, chunks: [], samples: 0 }; recording.current = current;
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
        if (current.samples >= 16000 * 30) void finish();
      };
      source.connect(node); node.connect(context.destination); await context.resume(); current.timer = setTimeout(() => void finish(), 30000);
    } catch (cause) {
      if (recording.current === current) { clean(); await window.setup.cancelTurn(); const name = (cause as Error).name; setError(name === "NotAllowedError" ? "Microphone permission denied. Enable it in Windows settings, then hold to talk again." : name === "NotFoundError" || name === "OverconstrainedError" ? "Selected microphone unavailable. Choose the system default or reconnect it." : "Microphone capture failed. No audio was transcribed."); }
    }
  };
  if (!state || !draft) return <section className="panel setup-panel">Loading voice and Chrome setup…</section>;
  const patch = (value: Partial<ProviderSettings>): void => setDraft({ ...draft, ...value });
  return <section className="panel setup-panel" aria-label="Voice and Chrome setup">
    <div className="section-kicker">WINDOWS PREVIEW / 0.8</div><h2>Voice, Chrome & desktop</h2>
    <fieldset className="manual-controls" disabled={workflowActive(state.workflow.phase) || state.handsfree.phase !== "off" || state.visual.busy}>
    <div className="setup-grid">
      <div className="setup-group"><h3>1. Choose your AI</h3>
        <label><input type="radio" name="provider" checked={draft.mode === "local"} onChange={() => patch({ mode: "local" })} /> Use local AI</label>
        <label><input type="radio" name="provider" checked={draft.mode === "cloud"} onChange={() => patch({ mode: "cloud" })} /> Use my API key (Gemini)</label>
        <label><input type="radio" name="provider" checked={draft.mode === "managed"} onChange={() => patch({ mode: "managed" })} /> Latham-managed AI (optional local preview)</label>
        <p className="mini">{draft.mode === "managed" ? `Audio and bounded visible control labels: ${state.managed.origin || "sign in below"}, then Google Gemini. This route needs explicit service consent; it does not use your saved Gemini key.` : draft.mode === "local" ? "Audio: local whisper.cpp. Candidate labels: Ollama at 127.0.0.1:11434. No cloud fallback. Install a local model separately." : "Audio and bounded visible control labels go to Google Gemini. Google's account terms and free-tier quotas apply. Field values, frames and screenshots are excluded from target selection."}</p>
        {draft.mode === "local" ? <><label>whisper-cli.exe path<input value={draft.whisperExecutable} onChange={event => patch({ whisperExecutable: event.target.value })} spellCheck={false} /></label><label>Whisper English model path (base.en recommended)<input value={draft.whisperModel} onChange={event => patch({ whisperModel: event.target.value })} spellCheck={false} /></label><label>Installed Ollama model<input value={draft.ollamaModel} onChange={event => patch({ ollamaModel: event.target.value })} /></label></> : draft.mode === "managed" ? null : <><p className="mini">{state.vaultAvailable ? state.keyStored ? "A key is stored using Windows DPAPI." : "No key stored." : "Windows credential protection is unavailable. Key storage is blocked."}</p><label>Gemini API key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label><div className="setup-buttons"><button disabled={!state.vaultAvailable || !key} onClick={() => void act(async () => { await window.setup.key(key); setKey(""); })}>Store key</button><button disabled={!state.keyStored} onClick={() => void act(() => window.setup.removeKey())}>Remove key</button>{state.canImportEnvironmentKey && <button onClick={() => void act(() => window.setup.importEnvironmentKey())}>Import GEMINI_API_KEY from .env.local</button>}</div></>}
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
      <div className="setup-group"><h3>2. Test your voice</h3><p className="mini">Hold to record up to 30 seconds. Release to transcribe using the saved AI setup. Review the words before running anything.</p>
        <label>Microphone<select value={draft.microphoneId} onChange={event => patch({ microphoneId: event.target.value })}><option value="">System default</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}</select></label>
        <p className="mini">Microphone names appear after the first permission request. Save AI setup after changing the selection.</p>
        <button className="primary talk" disabled={dirty || state.voice === "testing" || state.voice === "transcribing"} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void begin(); }} onPointerUp={() => void finish()} onPointerCancel={() => { clean(); void window.setup.cancelTurn(); }} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void begin(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); void finish(); } }}>Hold to talk</button>
        <p role="status" data-testid="voice-status">Voice: {state.voice}</p><label htmlFor="transcript-preview">Final transcript</label><textarea id="transcript-preview" readOnly value={state.transcript} rows={3} />
        <div className="setup-buttons"><button disabled={!state.transcript} onClick={() => setCommand(state.transcript)}>Use transcript as Chrome command</button><button onClick={() => { clean(); void act(() => window.setup.cancelTurn()); }}>Cancel / clear speech</button></div>
        <p className="mini">Dictation: {state.desktop.bound ? "ready for the selected Notepad editor" : state.page.dictation ? `ready for ${state.page.dictation}` : "not bound"}. Prepare Search or editor dictation first, then record and review your words.</p>
        <button disabled={dirty || !state.chromeConnected || state.chromeNeedsReview || state.page.busy || (!state.chromeActive && !state.chromeFenceConfirmed)} onClick={() => void act(() => window.setup.prepareDictation())}>Prepare Search dictation</button>
        {!!state.transcript && !state.canInsertTranscript && !state.canInsertDesktopTranscript && <p className="mini" role="status">This transcript has no current field binding. Prepare Search or editor dictation, then record again to insert it safely.</p>}
        <div className="setup-buttons"><button disabled={dirty || !state.canInsertTranscript || state.page.busy} onClick={() => void act(() => window.setup.insertTranscript("append"))}>Append transcript</button><button disabled={dirty || !state.canInsertTranscript || state.page.busy} onClick={() => void act(() => window.setup.insertTranscript("replace"))}>Replace field with transcript</button></div>
        <p className="mini" role="status">{state.notice}</p>
      </div>
      <div className="setup-group"><h3>3. Connect Chrome</h3><p className="mini">Register this build's Chrome host, then load its supplied extension folder from Chrome's developer extension screen. Open the extension and choose Connect. No administrator access is needed.</p>
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.installHost())}>Register Chrome host</button><button onClick={() => void act(() => window.setup.launchChrome())}>Launch Chrome</button><button disabled={!state.chromeConnected || state.chromeActive || !state.chromeFenceConfirmed || state.chromeNeedsReview} onClick={() => void act(() => window.setup.chromeResume())}>Start Chrome session</button>{state.chromeNeedsReview && <button disabled={!state.chromeFenceConfirmed} onClick={() => void act(() => window.setup.reconcileChrome())}>I inspected Chrome · clear uncertain result</button>}</div>
        <p role="status">Chrome: {state.chromeConnected ? state.chromeActive ? "Connected · Active" : state.chromeFenceConfirmed ? "Connected · Paused (fence confirmed)" : "Connected · Pause requested (fence unconfirmed)" : "Disconnected"}</p>
        <ul>{state.sites.map(site => <li key={site.origin}>{site.name}: {site.effective ? "Approved" : site.consent ? "Chrome grant missing / disconnected" : "Not approved"} <button disabled={!site.consent && !site.chromeGranted} onClick={() => void act(() => window.setup.revoke(site.origin))}>Revoke {site.name}</button></li>)}</ul>
        <p className="mini">Approve websites in the extension popup. Consent and Chrome's host grant are both required. Returning to a site retains approval; every restart starts paused.</p>
        <div className="setup-buttons">{["inspect page", "inspect frames", "focus Search", "start dictation", "undo dictation", "stop dictation"].map(action => <button key={action} disabled={!state.chromeActive || state.page.busy} onClick={() => void act(() => window.setup.chromeRun(action))}>{action}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); if (!dirty) void act(() => window.setup.chromeRun(command)); }}><label>Chrome command<input value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} /></label><button disabled={dirty || !state.chromeActive || state.page.busy} type="submit">Run Chrome command</button></form><p className="mini">inspect page · focus Search · start dictation · dictate music · correct that to piano · undo dictation · stop dictation · click Search · search music · scroll down · open first result (reviewed same-site links) · filter images (Google) · filter remote (USAJOBS) · inspect frames · open frame 1</p><p role="status" data-testid="chrome-result">{state.chromeResult}</p>
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
    {(error || state.error) && <p className="error" role="alert">{error || state.error.replaceAll("_", " ")}</p>}
  </section>;
}
