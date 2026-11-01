import { reviewedResult, type SiteId } from "../../../packages/contracts/src/sites";

// Bounded open-root traversal; closed roots and unrendered virtual rows are excluded.
export function elements(root: Document | ShadowRoot, selector: string): HTMLElement[] {
  const roots: (Document | ShadowRoot)[] = [root], found: HTMLElement[] = [];
  let budget = 4000;
  for (let index = 0; index < roots.length && index < 16; index++) {
    for (const node of roots[index]!.querySelectorAll<HTMLElement>(selector)) { if (found.length >= 96) break; found.push(node); }
    // Give visible page content priority over large navigation menus when discovering roots.
    const nodes = [...roots[index]!.querySelectorAll<HTMLElement>("main *")].slice(0, 2000).concat([...roots[index]!.querySelectorAll<HTMLElement>("*")].slice(0, 2000));
    const discovered: ShadowRoot[] = [];
    for (const node of nodes) {
      if (--budget < 0) break;
      if (node.shadowRoot && !roots.includes(node.shadowRoot) && !discovered.includes(node.shadowRoot)) discovered.push(node.shadowRoot);
    }
    discovered.sort((a, b) => Number(!!a.host.closest("header,nav")) - Number(!!b.host.closest("header,nav")));
    for (const child of discovered) if (roots.length < 16) roots.push(child);
  }
  return found;
}
export function accessibleName(node: HTMLElement): string {
  const root = node.getRootNode() as Document | ShadowRoot;
  const labelled = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).slice(0, 4).map(id => root.getElementById(id)?.textContent ?? "").join(" ").trim();
  const labels = "labels" in node ? [...((node as HTMLInputElement).labels ?? [])].slice(0, 4).map(label => label.textContent ?? "").join(" ") : "";
  return (labelled || node.getAttribute("aria-label") || labels || node.getAttribute("title") || node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
}
export function rendered(node: HTMLElement): boolean {
  const view = node.ownerDocument.defaultView; if (!view) return false;
  const rect = node.getBoundingClientRect();
  if (!node.isConnected || !rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth || node.matches(":disabled,[aria-disabled=true]")) return false;
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement ?? (parent.getRootNode() instanceof view.ShadowRoot ? (parent.getRootNode() as ShadowRoot).host as HTMLElement : null)) {
    const style = view.getComputedStyle(parent);
    if (parent.matches('[inert],[hidden],[aria-hidden="true"]') || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  }
  const root = node.getRootNode() as Document | ShadowRoot;
  const hit = root.elementFromPoint(Math.max(0, Math.min(view.innerWidth - 1, rect.x + rect.width / 2)), Math.max(0, Math.min(view.innerHeight - 1, rect.y + rect.height / 2)));
  return hit === node || !!hit && node.contains(hit);
}
export function searchControls(root: Document | ShadowRoot): HTMLElement[] {
  return elements(root, 'input[type="search"],input[type="text"],input:not([type]),textarea').filter(node => {
    const field = node as HTMLInputElement;
    return rendered(node) && !field.readOnly && !/password|one-time-code|cc-|webauthn/i.test(field.autocomplete) && /\b(search|keywords?)\b/i.test(accessibleName(node));
  });
}
export function resultLinks(root: Document | ShadowRoot, site: SiteId): HTMLAnchorElement[] {
  const selectors: Partial<Record<SiteId, string>> = { wikipedia: ".mw-search-result-heading a", github: '[data-testid="results-list"] a[href],.search-title a[href]', mdn: '.search-results a[href],.search-result-entry a[href],.site-search__results h2 a[href]', usajobs: 'a.usajobs-search-result--core__title[href],a[data-search-result][href]', stackoverflow: '.s-post-summary--content-title a[href],.result-link a[href]' };
  const selector = selectors[site]; if (!selector) return [];
  return (elements(root, selector) as HTMLAnchorElement[]).filter(node => { try { return rendered(node) && reviewedResult(site, node.href) && !!accessibleName(node); } catch { return false; } });
}
