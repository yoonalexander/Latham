import type { PageAction, PageTarget } from "../../../packages/contracts/src/browser";
type Item = { node: HTMLElement; target: PageTarget };
type Request = { op: string; token?: string; targetId?: string };
export function createVisualAgent(items: () => Item[]) {
  let version = 0;
  let overlay: HTMLDivElement | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const owned = new WeakSet<Node>();
  type Ref = { item: Item; image: HTMLImageElement; source: string; currentSource: string; rect: ReturnType<typeof rect>; href: string };
  let capture: { token: string; version: number; expires: number; url: string; viewport: string; refs: Map<string, Ref> } | null = null;
  const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const viewport = (): string => JSON.stringify([innerWidth, innerHeight, scrollX, scrollY, devicePixelRatio, visualViewport?.scale, visualViewport?.offsetLeft, visualViewport?.offsetTop]);
  const clear = (): void => { overlay?.remove(); overlay = null; capture = null; clearTimeout(expiry); };
  const invalidate = (): void => { version++; overlay?.remove(); overlay = null; };
  const observer = new MutationObserver(records => { if (records.some(r => !owned.has(r.target) && !(r.type === "childList" && [...r.addedNodes, ...r.removedNodes].every(n => owned.has(n))))) invalidate(); });
  observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  addEventListener("scroll", invalidate, true); addEventListener("resize", invalidate); addEventListener("pagehide", clear);
  const visible = (node: HTMLImageElement): boolean => {
    const r = rect(node), style = getComputedStyle(node);
    if (!node.isConnected || !node.complete || !node.naturalWidth || r.width < 24 || r.height < 24 || r.x < 0 || r.y < 0 || r.x + r.width > innerWidth || r.y + r.height > innerHeight || style.visibility !== "visible" || Number(style.opacity) !== 1 || node.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
    for (let parent: Element | null = node; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent); if (css.visibility !== "visible" || Number(css.opacity) !== 1 || css.display === "none" || css.filter !== "none" || css.clipPath !== "none" || css.mixBlendMode !== "normal") return false;
    }
    for (const x of [0.1, 0.5, 0.9]) for (const y of [0.1, 0.5, 0.9]) {
      const hit = document.elementFromPoint(r.x + r.width * x, r.y + r.height * y);
      if (hit !== node && !(hit instanceof HTMLAnchorElement && hit.contains(node))) return false;
    }
    return true;
  };
  const valid = (request: Request): Ref[] => {
    const c = capture;
    if (!c || request.token !== c.token || c.version !== version || c.expires < performance.now() || c.url !== location.href || c.viewport !== viewport()) throw new Error("visual_stale");
    for (const ref of c.refs.values()) if (!ref.item.node.isConnected || !(ref.item.node instanceof HTMLAnchorElement) || ref.item.node.href !== ref.href || ref.image.currentSrc !== ref.currentSource || JSON.stringify(rect(ref.image)) !== JSON.stringify(ref.rect) || !visible(ref.image)) throw new Error("visual_stale");
    return [...c.refs.values()];
  };
  return { clear, call(request: Request): unknown {
    if (request.op === "visual_clear") { clear(); return { outcome: "verified" }; }
    if (request.op === "visual_prepare") {
      clear(); if (location.origin !== "https://www.youtube.com" || !["/", "/results", "/watch"].includes(location.pathname)) throw new Error("visual_scope_denied");
      const refs = new Map<string, Ref>();
      for (const item of items()) {
        if (item.target.profile !== "result" || !(item.node instanceof HTMLAnchorElement)) continue;
        const id = new URL(item.node.href).searchParams.get("v"), card = item.node.closest("ytd-video-renderer,ytd-rich-item-renderer");
        const image = card?.querySelector<HTMLImageElement>("img");
        if (!id || !image || !visible(image)) continue;
        const currentSource = image.currentSrc, address = new URL(currentSource), source = address.origin + address.pathname;
        // Capture only the public JPEG belonging to this already-reviewed video.
        if (address.username || address.password || !new RegExp("^https://i\\.ytimg\\.com/vi/" + id + "/(?:hq720|hqdefault|mqdefault|default|sddefault|maxresdefault)\\.jpg$").test(source)) continue;
        refs.set(item.target.id, { item, image, source, currentSource, rect: rect(image), href: item.node.href }); if (refs.size === 4) break;
      }
      if (!refs.size) throw new Error("visual_no_candidates");
      capture = { token: crypto.randomUUID(), version, expires: performance.now() + 60000, url: location.href, viewport: viewport(), refs };
      expiry = setTimeout(clear, 60000);
      return { outcome: "verified", token: capture.token, candidates: [...refs.values()].map(r => ({ id: r.item.target.id, revision: r.item.target.revision, label: r.item.target.name, source: r.source, rect: r.rect })) };
    }
    const refs = valid(request);
    if (request.op === "visual_validate") return { outcome: "verified" };
    const ref = refs.find(r => r.item.target.id === request.targetId); if (!ref) throw new Error("visual_invalid_target");
    if (request.op === "visual_highlight") {
      overlay?.remove(); overlay = document.createElement("div"); owned.add(overlay);
      const r = ref.rect; overlay.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;outline:4px solid #165dcc;pointer-events:none;z-index:2147483647`;
      overlay.setAttribute("aria-label", "Latham proposed video"); document.documentElement.append(overlay); return { outcome: "verified" };
    }
    if (request.op === "visual_open") return { kind: "click", targetId: ref.item.target.id, revision: ref.item.target.revision } satisfies PageAction;
    throw new Error("invalid_visual_request");
  } };
}
