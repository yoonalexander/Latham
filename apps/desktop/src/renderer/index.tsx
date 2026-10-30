import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopBridge, DesktopState, Reason, Settings } from "@latham/contracts";
import "./style.css";
import { SetupPanel } from "./setup";
declare global { interface Window { latham: DesktopBridge } }
const reasons: Record<Reason, string> = {
  scope_denied: "Allow the local fixture before starting a session.",
  session_paused: "Start a session before running a command.",
  invalid_request: "Use a supported command, up to 2,000 characters.",
  unknown_command: "That command is not supported in this foundation.",
  ambiguous_target: "Two controls match. Try: click first Apply filter, or click second Apply filter.",
  target_missing: "No visible, enabled control matches this command.",
  unknown_effect: "The effect is unknown. This action stays blocked.",
  consequential_effect: "Consequential actions are excluded from this phase.",
  secure_field: "Secure fields are excluded. Nothing was entered.",
  stale_target: "The page or target changed. Nothing was dispatched.",
  cancelled: "Pending work was cancelled. Already-dispatched input cannot be rolled back.",
  verification_failed: "An action was dispatched, but its intended result could not be verified. Reset the fixture before continuing.",
  executor_unavailable: "The executor did not provide a verified result. Reset the fixture before continuing."
};
const statusLabels: Record<DesktopState["status"], string> = { paused: "Paused", ready: "Ready", observing: "Observing", acting: "Acting", verifying: "Verifying", stopping: "Stopping", blocked: "Blocked", unverified: "Unverified", error: "Error" };
const examples = ["type Hello Latham", "search orchestral music", "filter on", "click Continue"];
function App() {
  const [state, setState] = useState<DesktopState>();
  const [command, setCommand] = useState("type Hello Latham");
  const [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const unsubscribe = window.latham.subscribe(setState);
    void window.latham.getState().then(setState).catch(() => setError("The application bridge is unavailable."));
    return unsubscribe;
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      if (rect.y < 0 || rect.bottom > window.innerHeight) { window.latham.setFixtureBounds({ x: 0, y: 0, width: 0, height: 0 }); return; }
      window.latham.setFixtureBounds({ x: Math.round(rect.x + 1), y: Math.round(rect.y + 1), width: Math.max(0, Math.floor(rect.width - 2)), height: Math.max(0, Math.floor(rect.height - 2)) });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element); window.addEventListener("resize", update); window.addEventListener("scroll", update, true); update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, []);
  const act = async (operation: () => Promise<unknown>): Promise<void> => {
    setError("");
    try { await operation(); } catch { setError("The operation could not complete. Stop or reset the local fixture."); }
  };
  const settings = async (patch: Partial<Settings>): Promise<void> => {
    if (!state) return;
    const next = { ...state.settings, ...patch };
    setState({ ...state, settings: next });
    setError("");
    try { await window.latham.updateSettings(next); }
    catch { setError("Settings could not be saved."); setState(await window.latham.getState()); }
  };
  const busy = state && ["observing", "acting", "verifying", "stopping"].includes(state.status);
  const run = (event: FormEvent): void => { event.preventDefault(); void act(() => window.latham.run(command)); };
  const result = state?.lastResult;
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><div className="monogram" aria-hidden="true">L</div><div><h1>Latham<span>DEVELOPMENT</span></h1><p>A small step. A verified result.</p></div></div><div className="header-tools"><span className="local-badge">Voice · Chrome · local fixture</span><button className="stop" onClick={() => void act(() => window.latham.stop())}>■ Stop <kbd>Ctrl Alt .</kbd></button></div></header>
    <main className="workspace">
      <aside className="control-column">
        <section className="panel command-panel"><div className="section-kicker">01 / CONTROL</div><div className="section-title"><h2>Command desk</h2><span className={"status " + (state?.status ?? "paused")} role="status" data-testid="session-status">{state ? statusLabels[state.status] : "Loading"}</span></div>
          <p className="muted">Type an instruction. Latham checks the target, applies local policy, then verifies the effect.</p>
          <form onSubmit={run}><label htmlFor="command">Your command</label><textarea id="command" value={command} onChange={event => setCommand(event.target.value)} maxLength={2000} rows={3} spellCheck={false} />
          <button className="primary" type="submit" disabled={!state || !state.settings.fixtureAllowed || !!busy || state.status === "paused" || state.status === "unverified"}>Run command <span aria-hidden="true">↗</span></button></form>
          <div className="examples" aria-label="Example commands">{examples.map(example => <button key={example} onClick={() => setCommand(example)}>{example}</button>)}</div>
          <div className="result" aria-live="polite" aria-atomic="true" data-testid="action-result"><span className="section-kicker">LAST ACTION</span><strong>{result ? result.outcome.replaceAll("_", " ") : "Nothing dispatched"}</strong><p>{result?.reason ? reasons[result.reason] : result ? "The expected local effect was observed." : "Allow the fixture and start a session to begin."}</p>{result && <span className="dispatch">Dispatch: {result.dispatch.replaceAll("_", " ")}</span>}</div>
        </section>
        <section className="panel settings-panel"><div className="section-kicker">02 / SESSION SETTINGS</div><label className="check-row"><input type="checkbox" checked={state?.settings.fixtureAllowed ?? false} onChange={event => void settings({ fixtureAllowed: event.target.checked })} /><span>Allow local fixture<small>Only this bundled test page. No website access.</small></span></label>
          <div className="session-buttons"><button onClick={() => void act(() => window.latham.resume())} disabled={!state?.settings.fixtureAllowed || !!busy}>Start session</button><button onClick={() => void act(() => window.latham.resetFixture())}>Reset fixture</button></div>
          <label htmlFor="delay" className="range-label">Test dispatch delay <output>{state?.settings.delayMs ?? 0} ms</output></label><input id="delay" type="range" min={0} max={3000} step={100} value={state?.settings.delayMs ?? 0} onChange={event => void settings({ delayMs: Number(event.target.value) })} />
          <label className="check-row"><input type="checkbox" checked={state?.settings.diagnosticsEnabled ?? false} onChange={event => void settings({ diagnosticsEnabled: event.target.checked })} /><span>Save diagnostic metadata<small>Codes and timings only; never command text.</small></span></label>
          <button className="quiet" onClick={() => void act(() => window.latham.clearDiagnostics())}>Clear diagnostics</button>
        </section>
        <p className="scope-note">The fixture uses its own local permission. Voice and Chrome have separate setup below. Closing the window pauses all work and keeps the tray available.</p>
        {state && !state.stopShortcutRegistered && <p className="error" role="alert">Global stop shortcut unavailable. Use Stop or the tray menu.</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
      <div className="fixture-column">
        <section className="panel fixture-panel"><div className="fixture-header"><div><div className="section-kicker">03 / SANDBOXED TEST SURFACE</div><h2>The fixture playground</h2></div><span className="origin-label">latham://fixture</span></div><div className="fixture-viewport" ref={viewport} aria-label="Local fixture browser surface" /><div className="fixture-footer"><span>Isolated page · no privileged bridge</span><span>Permissions {state?.permissionEpoch ?? 1} / Executor {state?.executorEpoch ?? 1}</span></div></section>
        <div className="evidence-row">
          <section className="panel evidence-panel"><div className="section-title"><h2>Observed targets</h2><span className="count">{state?.targets.length ?? 0}</span></div><p className="mini">Labels only. Secure values and frame contents are excluded.</p><ul className="targets">{state?.targets.map(target => <li key={target.id}><span>{target.name}</span><small>{target.secure ? "secure · blocked" : target.role}</small></li>)}</ul>{!state?.targets.length && <p className="empty">A permitted command acquires the first snapshot.</p>}<p className="mini">Denied frames omitted: {state?.deniedFrameCount ?? 0}</p></section>
          <section className="panel evidence-panel"><div className="section-title"><h2>Action trail</h2><span className="count">{state?.diagnostics.length ?? 0}</span></div><p className="mini">A bounded metadata trail, not an activity recording.</p><ol className="trail">{state?.diagnostics.slice(-5).reverse().map(item => <li key={item.sequence}><span>{item.event === "action" ? item.outcome?.replaceAll("_", " ") : item.event.replaceAll("_", " ")}</span><small>{item.reason ?? item.kind ?? "session"}{item.durationMs !== undefined ? " · " + item.durationMs + " ms" : ""}</small></li>)}</ol></section>
        </div>
      </div>
    </main>
    <SetupPanel />
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
