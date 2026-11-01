import { record } from "../../../../packages/contracts/src/index";
import { emptyVisual, parseVisualCapture, parseVisualQuery, visualMatches, type VisualCapture } from "../../../../packages/contracts/src/visual";
import type { ChromeBridge } from "./native-bridge";
import { selectVisual } from "../../../../packages/speech/src/providers";
type Bridge = Pick<ChromeBridge, "active" | "connected" | "needsReview" | "request">;
const messages: Record<string, string> = {
  visual_image_grant_required: "Allow thumbnail images in the extension first.",
  visual_no_candidates: "No supported, fully visible YouTube thumbnails. Scroll them into view; unknown overlays block capture.",
  visual_scope_denied: "Visual capture supports approved YouTube video results only.",
  visual_stale: "The page, image, scale or layout changed. Capture again before choosing.",
  local_ocr_unavailable: "Local Windows OCR is unavailable. No provider was substituted.",
  local_vision_model_required: "Choose an installed local Ollama model with vision capability. No model was downloaded.",
  provider_unavailable: "The selected visual provider is unavailable. No route was substituted.",
  quota_or_rate_limit: "The visual provider quota or rate limit was reached.",
  authentication_failed: "The Gemini key was rejected.",
  scope_denied: "Approve YouTube and start a Chrome session before capturing.",
  cancelled: "Visual capture stopped. Start again explicitly."
};
export class VisualController {
  state = emptyVisual(); private capture: VisualCapture | null = null; private generation = 0; private abort = new AbortController(); private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(private chrome: Bridge, private ocr: (image: string, signal: AbortSignal) => Promise<string>, private key: () => string, private changed: () => void) {}
  stop(revoke = true): void {
    this.generation++; this.abort.abort(); this.abort = new AbortController(); clearTimeout(this.expiry); this.capture = null;
    this.state = { ...emptyVisual(), consent: !revoke && this.state.consent }; this.changed();
  }
  permission(value: unknown): void { if (typeof value !== "boolean") throw new Error("invalid_visual_permission"); this.stop(); this.state.consent = value; this.state.message = value ? "Thumbnail capture allowed for this session. Choose a route explicitly." : "Visual capture off."; this.changed(); }
  private guard(): void { if (!this.state.consent || !this.chrome.active || !this.chrome.connected || this.chrome.needsReview) throw new Error("scope_denied"); }
  private async reply(request: object, mutation = false): Promise<Record<string, unknown>> {
    this.guard(); const reply = await this.chrome.request(request, mutation);
    if (!record(reply) || reply.outcome !== "verified") throw new Error(record(reply) ? String(reply.reason) : "cancelled"); return reply;
  }
  async find(value: unknown): Promise<void> {
    this.guard(); if (this.state.busy) throw new Error("visual_busy"); const query = parseVisualQuery(value);
    this.stop(false); const generation = this.generation, signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(25000)]);
    this.state.busy = true; this.state.route = query.route; this.state.message = "Capturing reviewed thumbnail assets only…"; this.changed();
    try {
      const result = await this.reply({ kind: "visual_capture" }); if (generation !== this.generation) return;
      const capture = parseVisualCapture(result.capture); this.capture = capture;
      for (const candidate of capture.candidates) { candidate.text = await this.ocr(candidate.image, signal); signal.throwIfAborted(); }
      if (generation !== this.generation) return;
      await this.reply({ kind: "visual_validate", scope: capture.scope, token: capture.token }); signal.throwIfAborted();
      let matches = visualMatches(query.text, capture.candidates);
      if (query.route !== "ocr") {
        this.state.message = query.route === "cloud" ? "Sending only approved thumbnails/OCR to Gemini…" : "Using the selected local vision model…"; this.changed();
        matches = await selectVisual(query.route === "cloud" ? { mode: "cloud", key: this.key() } : { mode: "local", model: query.model }, query.text, capture.candidates, signal);
      }
      signal.throwIfAborted(); if (generation !== this.generation) return;
      this.state.candidates = capture.candidates; this.state.ready = true;
      this.expiry = setTimeout(() => this.stop(false), 30000);
      if (matches.length === 1) await this.highlight(matches[0]!);
      else this.state.message = matches.length > 1 ? `Several candidates match (${capture.candidates.map((c, i) => matches.includes(c.id) ? String(i + 1) : "").filter(Boolean).join(", ")}). Review thumbnails and highlight one explicitly.` : "No confident visual match. Review the candidates; no action was taken.";
    } catch (error) {
      if (generation === this.generation) { this.capture = null; this.state.candidates = []; this.state.ready = false; this.state.message = messages[(error as Error).message] ?? "Visual result unavailable or unsupported. No action was substituted; capture again."; }
    } finally { if (generation === this.generation) { this.state.busy = false; this.changed(); } }
  }
  async highlight(id: unknown): Promise<void> {
    const capture = this.capture, generation = this.generation;
    if (!capture || typeof id !== "string" || !capture.candidates.some(c => c.id === id)) throw new Error("visual_invalid_target");
    await this.reply({ kind: "visual_highlight", scope: capture.scope, token: capture.token, targetId: id });
    if (generation !== this.generation) return; this.state.proposed = id; this.state.message = "Proposed thumbnail outlined in blue. Review it, then explicitly open the video."; this.changed();
  }
  async open(): Promise<void> {
    this.guard(); if (this.state.busy || !this.capture || !this.state.proposed) throw new Error("visual_not_prepared");
    const capture = this.capture, id = this.state.proposed, generation = this.generation; this.state.busy = true; this.changed();
    try { await this.reply({ kind: "visual_open", scope: capture.scope, token: capture.token, targetId: id }, true); if (generation === this.generation) { this.stop(false); this.state.message = "Video navigation verified."; } }
    catch (error) { if (generation === this.generation) { this.stop(false); this.state.message = messages[(error as Error).message] ?? "Navigation could not be verified. Inspect Chrome before continuing."; } }
    finally { if (generation === this.generation || !this.state.busy) { this.state.busy = false; this.changed(); } }
  }
}
