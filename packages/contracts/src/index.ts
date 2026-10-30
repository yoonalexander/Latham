export const fixtureSurface = "phase0-fixture" as const;
export type SessionStatus = "paused" | "ready" | "observing" | "acting" | "verifying" | "stopping" | "blocked" | "unverified" | "error";
export type ActionKind = "insert_text" | "click" | "set_checked";
export type Outcome = "verified_success" | "blocked" | "cancelled" | "failed" | "unverified";
export type Reason = "scope_denied" | "session_paused" | "invalid_request" | "unknown_command" | "ambiguous_target" | "target_missing" | "unknown_effect" | "consequential_effect" | "secure_field" | "stale_target" | "cancelled" | "verification_failed" | "executor_unavailable";
export type ActionResult = { actionId: string; outcome: Outcome; dispatch: "not_dispatched" | "dispatched" | "unknown"; reason?: Reason };
export type Scope = { surface: typeof fixtureSurface; documentId: string; permissionEpoch: number; executorEpoch: number };
export type RawControl = { key: string; nodeId: string; role: "textbox" | "button" | "checkbox" | "status"; name: string; enabled: boolean; visible: boolean; secure: boolean; value?: string; checked?: boolean };
export type RawObservation = { documentId: string; controls: RawControl[]; deniedFrameCount: number };
export type Element = RawControl & { id: string; revision: string };
export type Snapshot = { id: string; scope: Scope; elements: Element[]; deniedFrameCount: number };
export type Action = { kind: "insert_text"; text: string } | { kind: "click" } | { kind: "set_checked"; checked: boolean };
export type AuthorizedAction = { actionId: string; turnId: number; scope: Scope; snapshotId: string; target: Element; action: Action; profileId: string };
export type DispatchReceipt = { dispatch: "not_dispatched" | "dispatched" | "unknown"; reason?: Reason };
export interface FixtureExecutor { observe(): Promise<unknown>; dispatch(action: AuthorizedAction, signal: AbortSignal): Promise<DispatchReceipt>; }
export type Diagnostic = { sequence: number; at: string; event: "resumed" | "paused" | "scope_changed" | "executor_reset" | "action"; kind?: ActionKind; outcome?: Outcome; dispatch?: ActionResult["dispatch"]; reason?: Reason; durationMs?: number };
export type TargetSummary = { id: string; name: string; role: string; enabled: boolean; secure: boolean };
export type ControllerState = { status: SessionStatus; permissionEpoch: number; executorEpoch: number; turnId: number; targets: TargetSummary[]; deniedFrameCount: number; lastResult: ActionResult | null; diagnostics: Diagnostic[] };
export type Settings = { fixtureAllowed: boolean; diagnosticsEnabled: boolean; delayMs: number };
export type DesktopState = ControllerState & { settings: Settings; stopShortcutRegistered: boolean };
export type Bounds = { x: number; y: number; width: number; height: number };
export interface DesktopBridge {
  readonly runtime: { sandboxed: boolean; contextIsolated: boolean };
  getState(): Promise<DesktopState>;
  run(command: string): Promise<ActionResult>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  resetFixture(): Promise<void>;
  updateSettings(settings: Settings): Promise<void>;
  clearDiagnostics(): Promise<void>;
  setFixtureBounds(bounds: Bounds): void;
  subscribe(listener: (state: DesktopState) => void): () => void;
}
export function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function parseCommand(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2000) throw new Error("invalid_request");
  return value.trim();
}
export function parseSettings(value: unknown): Settings {
  if (!record(value) || Object.keys(value).some(key => !["fixtureAllowed", "diagnosticsEnabled", "delayMs"].includes(key)) ||
      typeof value.fixtureAllowed !== "boolean" || typeof value.diagnosticsEnabled !== "boolean" ||
      typeof value.delayMs !== "number" || !Number.isInteger(value.delayMs) || value.delayMs < 0 || value.delayMs > 3000) throw new Error("invalid_request");
  return { fixtureAllowed: value.fixtureAllowed, diagnosticsEnabled: value.diagnosticsEnabled, delayMs: value.delayMs };
}
export function parseBounds(value: unknown): Bounds {
  if (!record(value)) throw new Error("invalid_request");
  for (const key of ["x", "y", "width", "height"]) if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 10000) throw new Error("invalid_request");
  return { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number };
}
