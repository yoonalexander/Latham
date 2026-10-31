import { parseCommand, type ActionResult, type AuthorizedAction, type ControllerState, type Diagnostic, type FixtureExecutor, type Reason, type SessionStatus } from "@latham/contracts";
import { snapshot } from "@latham/observations";
import { authorize, verify } from "@latham/actions";
import { route, select } from "@latham/decisions";

export class Controller {
  private status: SessionStatus = "paused";
  private allowed = false;
  private sessionActive = false;
  private generation = 0;
  private permissionEpoch = 1;
  private executorEpoch = 1;
  private turnId = 0;
  private queue: Promise<void> = Promise.resolve();
  private active: AbortController | undefined;
  private dispatchPending = false;
  private requiresReset = false;
  private targets: ControllerState["targets"] = [];
  private deniedFrameCount = 0;
  private lastResult: ActionResult | null = null;
  private diagnostics: Diagnostic[] = [];
  private sequence = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly executor: FixtureExecutor, private readonly options: { delayMs: () => number; diagnostic?: (event: Diagnostic) => void; operationTimeoutMs?: number }) {}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get needsReview(): boolean { return this.requiresReset || this.dispatchPending; }
  getState(): ControllerState {
    return structuredClone({ status: this.status, permissionEpoch: this.permissionEpoch, executorEpoch: this.executorEpoch,
      turnId: this.turnId, targets: this.targets, deniedFrameCount: this.deniedFrameCount, lastResult: this.lastResult, diagnostics: this.diagnostics });
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
  private log(event: Diagnostic["event"], detail: Partial<Pick<Diagnostic, "kind" | "outcome" | "dispatch" | "reason" | "durationMs">> = {}): void {
    const item: Diagnostic = { sequence: ++this.sequence, at: new Date().toISOString(), event, ...detail };
    this.diagnostics = [...this.diagnostics.slice(-49), item];
    this.options.diagnostic?.(item);
  }
  clearDiagnostics(): void { this.diagnostics = []; this.emit(); }
  setPermission(allowed: boolean): void {
    this.stop();
    this.allowed = allowed;
    this.permissionEpoch++;
    this.targets = [];
    this.log("scope_changed");
    this.emit();
  }
  resume(): void {
    if (this.dispatchPending || this.requiresReset) {
      this.status = "unverified"; this.lastResult = this.result("unverified", "unknown", "executor_unavailable");
    } else if (!this.allowed) {
      this.status = "blocked"; this.lastResult = this.result("blocked", "not_dispatched", "scope_denied");
    } else {
      this.sessionActive = true; this.status = "ready"; this.lastResult = null; this.log("resumed");
    }
    this.emit();
  }
  stop(): void {
    const hadWork = this.active !== undefined || this.dispatchPending;
    this.sessionActive = false;
    this.status = "stopping";
    this.generation++;
    this.active?.abort();
    if (hadWork) this.lastResult = this.result("cancelled", this.dispatchPending ? "unknown" : "not_dispatched", "cancelled");
    this.emit();
    // The local fence rejects further invocations; an already begun adapter call is not rollbackable.
    this.status = "paused";
    this.log("paused");
    this.emit();
  }
  resetExecutor(): void {
    this.stop(); this.executorEpoch++; this.requiresReset = false; this.targets = [];
    this.log("executor_reset"); this.emit();
  }
  private result(outcome: ActionResult["outcome"], dispatch: ActionResult["dispatch"], reason?: Reason, actionId: string = crypto.randomUUID()): ActionResult {
    return { actionId, outcome, dispatch, ...(reason ? { reason } : {}) };
  }
  run(input: unknown): Promise<ActionResult> {
    let command: string;
    try { command = parseCommand(input); } catch { return Promise.resolve(this.result("blocked", "not_dispatched", "invalid_request")); }
    const generation = this.generation, turnId = ++this.turnId;
    const run = this.queue.then(() => this.execute(command, generation, turnId));
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
  private async execute(command: string, generation: number, turnId: number): Promise<ActionResult> {
    const current = (): boolean => generation === this.generation;
    if (!current()) return this.result("cancelled", "not_dispatched", "cancelled");
    let loggedActionId: string | undefined;
    const finish = (result: ActionResult): ActionResult => {
      if (current()) {
        this.lastResult = result;
        if (result.outcome === "unverified") { this.requiresReset = true; this.sessionActive = false; }
        this.status = result.outcome === "verified_success" ? "ready" : result.outcome === "cancelled" ? "paused" : result.outcome === "unverified" ? "unverified" : result.outcome === "blocked" ? "blocked" : "error";
        if (result.actionId !== loggedActionId) this.log("action", { outcome: result.outcome, dispatch: result.dispatch, ...(result.reason ? { reason: result.reason } : {}) });
        this.emit();
      }
      return result;
    };
    if (!this.allowed) return finish(this.result("blocked", "not_dispatched", "scope_denied"));
    if (this.requiresReset || this.dispatchPending) return finish(this.result("unverified", "unknown", "executor_unavailable"));
    if (!this.sessionActive) return finish(this.result("blocked", "not_dispatched", "session_paused"));
    const plan = route(command);
    if (typeof plan === "string") return finish(this.result("blocked", "not_dispatched", plan));
    const abort = new AbortController();
    this.active = abort;
    let last = this.result("failed", "not_dispatched", "unknown_command");
    let dispatch: ActionResult["dispatch"] = "not_dispatched";
    const cancelled = (): ActionResult => {
      const result = this.result("cancelled", dispatch, "cancelled");
      if (!this.sessionActive) {
        if (dispatch === "unknown") this.requiresReset = true;
        this.log("action", { outcome: "cancelled", dispatch, reason: "cancelled" });
        this.lastResult = result; this.emit();
      }
      return result;
    };
    try {
      for (const step of plan) {
        dispatch = "not_dispatched";
        if (!current() || abort.signal.aborted) return cancelled();
        this.status = "observing"; this.emit();
        const before = snapshot(await bounded(this.executor.observe(), abort.signal, this.options.operationTimeoutMs ?? 2000), this.permissionEpoch, this.executorEpoch);
        if (!current()) return cancelled();
        this.targets = before.elements.filter(element => element.visible).map(({ id, name, role, enabled, secure }) => ({ id, name, role, enabled, secure }));
        this.deniedFrameCount = before.deniedFrameCount;
        const target = select(step, before);
        if (typeof target === "string") return finish(this.result("blocked", "not_dispatched", target));
        const permission = authorize(step.action, target, before);
        if (typeof permission === "string") return finish(this.result("blocked", "not_dispatched", permission));
        const action: AuthorizedAction = { actionId: crypto.randomUUID(), turnId, scope: before.scope, snapshotId: before.id, target, action: step.action, profileId: permission.profileId };
        this.status = "acting"; this.emit();
        await delay(this.options.delayMs(), abort.signal);
        if (!current() || abort.signal.aborted) return cancelled();
        const started = performance.now();
        dispatch = "unknown"; this.dispatchPending = true;
        const receipt = await bounded(this.executor.dispatch(action, abort.signal), abort.signal, this.options.operationTimeoutMs ?? 2000);
        this.dispatchPending = false; dispatch = receipt.dispatch;
        if (!current()) return cancelled();
        if (receipt.dispatch !== "dispatched") {
          last = this.result(receipt.dispatch === "unknown" ? "unverified" : "blocked", receipt.dispatch, receipt.reason ?? "executor_unavailable", action.actionId);
        } else {
          this.status = "verifying"; this.emit();
          const after = snapshot(await bounded(this.executor.observe(), abort.signal, this.options.operationTimeoutMs ?? 2000), this.permissionEpoch, this.executorEpoch);
          if (!current()) return cancelled();
          const verified = before.scope.documentId === after.scope.documentId && verify(step.action, target, before, after);
          last = this.result(verified ? "verified_success" : "unverified", "dispatched", verified ? undefined : "verification_failed", action.actionId);
        }
        this.log("action", { kind: step.action.kind, outcome: last.outcome, dispatch: last.dispatch, ...(last.reason ? { reason: last.reason } : {}), durationMs: Math.round(performance.now() - started) });
        loggedActionId = last.actionId;
        if (last.outcome !== "verified_success") return finish(last);
      }
      return finish(last);
    } catch {
      if (!current() || abort.signal.aborted) return cancelled();
      return finish(this.result(dispatch === "not_dispatched" ? "failed" : "unverified", dispatch, "executor_unavailable"));
    } finally {
      this.dispatchPending = false;
      if (this.active === abort) this.active = undefined;
    }
  }
}
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    const abort = (): void => { clearTimeout(timer); reject(new Error("cancelled")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (error: boolean, value: T | Error): void => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) reject(value); else resolve(value as T);
    };
    const abort = (): void => finish(true, new Error("cancelled"));
    const timer = setTimeout(() => finish(true, new Error("executor_unavailable")), timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(value => finish(false, value), () => finish(true, new Error("executor_unavailable")));
    if (signal.aborted) abort();
  });
}
