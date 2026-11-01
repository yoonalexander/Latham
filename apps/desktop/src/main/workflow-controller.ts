import { randomUUID } from "node:crypto";
import { record } from "../../../../packages/contracts/src/index";
import { parsePageScope, type PageScope } from "../../../../packages/contracts/src/browser";
import { sites } from "../../../../packages/contracts/src/sites";
import { emptyWorkflowState, workflowActive, workflowLimits, type WorkflowGoal, type WorkflowState } from "../../../../packages/contracts/src/workflow";
import { compileWorkflow, workflowLabel } from "../../../../packages/planner/src/index";

export interface WorkflowPort {
  active: boolean; connected: boolean; needsReview: boolean; readonly sessionEpoch: number;
  readonly siteState: { origin: string; effective: boolean }[];
  request(request: object, mutation?: boolean): Promise<unknown>;
  pause(): void;
}
type Limits = { [K in keyof typeof workflowLimits]: number };
const messages: Record<string, string> = {
  unsupported_goal: "Choose a supported search, filter and result goal. Other effects are excluded.",
  workflow_context: "Open the selected approved website in the current Chrome tab, then prepare again.",
  workflow_stale: "The prepared tab, document or session changed. Prepare a new plan.",
  workflow_interrupted: "User interaction or navigation interrupted this workflow. Nothing will be replayed.",
  scope_denied: "Approve the selected site and start a Chrome session first.",
  target_missing: "No reviewed visible result was found within the wait/scroll budget.",
  request_budget: "The request budget was reached. Remaining steps were not run.",
  action_budget: "The action budget was reached. Remaining steps were not run.",
  time_budget: "The time budget was reached. Remaining steps were cancelled.",
  preview_expired: "This preview expired. Prepare and review a new plan.",
  navigation_unverified: "Navigation was issued but could not be verified. Inspect Chrome before continuing.",
  site_restricted: "The site requires verification or denies access. This workflow stopped.",
  cancelled: "Workflow cancelled. Verified earlier steps are retained; nothing will be replayed."
};
export class WorkflowController {
  state: WorkflowState = emptyWorkflowState();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lease: string | null = null;
  private prepared: { id: string; epoch: number; scope: PageScope; plan: ReturnType<typeof compileWorkflow> } | null = null;
  private epoch = -1;
  private deadline = 0;
  private started = 0;
  private inFlightMutation = false;
  constructor(private chrome: WorkflowPort, private changed: () => void, private limits: Limits = workflowLimits) {}
  get active(): boolean { return workflowActive(this.state.phase); }
  cancel(reason = "cancelled"): void {
    if (!this.active) return;
    this.generation++; clearTimeout(this.timer); this.prepared = null; this.lease = null;
    const unknown = this.inFlightMutation || this.chrome.needsReview;
    this.state.phase = unknown ? "unknown" : "cancelled"; this.state.previewId = null;
    const step = this.state.steps.find(step => step.outcome === "running"); if (step) step.outcome = unknown ? "unknown" : "blocked";
    this.state.message = unknown ? "Stopped with an in-flight effect. Inspect Chrome; nothing will be replayed." : messages[reason] ?? messages.cancelled!;
    this.state.elapsedMs = this.started ? Date.now() - this.started : 0; this.changed();
  }
  private clock(duration: number, reason: string): void {
    clearTimeout(this.timer); this.deadline = Date.now() + duration;
    this.timer = setTimeout(() => { this.cancel(reason); this.chrome.pause(); }, duration);
  }
  private gate(generation: number): void {
    if (generation !== this.generation || !this.chrome.active || !this.chrome.connected || this.chrome.sessionEpoch !== this.epoch) throw new Error("workflow_stale");
    if (this.chrome.needsReview) throw new Error("navigation_unverified");
    if (Date.now() >= this.deadline) throw new Error("time_budget");
    const origin = sites.find(site => site.id === this.state.goal?.site)?.origin;
    if (!this.chrome.siteState.some(site => site.origin === origin && site.effective)) throw new Error("scope_denied");
  }
  private async request(generation: number, request: object, mutation = false): Promise<Record<string, unknown>> {
    this.gate(generation);
    if (this.state.requests >= this.limits.requests) throw new Error("request_budget");
    if (mutation && this.state.actions >= this.limits.actions) throw new Error("action_budget");
    this.state.requests++; if (mutation) this.state.actions++; this.inFlightMutation = mutation; this.changed();
    try {
      const result = await this.chrome.request(request, mutation); this.gate(generation);
      if (!record(result) || result.outcome !== "verified") throw new Error(record(result) && typeof result.reason === "string" ? result.reason : "cancelled");
      return result;
    } finally { this.inFlightMutation = false; }
  }
  private scope(value: Record<string, unknown>): PageScope {
    const scope = parsePageScope(value.scope);
    if (scope.snapshot.profile !== this.state.goal?.site) throw new Error("workflow_context");
    return scope;
  }
  async prepare(input: unknown): Promise<void> {
    if (["preparing", "running"].includes(this.state.phase)) throw new Error("workflow_busy");
    const previous = this.lease, generation = ++this.generation; this.prepared = null; this.lease = null; this.started = 0;
    this.state = { ...emptyWorkflowState(), phase: "preparing", message: "Preparing a bounded plan for this tab." }; this.changed();
    try {
      const plan = compileWorkflow(input); this.state.goal = plan.goal;
      this.state.steps = plan.steps.map(step => ({ label: workflowLabel(step), outcome: "pending" }));
      this.epoch = this.chrome.sessionEpoch; this.clock(this.limits.previewMs, "preview_expired");
      if (previous) await this.request(generation, { kind: "workflow_end", flowId: previous });
      const id = randomUUID(), scope = this.scope(await this.request(generation, { kind: "workflow_begin", flowId: id, site: plan.goal.site }));
      this.gate(generation); this.lease = id; this.prepared = { id, epoch: this.epoch, scope, plan };
      this.state.phase = "prepared"; this.state.previewId = id; this.state.tabId = scope.tabId; this.state.expiresAt = this.deadline;
      this.state.message = "Review the steps. Run authorizes only this goal in this tab, once."; this.changed();
    } catch (error) { this.fail(generation, error); }
  }
  private fail(generation: number, error: unknown): void {
    if (generation !== this.generation) return;
    clearTimeout(this.timer); this.prepared = null; this.lease = null; this.state.previewId = null;
    this.state.phase = this.chrome.needsReview ? "unknown" : this.state.steps.some(step => step.outcome === "verified") ? "partial" : "blocked";
    const step = this.state.steps.find(step => step.outcome === "running"); if (step) step.outcome = this.state.phase === "unknown" ? "unknown" : "blocked";
    this.state.message = messages[(error as Error).message] ?? "A step was blocked or could not be verified. Remaining steps were not run.";
    this.state.elapsedMs = this.started ? Date.now() - this.started : 0; this.chrome.pause(); this.changed();
  }
  async run(id: unknown): Promise<void> {
    const prepared = this.prepared;
    if (!prepared || this.state.phase !== "prepared" || typeof id !== "string" || id !== prepared.id) throw new Error("workflow_stale");
    if (Date.now() >= this.state.expiresAt || prepared.epoch !== this.chrome.sessionEpoch) { this.cancel("preview_expired"); this.chrome.pause(); return; }
    this.prepared = null; this.started = Date.now(); this.state.phase = "running"; const generation = this.generation;
    this.clock(this.limits.durationMs, "time_budget"); this.changed();
    let scope = prepared.scope;
    const observe = async (): Promise<void> => { scope = this.scope(await this.request(generation, { kind: "workflow_observe", flowId: id, scope })); };
    const action = async (step: object): Promise<void> => { scope = this.scope(await this.request(generation, { kind: "workflow_step", flowId: id, scope, step }, true)); };
    try {
      await this.request(generation, { kind: "workflow_start", flowId: id, scope });
      await observe();
      for (let index = 0; index < prepared.plan.steps.length; index++) {
        this.gate(generation); const step = prepared.plan.steps[index]!; this.state.steps[index]!.outcome = "running"; this.state.message = this.state.steps[index]!.label; this.changed();
        if (step.kind !== "open_result") await action(step);
        else {
          let scrolls = 0, waits = 0;
          for (;;) {
            await observe(); const target = scope.snapshot.targets.filter(target => target.profile === "result")[step.ordinal];
            if (target) { await action({ kind: "open", targetId: target.id, revision: target.revision }); break; }
            if (waits++ < this.limits.waits) { await new Promise(resolve => setTimeout(resolve, this.limits.waitMs)); this.gate(generation); continue; }
            if (scrolls++ >= this.limits.scrolls) throw new Error("target_missing");
            await action({ kind: "scroll" });
          }
        }
        this.gate(generation); this.state.steps[index]!.outcome = "verified"; this.state.elapsedMs = Date.now() - this.started; this.changed();
      }
      await this.request(generation, { kind: "workflow_end", flowId: id });
      this.lease = null; clearTimeout(this.timer); this.state.previewId = null; this.state.phase = "completed";
      this.state.message = "Every planned step was verified. This run has ended."; this.state.elapsedMs = Date.now() - this.started; this.changed();
    } catch (error) { this.fail(generation, error); }
  }
  completedGoal(): WorkflowGoal {
    if (this.state.phase !== "completed" || !this.state.goal) throw new Error("complete_workflow_before_saving");
    return structuredClone(this.state.goal);
  }
}
