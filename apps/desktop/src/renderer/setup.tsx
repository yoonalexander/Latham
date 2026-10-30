import { useEffect, useRef, useState } from "react";
import type { ProviderSettings, SetupBridge, SetupState } from "../../../../packages/contracts/src/setup";
declare global { interface Window { setup: SetupBridge } }
type Recording = { id: number; stream?: MediaStream; context?: AudioContext; node?: ScriptProcessorNode; chunks: Int16Array[]; samples: number; timer?: ReturnType<typeof setTimeout> };
export function SetupPanel() {
  const [state, setState] = useState<SetupState>();
  const [draft, setDraft] = useState<ProviderSettings>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState("new tab");
  const recording = useRef<Recording | null>(null);
  const clean = (): Recording | null => { const current = recording.current; recording.current = null; if (current) { clearTimeout(current.timer); current.node?.disconnect(); current.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); void current.context?.close(); } return current; };
  const act = async (operation: () => Promise<unknown>): Promise<void> => { setError(""); try { await operation(); } catch { setError("Setup could not complete. Check the saved paths, provider key, Chrome connection, and permissions, then try again."); } };
  useEffect(() => {
    const receive = (next: SetupState): void => { setState(next); if (next.voice === "idle") clean(); };
    const unsubscribe = window.setup.subscribe(receive);
    void window.setup.state().then(next => { receive(next); setDraft(next.settings); });
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
    if (recording.current || !state || state.voice !== "idle") return;
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
    <div className="section-kicker">PHASE 1 / VOICE & CHROME</div><h2>Set up Latham</h2>
    <div className="setup-grid">
      <div className="setup-group"><h3>1. Choose your AI</h3>
        <label><input type="radio" name="provider" checked={draft.mode === "local"} onChange={() => patch({ mode: "local" })} /> Use local AI</label>
        <label><input type="radio" name="provider" checked={draft.mode === "cloud"} onChange={() => patch({ mode: "cloud" })} /> Use my API key (Gemini)</label>
        <p className="mini">{draft.mode === "local" ? "Audio: local whisper.cpp. Candidate labels: Ollama at 127.0.0.1:11434. No cloud fallback. Install a local model separately." : "Audio and bounded candidate labels go to Google Gemini. Google's account terms and free-tier quotas apply. No page capture is sent in this phase."}</p>
        {draft.mode === "local" ? <><label>whisper-cli.exe path<input value={draft.whisperExecutable} onChange={event => patch({ whisperExecutable: event.target.value })} spellCheck={false} /></label><label>Whisper tiny.en model path<input value={draft.whisperModel} onChange={event => patch({ whisperModel: event.target.value })} spellCheck={false} /></label><label>Installed Ollama model<input value={draft.ollamaModel} onChange={event => patch({ ollamaModel: event.target.value })} /></label></> : <><p className="mini">{state.vaultAvailable ? state.keyStored ? "A key is stored using Windows DPAPI." : "No key stored." : "Windows credential protection is unavailable. Key storage is blocked."}</p><label>Gemini API key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label><div className="setup-buttons"><button disabled={!state.vaultAvailable || !key} onClick={() => void act(async () => { await window.setup.key(key); setKey(""); })}>Store key</button><button disabled={!state.keyStored} onClick={() => void act(() => window.setup.removeKey())}>Remove key</button><button onClick={() => void act(() => window.setup.importEnvironmentKey())}>Import GEMINI_API_KEY from .env.local</button></div></>}
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.save(draft))}>Save AI setup</button><button disabled={state.voice !== "idle"} onClick={() => void act(() => window.setup.testDecision())}>Test saved decision setup</button></div>
      </div>
      <div className="setup-group"><h3>2. Test your voice</h3><p className="mini">Hold to record up to 30 seconds. Release to transcribe using the saved AI setup. Review the words before running anything.</p>
        <label>Microphone<select value={draft.microphoneId} onChange={event => patch({ microphoneId: event.target.value })}><option value="">System default</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}</select></label>
        <p className="mini">Microphone names appear after the first permission request. Save AI setup after changing the selection.</p>
        <button className="primary talk" disabled={state.voice === "testing" || state.voice === "transcribing"} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void begin(); }} onPointerUp={() => void finish()} onPointerCancel={() => { clean(); void window.setup.cancelTurn(); }} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void begin(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); void finish(); } }}>Hold to talk</button>
        <p role="status" data-testid="voice-status">Voice: {state.voice}</p><label>Final transcript<textarea readOnly value={state.transcript} rows={3} /></label>
        <div className="setup-buttons"><button disabled={!state.transcript} onClick={() => setCommand(state.transcript)}>Use transcript as Chrome command</button><button onClick={() => { clean(); void act(() => window.setup.cancelTurn()); }}>Cancel / clear speech</button></div>
        <p className="mini" role="status">{state.notice}</p>
      </div>
      <div className="setup-group"><h3>3. Connect Chrome</h3><p className="mini">Build once, register the current-user native host, then load dist/chrome-extension from Chrome's developer extension screen. Open the extension and choose Connect. No administrator access is needed.</p>
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.installHost())}>Register Chrome host</button><button onClick={() => void act(() => window.setup.launchChrome())}>Launch Chrome</button><button disabled={!state.chromeConnected || state.chromeActive || !state.chromeFenceConfirmed || state.chromeNeedsReview} onClick={() => void act(() => window.setup.chromeResume())}>Start Chrome session</button>{state.chromeNeedsReview && <button disabled={!state.chromeFenceConfirmed} onClick={() => void act(() => window.setup.reconcileChrome())}>I inspected Chrome · clear uncertain result</button>}</div>
        <p role="status">Chrome: {state.chromeConnected ? state.chromeActive ? "Connected · Active" : state.chromeFenceConfirmed ? "Connected · Paused (fence confirmed)" : "Connected · Pause requested (fence unconfirmed)" : "Disconnected"}</p>
        <ul>{state.sites.map(site => <li key={site.origin}>{site.name}: {site.effective ? "Approved" : site.consent ? "Chrome grant missing / disconnected" : "Not approved"} <button disabled={!site.consent && !site.chromeGranted} onClick={() => void act(() => window.setup.revoke(site.origin))}>Revoke {site.name}</button></li>)}</ul>
        <p className="mini">Approve websites in the extension popup. Consent and Chrome's host grant are both required. Returning to a site retains approval; every restart starts paused.</p>
        <form onSubmit={event => { event.preventDefault(); void act(() => window.setup.chromeRun(command)); }}><label>Chrome command<input value={command} onChange={event => setCommand(event.target.value)} maxLength={2048} /></label><button disabled={!state.chromeActive} type="submit">Run Chrome command</button></form><p className="mini">new tab · next tab · previous tab · go back · go forward · open https://www.google.com</p><p role="status" data-testid="chrome-result">{state.chromeResult}</p>
      </div>
    </div>
    {(error || state.error) && <p className="error" role="alert">{error || state.error.replaceAll("_", " ")}</p>}
  </section>;
}
