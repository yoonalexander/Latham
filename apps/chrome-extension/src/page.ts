import type { PageAction, PageSnapshot, PageTarget } from "../../../packages/contracts/src/browser";
declare const chrome: { runtime: { sendMessage(value: unknown): Promise<unknown> } };
type Field = HTMLInputElement | HTMLTextAreaElement;
type Captured = { node: HTMLElement; target: PageTarget; fingerprint: string };
type Binding = { node: Field; focus: number; edits: number; expected: string; undo: { before: string; after: string; start: number; end: number; mode: "append" | "replace" } | null };
type Request = { op: "snapshot" | "action" | "fence" | "verify"; session: string; epoch: number; active?: boolean; document?: string; url?: string; action?: PageAction; proof?: string };
type Agent = { call(request: Request): unknown };
const world = globalThis as typeof globalThis & { lathamPage?: Agent };
if (!world.lathamPage) {
  let epoch = -1, active = false, documentToken = crypto.randomUUID(), focus = 0, edits = 0;
  let session = ""; const retired = new Set<string>();
  let binding: Binding | null = null;
  let proof: { id: string; node: Field; expected: string; focus: number; edits: number; url: string; document: string } | null = null;
  const captures = new Map<string, Captured>();
  const notify = (): void => { binding = null; void chrome.runtime.sendMessage({ type: "page_invalidated", document: documentToken }).catch(() => {}); };
  document.addEventListener("focusin", event => { if (binding && event.target === binding.node) return; focus++; if (binding && document.activeElement !== binding.node) notify(); }, true);
  document.addEventListener("focusout", event => {
    const previous = binding;
    if (!previous) { focus++; return; }
    // Moving to Latham's push-to-talk window preserves Chrome's active field; a real field change does not.
    if (event.relatedTarget || document.hasFocus()) { focus++; notify(); return; }
    queueMicrotask(() => { if (binding === previous && document.activeElement !== previous.node) { focus++; notify(); } });
  }, true);
  document.addEventListener("input", event => { if (event.isTrusted) { edits++; if (binding) notify(); } }, true);
  document.addEventListener("change", event => { if (event.isTrusted) { edits++; if (binding) notify(); } }, true);
  addEventListener("pagehide", () => { active = false; binding = null; proof = null; captures.clear(); });
  addEventListener("pageshow", event => { if (event.persisted) { documentToken = crypto.randomUUID(); active = false; binding = null; captures.clear(); } });
  const visible = (node: HTMLElement, viewport = true): boolean => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return node.isConnected && rect.width > 0 && rect.height > 0 && (!viewport || (rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)) && Number(style.opacity) > 0 && style.display !== "none" && style.visibility !== "hidden" && !node.closest('[inert],[hidden],[aria-hidden="true"]'); };
  const enabled = (node: HTMLElement): boolean => !node.matches(":disabled,[aria-disabled=true]");
  const profile = (): "google" | "youtube" => {
    if (location.origin === "https://www.google.com" && ["/", "/search", "/webhp"].includes(location.pathname)) return "google";
    if (location.origin === "https://www.youtube.com" && ["/", "/results", "/watch"].includes(location.pathname)) return "youtube";
    throw new Error("unsupported_page");
  };
  function field(viewport = true): Field | null {
    const p = profile();
    const nodes = [...document.querySelectorAll<Field>(p === "google" ? 'form[action] textarea[name="q"],form[action] input[name="q"]' : 'ytd-searchbox input[name="search_query"],yt-searchbox input[name="search_query"],form#search-form input[name="search_query"]')];
    return nodes.find(node => {
      if (!visible(node, viewport) || !enabled(node) || node.readOnly || node.value.length > 2000 || (node instanceof HTMLInputElement && !["text", "search"].includes(node.type)) || /password|one-time-code|cc-|webauthn/i.test(node.autocomplete)) return false;
      if (p === "google") { const form = node.form; if (!form || form.method.toLowerCase() !== "get") return false; const url = new URL(form.action); if (url.origin !== location.origin || url.pathname !== "/search") return false; }
      return true;
    }) ?? null;
  }
  const fingerprint = (node: HTMLElement): string => JSON.stringify({ url: location.href, visible: visible(node), enabled: enabled(node), name: node.getAttribute("aria-label"), text: node instanceof HTMLAnchorElement ? node.textContent?.trim().slice(0, 120) : "", href: node instanceof HTMLAnchorElement ? node.href : "", value: node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : "", field: field() === node });
  function snapshot(): PageSnapshot {
    captures.clear(); const p = profile(), query = field(); const targets: PageTarget[] = [];
    const add = (node: HTMLElement, name: string, role: PageTarget["role"], kind: PageTarget["profile"], actions: PageTarget["actions"]): void => {
      if (!visible(node) || !enabled(node) || targets.length >= 24) return;
      const target: PageTarget = { id: crypto.randomUUID(), revision: crypto.randomUUID(), name: name.trim().slice(0, 120), role, profile: kind, actions };
      captures.set(target.id, { node, target, fingerprint: fingerprint(node) }); targets.push(target);
    };
    if (query) {
      add(query, "Search", "textbox", "search_field", ["focus", "edit"]);
      const button = p === "google" ? [...query.form!.querySelectorAll<HTMLElement>('input[name="btnK"][type="submit"],button[type="submit"]')].find(node => visible(node)) : document.querySelector<HTMLElement>('button#search-icon-legacy,yt-searchbox button[aria-label="Search YouTube"],yt-searchbox button[aria-label="Search"]');
      if (button) add(button, "Search", "button", "search_submit", ["navigate"]);
    }
    if (p === "youtube") for (const node of document.querySelectorAll<HTMLAnchorElement>('ytd-video-renderer a#video-title,ytd-rich-item-renderer a#video-title-link')) {
      try { const url = new URL(node.href); if (url.origin === location.origin && url.pathname === "/watch" && /^[\w-]{11}$/.test(url.searchParams.get("v") ?? "")) add(node, node.textContent ?? "Video", "link", "result", ["navigate"]); } catch { /* Not a reviewed video link. */ }
    }
    return { document: documentToken, url: location.href, profile: p, searchAvailable: field(false) !== null, targets, deniedFrames: document.querySelectorAll("iframe,frame").length };
  }
  function bound(): Binding {
    if (!binding || !binding.node.isConnected || field() !== binding.node || document.activeElement !== binding.node || focus !== binding.focus || edits !== binding.edits || binding.node.value !== binding.expected) { binding = null; throw new Error("dictation_suspended"); }
    return binding;
  }
  function setValue(node: Field, value: string, start: number, end: number): void {
    if (value.length > 2000 || !visible(node) || !enabled(node) || field() !== node) throw new Error("edit_blocked");
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value); node.setSelectionRange(start, end);
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    if (node.value !== value || document.activeElement !== node) throw new Error("verification_failed");
  }
  function act(action: PageAction): object {
    if (action.kind === "unbind") { binding = null; return { outcome: "verified" }; }
    if (action.kind === "scroll") { const before = scrollY; scrollBy({ top: action.direction === "down" ? 600 : -600, behavior: "instant" }); return { outcome: "verified", reason: scrollY === before ? "scroll_boundary" : "scrolled" }; }
    if (action.kind === "edit" || action.kind === "undo") {
      const b = bound();
      if (action.kind === "undo") {
        if (!b.undo || b.node.value !== b.undo.after) throw new Error("undo_unavailable");
        setValue(b.node, b.undo.before, b.undo.start, b.undo.end); b.expected = b.undo.before; b.undo = null; proof = { id: crypto.randomUUID(), node: b.node, expected: b.expected, focus, edits, url: location.href, document: documentToken }; return { outcome: "verified", bound: "Search", proof: proof.id };
      }
      if (typeof action.text !== "string" || !action.text || action.text.length > 1000 || !["append", "replace", "correct"].includes(action.mode)) throw new Error("edit_blocked");
      const before = b.node.value, start = b.node.selectionStart ?? before.length, end = b.node.selectionEnd ?? start;
      if (action.mode === "correct" && (!b.undo || b.undo.after !== before)) throw new Error("undo_unavailable");
      const previous = b.undo, base = action.mode === "correct" ? previous!.before : before;
      const mode = action.mode === "correct" ? previous!.mode : action.mode;
      const value = mode === "replace" ? action.text : base + (base && !/\s$/.test(base) ? " " : "") + action.text;
      setValue(b.node, value, value.length, value.length); b.expected = value; b.undo = { before: base, after: value, start: action.mode === "correct" ? previous!.start : start, end: action.mode === "correct" ? previous!.end : end, mode }; proof = { id: crypto.randomUUID(), node: b.node, expected: value, focus, edits, url: location.href, document: documentToken }; return { outcome: "verified", bound: "Search", proof: proof.id };
    }
    const captured = captures.get(action.targetId);
    if (!captured || captured.target.revision !== action.revision || !captured.node.isConnected || captured.fingerprint !== fingerprint(captured.node)) throw new Error("stale_target");
    if (action.kind === "focus" || action.kind === "bind") {
      if (captured.target.profile !== "search_field" || field() !== captured.node) throw new Error("unknown_effect");
      if (action.kind === "bind" && document.activeElement !== captured.node) throw new Error("focus_search_first");
      captured.node.focus(); if (document.activeElement !== captured.node) throw new Error("verification_failed");
      if (action.kind === "bind") { const node = captured.node as Field; binding = { node, focus, edits, expected: node.value, undo: null }; return { outcome: "verified", bound: "Search" }; }
      return { outcome: "verified" };
    }
    binding = null;
    if (captured.target.profile === "search_submit") { const query = field(); if (!query || !query.value.trim() || query.value.length > 1000) throw new Error("empty_search"); return { outcome: "verified", destination: searchUrl(query.value) }; }
    if (captured.target.profile === "result" && captured.node instanceof HTMLAnchorElement) return { outcome: "verified", destination: captured.node.href };
    throw new Error("unknown_effect");
  }
  function searchUrl(text: string): string { const url = new URL(profile() === "google" ? "/search" : "/results", location.origin); url.searchParams.set(profile() === "google" ? "q" : "search_query", text); return url.href; }
  world.lathamPage = { call(request) {
    try {
      if (request.op === "fence") {
        if (typeof request.session !== "string" || retired.has(request.session)) throw new Error("cancelled");
        if (session !== request.session) { if (retired.size >= 64) throw new Error("reload_required"); if (session) retired.add(session); session = request.session; epoch = -1; }
        if (request.epoch < epoch) throw new Error("cancelled"); epoch = request.epoch; active = request.active === true; binding = null; proof = null; captures.clear(); return { outcome: "verified" };
      }
      if (!active || request.session !== session || request.epoch !== epoch) throw new Error("cancelled");
      if (request.op === "verify") {
        if (!proof || request.proof !== proof.id || proof.url !== location.href || proof.document !== documentToken || proof.node.value !== proof.expected || document.activeElement !== proof.node || field() !== proof.node || focus !== proof.focus || edits !== proof.edits) throw new Error("verification_failed");
        proof = null; return { outcome: "verified", bound: "Search" };
      }
      if (request.op === "snapshot") return { outcome: "verified", snapshot: snapshot() };
      if (request.document !== documentToken || request.url !== location.href || !request.action) throw new Error("stale_target");
      return act(request.action);
    } catch (error) { const reason = (error as Error).message; return { outcome: reason === "verification_failed" ? "unknown" : "blocked", reason }; }
  } };
}
