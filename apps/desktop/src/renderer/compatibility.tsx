import { useState } from "react";
import { appVersion, nativeProtocol, browsers, type Trial } from "../../../../packages/contracts/src/compatibility";
import type { SetupState } from "../../../../packages/contracts/src/setup";

export function CompatibilityPanel({ state, act }: { state: SetupState; act: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [consent, setConsent] = useState(false);
  const [trial, setTrial] = useState<Trial>({ task: "search", browser: state.browser, provider: state.settings.mode, outcome: "completed", seconds: 30, permissionPrompts: 0, effort: "easy", resourceBurden: "low" });
  const trials = state.evaluation.trials;
  return <section className="setup-group compatibility-panel" aria-label="Compatibility and evaluation">
    <h3>8. Compatibility and optional feedback</h3>
    <p>Windows preview {appVersion} · extension {appVersion} · native protocol {nativeProtocol}. Only the selected browser can connect. Every restart and browser switch starts paused.</p>
    <p className="mini">English public-site profiles and Windows Notepad plain text remain the tested scope. Local ASR language settings do not translate command grammar or website profiles. macOS/Linux, Firefox/Safari, screen-reader certification and physical mixed-DPI/multi-monitor coverage remain open gates. Display configuration changes stop active work; start and prepare the target again.</p>
    <details><summary>Record a task evaluation on this device</summary>
      <p className="mini">After trying a supported task, enter your own measurements. These are self-reported results, not verified execution receipts. No automatic recording or upload occurs. Up to 50 entries are retained locally, with no task text, URLs, account names, audio or transcripts. Clear them below at any time.</p>
      <form onSubmit={event => { event.preventDefault(); if (consent) void act(async () => { await window.setup.addEvaluation(trial); setConsent(false); }); }}>
        <div className="evaluation-fields">
          <label>Evaluated task<select value={trial.task} onChange={event => setTrial({ ...trial, task: event.target.value as Trial["task"] })}>{["search", "dictation", "workflow", "native"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Evaluated browser<select value={trial.browser} onChange={event => setTrial({ ...trial, browser: event.target.value as Trial["browser"] })}>{Object.entries(browsers).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Evaluated AI route<select value={trial.provider} onChange={event => setTrial({ ...trial, provider: event.target.value as Trial["provider"] })}>{["local", "cloud", "managed"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Task outcome<select value={trial.outcome} onChange={event => setTrial({ ...trial, outcome: event.target.value as Trial["outcome"] })}><option value="completed">Completed as intended</option><option value="intervened">Needed my intervention</option><option value="blocked">Blocked or unsupported</option><option value="wrong_action">Incorrect action</option></select></label>
          <label>Completion time in seconds<input type="number" min={1} max={3600} required value={trial.seconds} onChange={event => setTrial({ ...trial, seconds: event.target.valueAsNumber })} /></label>
          <label>Permission prompts encountered<input type="number" min={0} max={20} required value={trial.permissionPrompts} onChange={event => setTrial({ ...trial, permissionPrompts: event.target.valueAsNumber })} /></label>
          <label>Effort required<select value={trial.effort} onChange={event => setTrial({ ...trial, effort: event.target.value as Trial["effort"] })}>{["easy", "some", "hard"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Resource or cost burden<select value={trial.resourceBurden} onChange={event => setTrial({ ...trial, resourceBurden: event.target.value as Trial["resourceBurden"] })}>{["low", "moderate", "high"].map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Save this one evaluation locally.</label>
        <button disabled={!consent || state.evaluation.locked}>Save task evaluation</button>
      </form>
      <p role="status">{trials.length} saved · {trials.filter(t => t.outcome === "completed").length} completed · {trials.filter(t => t.outcome === "intervened").length} needed intervention · {trials.filter(t => t.outcome === "wrong_action").length} incorrect. High resource burden: {trials.filter(t => t.resourceBurden === "high").length}.</p>
      {state.evaluation.locked && <p role="alert">The evaluation file is unreadable or newer than this app. It has not been overwritten. Clear it explicitly to start again.</p>}
      <button onClick={() => void act(() => window.setup.clearEvaluation())}>Clear saved task evaluations</button>
    </details>
  </section>;
}
