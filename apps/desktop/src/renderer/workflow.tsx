import { useEffect, useState } from "react";
import type { SetupState } from "../../../../packages/contracts/src/setup";
import { sites } from "../../../../packages/contracts/src/sites";
import { workflowActive, workflowLimits, type WorkflowGoal } from "../../../../packages/contracts/src/workflow";

export function WorkflowPanel({ state, dirty }: { state: SetupState; dirty: boolean }) {
  const [goal, setGoal] = useState<WorkflowGoal>({ site: "usajobs", query: "software", filter: "remote", open: 1 });
  const [name, setName] = useState(""), [selected, setSelected] = useState(""), [error, setError] = useState("");
  const workflow = state.workflow, active = workflowActive(workflow.phase), busy = ["preparing", "running"].includes(workflow.phase);
  const matching = !!workflow.goal && JSON.stringify({ ...goal, query: goal.query.trim() }) === JSON.stringify(workflow.goal);
  const act = async (operation: () => Promise<unknown>): Promise<void> => { setError(""); try { await operation(); } catch { setError("This operation is unavailable. Check the reviewed plan, active tab and shortcut name. Nothing was started automatically."); } };
  useEffect(() => { if (selected && !state.shortcuts.some(shortcut => shortcut.id === selected)) setSelected(""); }, [state.shortcuts, selected]);
  const load = (id: string): void => { setSelected(id); const shortcut = state.shortcuts.find(shortcut => shortcut.id === id); if (shortcut) { setGoal({ ...shortcut.goal }); setName(shortcut.name); } };
  return <section className="setup-group" aria-label="Bounded workflows">
    <p className="eyebrow">REVIEWED SEARCH GOALS</p><h3>7. Run a bounded workflow</h3>
    <p className="mini">Open and approve the chosen website, then start a Chrome session. Prepare a plan, review its steps, and run it once in that tab. Search text is literal. This planner uses no AI requests. Sending, applications, uploads, account changes and purchases are excluded.</p>
    <fieldset className="manual-controls" disabled={busy || state.handsfree.phase !== "off" || state.visual.busy || state.voice !== "idle" || dirty}>
      <label>Workflow website<select value={goal.site} onChange={event => { const site = event.target.value as WorkflowGoal["site"]; setGoal({ ...goal, site, filter: null, open: site === "google" || site === "duckduckgo" ? 0 : goal.open }); }}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label>Search for<input value={goal.query} maxLength={300} onChange={event => setGoal({ ...goal, query: event.target.value })} /></label>
      <button disabled={!state.transcript || state.transcript.length > 300} onClick={() => setGoal({ ...goal, query: state.transcript })}>Use transcript as workflow search text</button>
      <label>Workflow filter<select value={goal.filter ?? "none"} onChange={event => setGoal({ ...goal, filter: event.target.value === "none" ? null : event.target.value as WorkflowGoal["filter"] })}><option value="none">No filter</option>{(goal.site === "google" ? ["all", "images", "videos", "news"] : goal.site === "usajobs" ? ["all", "remote"] : []).map(filter => <option key={filter} value={filter}>{filter}</option>)}</select></label>
      <label>After searching<select value={goal.open} onChange={event => setGoal({ ...goal, open: Number(event.target.value) as WorkflowGoal["open"] })}><option value={0}>Leave the results open</option>{!["google", "duckduckgo"].includes(goal.site) && [1, 2, 3].map(index => <option key={index} value={index}>Open {index === 1 ? "first" : index === 2 ? "second" : "third"} visible reviewed result</option>)}</select></label>
      <button disabled={!state.chromeActive || !goal.query.trim()} onClick={() => void act(() => window.setup.prepareWorkflow(goal))}>{workflow.phase === "prepared" ? "Prepare edited goal" : "Prepare workflow"}</button>
      <p className="mini">Maximum {workflowLimits.actions} action attempts, {workflowLimits.requests} extension requests and {workflowLimits.durationMs / 1000} seconds per run. Result opening may wait briefly and scroll down at most {workflowLimits.scrolls} times; ordinals refer to currently visible reviewed links.</p>
      <ol aria-label="Workflow steps">{workflow.steps.map((step, index) => <li key={index}>{step.label} · {step.outcome}</li>)}</ol>
      {workflow.phase === "prepared" && <p className="mini">Bound to Chrome tab {workflow.tabId}. Preview expires at {new Date(workflow.expiresAt).toLocaleTimeString()}. {matching ? "Run accepts only these displayed steps." : "Draft changed. Prepare again before running."}</p>}
      <button className="primary" disabled={workflow.phase !== "prepared" || !matching || !workflow.previewId} onClick={() => void act(() => window.setup.runWorkflow(workflow.previewId!))}>Run reviewed workflow</button>
    </fieldset>
    <button disabled={!active} onClick={() => void act(() => window.setup.cancelWorkflow())}>Cancel workflow</button>
    <p role="status" data-testid="workflow-status">{workflow.phase} · {workflow.message}</p>
    <p className="mini">{workflow.steps.filter(step => step.outcome === "verified").length}/{workflow.steps.length} steps verified · {workflow.actions}/{workflowLimits.actions} action attempts · {workflow.requests}/{workflowLimits.requests} requests · {workflow.elapsedMs} ms. Stop cannot undo an effect already issued.</p>
    <details><summary>Saved workflow shortcuts</summary>
      <p className="mini">Saving is explicit and available after every planned step verifies. Up to 10 shortcuts are protected with Windows encryption. Loading a shortcut fills this form; prepare and review it again for every run. Edit the goal, run it successfully, then update the shortcut.</p>
      <label>Saved shortcut<select disabled={active} value={selected} onChange={event => load(event.target.value)}><option value="">New shortcut</option>{state.shortcuts.map(shortcut => <option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>)}</select></label>
      <label>Shortcut name<input disabled={active} value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
      <div className="setup-buttons"><button disabled={active || workflow.phase !== "completed" || !matching || !name.trim() || !state.shortcutStorageAvailable || state.shortcutStorageLocked} onClick={() => void act(() => window.setup.saveWorkflowShortcut(name, selected || null))}>{selected ? "Update shortcut with completed goal" : "Save completed goal as shortcut"}</button><button disabled={!selected} onClick={() => void act(() => window.setup.deleteWorkflowShortcut(selected))}>Delete selected shortcut</button><button disabled={!state.shortcuts.length && !state.shortcutStorageLocked} onClick={() => void act(() => window.setup.clearWorkflowShortcuts())}>Delete all saved shortcuts</button></div>
      {(!state.shortcutStorageAvailable || state.shortcutStorageLocked) && <p role="status">Shortcut storage is unavailable or locked. No plaintext fallback is used. Delete all saved shortcuts to discard a damaged store.</p>}
    </details>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
