import { useEffect, useRef, useState } from "react";
import type { SetupState } from "../../../../packages/contracts/src/setup";
import type { HandsfreeTarget } from "../../../../packages/contracts/src/handsfree";
type Capture = { id: string; sequence: number; stream?: MediaStream; context?: AudioContext; node?: ScriptProcessorNode };
export function HandsfreePanel({ state, dirty }: { state: SetupState; dirty: boolean }) {
  const [target, setTarget] = useState<HandsfreeTarget>("chrome"), [wake, setWake] = useState(false), [error, setError] = useState("");
  const capture = useRef<Capture | null>(null), mounting = useRef(true);
  const active = state.handsfree.phase !== "off";
  const clean = (): void => {
    const current = capture.current; capture.current = null;
    if (!current) return;
    current.node?.disconnect(); current.stream?.getTracks().forEach(track => { track.onended = track.onmute = null; track.stop(); });
    if (current.context) { current.context.onstatechange = null; void current.context.close(); }
  };
  useEffect(() => { if (!state.handsfree.id || (capture.current && state.handsfree.id !== capture.current.id)) clean(); }, [state.handsfree.id]);
  useEffect(() => { mounting.current = true; return () => { mounting.current = false; const id = capture.current?.id; clean(); if (id) void window.setup.handsfreeFailure(id); }; }, []);
  const begin = async (): Promise<void> => {
    if (capture.current || active || dirty) return;
    setError(""); let id: string | undefined;
    try {
      id = await window.setup.startHandsfree({ target, wake });
      if (!mounting.current) { await window.setup.handsfreeFailure(id); return; }
      if ((await window.setup.state()).handsfree.id !== id) throw new Error("session_ended");
      const current: Capture = { id, sequence: 0 }; capture.current = current;
      const fail = (): void => { if (capture.current === current) { clean(); void window.setup.handsfreeFailure(current.id); } };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(state.settings.microphoneId ? { deviceId: { exact: state.settings.microphoneId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (capture.current !== current || (await window.setup.state()).handsfree.id !== id) { stream.getTracks().forEach(track => track.stop()); clean(); return; }
      current.stream = stream; stream.getAudioTracks().forEach(track => { track.onended = track.onmute = fail; });
      const context = new AudioContext({ sampleRate: 16000 }); current.context = context;
      if (context.sampleRate !== 16000) throw new Error("unsupported_sample_rate");
      const source = context.createMediaStreamSource(stream), node = context.createScriptProcessor(2048, 1, 1); current.node = node;
      node.onaudioprocess = event => {
        if (capture.current !== current) return;
        const values = event.inputBuffer.getChannelData(0), pcm = new Int16Array(values.length);
        for (let index = 0; index < values.length; index++) pcm[index] = Math.round(Math.max(-1, Math.min(1, values[index]!)) * 32767);
        window.setup.handsfreeFrame(current.id, current.sequence++, pcm.buffer);
      };
      source.connect(node); node.connect(context.destination); await context.resume();
      context.onstatechange = () => { if (context.state !== "running") fail(); };
      if (context.state !== "running") fail();
    } catch {
      clean(); if (id) await window.setup.handsfreeFailure(id);
      setError("Session could not start. Prepare the selected app, check microphone access and the installed English speech recognizer, then try again.");
    }
  };
  return <section className="setup-group handsfree-panel" aria-label="Hands-free session">
    <div className="section-kicker">OPT-IN SESSION / LOCAL STOP</div><h3>5. Hands-free commands</h3>
    <p className="mini">While enabled, successive spoken commands run automatically in the selected app using its existing permissions. Say <strong>stop assistant</strong> to cancel and turn the microphone off. Physical Stop and Ctrl+Alt+. remain available. Background voices and speaker playback can trigger recognition; this preview cannot identify the speaker.</p>
    <label>Command app<select disabled={active} value={active ? state.handsfree.target : target} onChange={event => setTarget(event.target.value as HandsfreeTarget)}><option value="chrome">Current Chrome session</option><option value="desktop">Prepared Notepad editor</option></select></label>
    <label><input type="checkbox" checked={active ? state.handsfree.wake : wake} disabled={active} onChange={event => setWake(event.target.checked)} /> Wait for local “hey Latham” first</label>
    <p className="mini">Wake mode keeps idle audio local. After the wake phrase, pause before speaking. Active command audio uses your saved {state.settings.mode === "cloud" ? "Gemini cloud" : "local Whisper"} route. The English local stop detector stays active during transcription and actions. No assistant speech playback is enabled.</p>
    <div className="setup-buttons"><button className="primary" disabled={active || dirty || state.voice !== "idle"} onClick={() => void begin()}>Enable hands-free microphone</button><button disabled={!active} onClick={() => { clean(); void window.latham.stop(); }}>End hands-free session</button></div>
    <p role="status" data-testid="handsfree-status">Microphone: {active ? state.handsfree.audioReady ? "ON" : "starting" : "OFF"} · {state.handsfree.phase} · Local stop: {state.handsfree.stopReady ? "ready" : "off"}</p>
    <p role="status">{state.handsfree.message}</p><p className="mini">Ends after 90 seconds idle or five minutes total. Commands are limited to 15 seconds. Mic or detector failure cancels work. No automatic restart.</p>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
