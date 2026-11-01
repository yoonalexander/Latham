import { record } from "./index";
import { sites, type SiteId, type SearchFilter } from "./sites";

export type WorkflowGoal = { site: SiteId; query: string; filter: SearchFilter | null; open: 0 | 1 | 2 | 3 };
export type WorkflowStep = { kind: "search"; text: string } | { kind: "filter"; filter: SearchFilter } | { kind: "open_result"; ordinal: number };
export type WorkflowPhase = "idle" | "preparing" | "prepared" | "running" | "completed" | "partial" | "blocked" | "cancelled" | "unknown";
export const workflowLimits = { actions: 8, requests: 20, durationMs: 60000, previewMs: 60000, scrolls: 3, waits: 2, waitMs: 750 } as const;
export type WorkflowState = { phase: WorkflowPhase; previewId: string | null; goal: WorkflowGoal | null; tabId: number | null; expiresAt: number; steps: { label: string; outcome: "pending" | "running" | "verified" | "blocked" | "unknown" }[]; actions: number; requests: number; elapsedMs: number; message: string };
export const emptyWorkflowState = (): WorkflowState => ({ phase: "idle", previewId: null, goal: null, tabId: null, expiresAt: 0, steps: [], actions: 0, requests: 0, elapsedMs: 0, message: "Prepare a reviewed search goal. Nothing runs until you choose Run." });
export type WorkflowShortcut = { id: string; name: string; goal: WorkflowGoal };
export function parseWorkflowGoal(value: unknown): WorkflowGoal {
  if (!record(value) || Object.keys(value).sort().join(",") !== "filter,open,query,site" || !sites.some(site => site.id === value.site) || typeof value.query !== "string" || !value.query.trim() || value.query.length > 300 || /[\x00-\x1f]/.test(value.query) || ![0, 1, 2, 3].includes(Number(value.open)) || typeof value.open !== "number") throw new Error("unsupported_goal");
  const filters = value.site === "google" ? ["all", "images", "videos", "news"] : value.site === "usajobs" ? ["all", "remote"] : [];
  if (value.filter !== null && !filters.includes(String(value.filter)) || value.open !== 0 && ["google", "duckduckgo"].includes(String(value.site))) throw new Error("unsupported_goal");
  return { site: value.site as SiteId, query: value.query.trim(), filter: value.filter as SearchFilter | null, open: value.open as WorkflowGoal["open"] };
}
export const workflowActive = (phase: WorkflowPhase): boolean => ["preparing", "prepared", "running"].includes(phase);
