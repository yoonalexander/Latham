import { record } from "../../../../packages/contracts/src/index";
import { emptyPageState, parsePageIntent, parsePageScope, type PageAction, type PageScope, type PageState, type PageTarget } from "../../../../packages/contracts/src/browser";
import { selectCandidate } from "../../../../packages/speech/src/providers";
import { ChromeBridge } from "./native-bridge";
import { ProviderStore } from "./provider-store";
import { randomUUID } from "node:crypto";
import { searchDestination, filterDestination } from "../../../../packages/contracts/src/sites";

const reasons: Record<string, string> = {
  page_loading: "Wait for the page to finish loading, then try again.",
  scope_denied: "Approve this supported website and start a Chrome session first.", unsupported_page: "This page is outside the reviewed public search/read profiles.",
  stale_target: "The document or control changed. Inspect the page again.", cancelled: "Cancelled. No pending command will be replayed.",
  unknown_effect: "This control has no reviewed safe effect. Nothing was dispatched.", target_missing: "No supported control matches. Messages, uploads, account changes and secure fields are excluded.",
  ambiguous_target: "Several controls match. Choose a number from the list.", provider_abstained: "The model could not identify one supported target. Try its exact label.",
  dictation_suspended: "Dictation is suspended. Focus Search, then start dictation again.", focus_search_first: "Run focus Search before starting dictation.",
  undo_unavailable: "No unchanged Latham edit is available to correct or undo.", text_too_long: "Use at most 1,000 characters per utterance.",
  edit_blocked: "This field is not a supported plain search field, or its text is too long.", empty_search: "Enter a search query first.",
  reload_required: "Reload the affected page and reconnect the extension.", document_unavailable: "The Chrome document is unavailable. Reload it and reconnect.",
  verification_failed: "The intended effect could not be verified. Inspect Chrome before continuing.", navigation_unverified: "Navigation was issued but the expected loaded page could not be verified.",
  navigation_changed_origin: "Navigation left the approved origin. Inspect Chrome before continuing.", authentication_failed: "The Gemini key was rejected.", quota_or_rate_limit: "The provider quota or rate limit was reached.",
  provider_unavailable: "The selected provider is unavailable. Nothing was substituted.", invalid_selection: "The provider returned an invalid target. Nothing was dispatched.", invalid_provider_response: "The provider returned an invalid response.",
  local_model_required: "Use an installed local Ollama model.", unsupported_filter: "Use all/images/videos/news on Google Search, or all/remote on USAJOBS.",
  chrome_session_paused: "Start a Chrome session first.", chrome_busy: "Wait for the current Chrome operation or press Stop.", invalid_request: "Use a supported command.",
  site_restricted: "The site requires human verification or denies access. Complete it yourself or choose another site.",
  timeout: "The selected provider timed out. Nothing was dispatched."
};
export class BrowserController {
  state: PageState = emptyPageState();
  private generation = 0;
  private abort = new AbortController();
  private binding: PageScope | null = null;
  bindingId: string | null = null;
  private clarification: { scope: PageScope; targets: PageTarget[]; kind: "click" | "focus" } | null = null;
  constructor(private chrome: ChromeBridge, private store: ProviderStore, private changed: () => void) { chrome.onInvalidate = () => this.stop(); }
  stop(): void { this.generation++; this.abort.abort(); this.abort = new AbortController(); this.binding = null; this.bindingId = null; this.clarification = null; this.state = { ...this.state, dictation: null, clarification: [], targets: [], status: "Page session paused" }; this.changed(); }
  private async reply(request: object, mutation = false): Promise<Record<string, unknown>> {
    const value = await this.chrome.request(request, mutation);
    if (!record(value) || !["verified", "blocked", "unknown"].includes(String(value.outcome))) throw new Error("cancelled");
    if (value.outcome !== "verified") { if (value.outcome === "unknown") this.chrome.result = reasons[String(value.reason)] ?? reasons.verification_failed!; throw new Error(String(value.reason)); }
    return value;
  }
  private async observe(frames = false): Promise<PageScope> {
    const reply = await this.reply({ kind: frames ? "frames_snapshot" : "snapshot" }); const scope = parsePageScope(reply.scope);
    if (!this.chrome.siteState.some(site => site.effective && site.origin === new URL(scope.snapshot.url).origin)) throw new Error("scope_denied");
    this.state.targets = scope.snapshot.targets.map(({ name, role }) => ({ name, role })); this.state.status = `${scope.snapshot.profile} · main frame · ${scope.snapshot.deniedFrames} excluded frames`; this.changed(); return scope;
  }
  private action(scope: PageScope, action: PageAction): Promise<Record<string, unknown>> { return this.reply({ kind: "action", scope, action }, true); }
  async run(input: unknown): Promise<void> {
    if (!this.chrome.active) throw new Error("chrome_session_paused");
    if (this.state.busy) throw new Error("chrome_busy");
    const intent = parsePageIntent(input);
    if (!intent) { this.binding = null; this.bindingId = null; this.state.dictation = null; this.clarification = null; try { await this.chrome.run(input); } catch { this.chrome.result = "Unsupported command. Use the documented Chrome shortcuts or reviewed page commands."; this.state.last = { outcome: "blocked", reason: this.chrome.result, elapsedMs: 0 }; } this.changed(); return; }
    const generation = this.generation, started = performance.now(), signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(60000)]);
    this.state.busy = true; this.state.last = null; this.changed();
    try {
      if ((intent.kind === "click" || intent.kind === "focus") && /\b(send|submit|upload|message|post|comment|like|subscribe|account|password|apply|purchase|buy|delete|continue)\b/i.test(intent.label)) throw new Error("unknown_effect");
      if (intent.kind === "choose") {
        const choice = this.clarification, target = choice?.targets[intent.index];
        if (!choice || !target) throw new Error("target_missing");
        await this.action(choice.scope, { kind: choice.kind, targetId: target.id, revision: target.revision }); this.clarification = null; this.state.clarification = [];
      } else if (intent.kind === "edit" || intent.kind === "undo" || intent.kind === "unbind") {
        if (!this.binding) throw new Error("dictation_suspended");
        await this.action(this.binding, intent.kind === "edit" ? { kind: "edit", text: intent.text, mode: intent.mode } : { kind: intent.kind });
        if (intent.kind === "unbind") { this.binding = null; this.bindingId = null; this.state.dictation = null; }
      } else {
        this.clarification = null; this.state.clarification = [];
        const scope = await this.observe(intent.kind === "frames" || intent.kind === "click" && intent.label === "@frame"); signal.throwIfAborted();
        if (intent.kind === "scroll") await this.action(scope, intent);
        else if (intent.kind === "filter") {
          if (!scope.snapshot.searchAvailable) throw new Error("target_missing");
          const destination = filterDestination(scope.snapshot.url, intent.filter);
          await this.reply({ kind: "navigate", scope, destination }, true); this.binding = null; this.bindingId = null; this.state.dictation = null;
        } else if (intent.kind === "search") {
          if (!scope.snapshot.searchAvailable) throw new Error("target_missing");
          const destination = searchDestination(scope.snapshot.profile, intent.text);
          await this.reply({ kind: "navigate", scope, destination }, true); this.binding = null; this.bindingId = null; this.state.dictation = null;
        } else if (intent.kind !== "observe" && intent.kind !== "frames") {
          const kind = intent.kind === "bind" ? "bind" : intent.kind;
          let candidates = scope.snapshot.targets.filter(target => kind === "bind" ? target.actions.includes("edit") : kind === "focus" ? target.actions.includes("focus") : target.actions.includes("navigate"));
          if (intent.kind !== "bind") {
            const label = intent.label.trim().toLowerCase().replace(/[.!]$/, "");
            const exact = candidates.filter(target => label === "@result" ? target.profile === "result" : label === "@frame" ? target.profile === "frame" : target.name.toLowerCase().replace(/[.!]$/, "") === label);
            if (intent.ordinal !== undefined) candidates = exact[intent.ordinal] ? [exact[intent.ordinal]!] : [];
            else if (exact.length) candidates = exact;
            else if (candidates.length) {
              this.state.status = "Selecting within the current approved page"; this.changed();
              const route = this.store.settings.mode === "local" ? { mode: "local" as const, model: this.store.settings.ollamaModel } : { mode: "cloud" as const, key: this.store.key() };
              const selection = await selectCandidate(route, `${kind} ${intent.label}`, candidates.map(target => ({ id: target.id, label: target.name, role: target.role })), signal);
              signal.throwIfAborted(); candidates = candidates.filter(target => target.id === selection.candidateId);
              if (!candidates.length) throw new Error("provider_abstained");
            }
          }
          if (!candidates.length) throw new Error("target_missing");
          if (candidates.length > 1) { this.clarification = { scope, targets: candidates, kind: kind === "bind" ? "focus" : kind }; this.state.clarification = candidates.map((target, index) => `${index + 1}. ${target.name}`); throw new Error("ambiguous_target"); }
          signal.throwIfAborted();
          const target = candidates[0]!; await this.action(scope, { kind, targetId: target.id, revision: target.revision });
          if (kind === "bind") { this.binding = scope; this.bindingId = randomUUID(); this.state.dictation = target.name; }
          else if (kind === "click") { this.binding = null; this.bindingId = null; this.state.dictation = null; }
        }
      }
      if (generation === this.generation) { this.state.last = { outcome: "verified", reason: "The intended effect was verified in the bound Chrome document.", elapsedMs: Math.round(performance.now() - started) }; this.chrome.result = "Verified page result"; }
    } catch (error) {
      const reason = signal.aborted ? (generation !== this.generation ? "cancelled" : "timeout") : (error as Error).message;
      if (generation === this.generation) { if (["dictation_suspended", "stale_target"].includes(reason)) { this.binding = null; this.bindingId = null; this.state.dictation = null; } this.state.last = { outcome: this.chrome.needsReview ? "unknown" : "blocked", reason: reasons[reason] ?? "This operation is unsupported or its provider is unavailable. Nothing was substituted.", elapsedMs: Math.round(performance.now() - started) }; this.chrome.result = this.state.last.reason; }
    } finally { this.state.busy = false; this.changed(); }
  }
}
