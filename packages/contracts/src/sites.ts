// Compiled read-query recipes. Labels and provider output never extend this catalog.
export const sites = [
  { id: "google", origin: "https://www.google.com", pattern: "https://www.google.com/*", name: "Google Search" },
  { id: "youtube", origin: "https://www.youtube.com", pattern: "https://www.youtube.com/*", name: "YouTube" },
  { id: "wikipedia", origin: "https://en.wikipedia.org", pattern: "https://en.wikipedia.org/*", name: "Wikipedia" },
  { id: "github", origin: "https://github.com", pattern: "https://github.com/*", name: "GitHub repositories" },
  { id: "mdn", origin: "https://developer.mozilla.org", pattern: "https://developer.mozilla.org/*", name: "MDN Web Docs" },
  { id: "usajobs", origin: "https://www.usajobs.gov", pattern: "https://www.usajobs.gov/*", name: "USAJOBS public search" },
  { id: "duckduckgo", origin: "https://duckduckgo.com", pattern: "https://duckduckgo.com/*", name: "DuckDuckGo" },
  { id: "stackoverflow", origin: "https://stackoverflow.com", pattern: "https://stackoverflow.com/*", name: "Stack Overflow" }
] as const;
export type SiteId = typeof sites[number]["id"];
export type SearchFilter = "all" | "images" | "videos" | "news" | "remote";
export function siteForPage(address: string): typeof sites[number] | undefined {
  const url = new URL(address);
  if (url.protocol !== "https:" || url.username || url.password) return;
  const site = sites.find(site => site.origin === url.origin);
  if (!site) return;
  const path = url.pathname;
  const allowed: Record<SiteId, boolean> = {
    google: ["/", "/search", "/webhp"].includes(path),
    youtube: ["/", "/results", "/watch"].includes(path),
    wikipedia: path === "/" || (path === "/w/index.php" && url.searchParams.get("title") === "Special:Search" && !url.searchParams.has("action")) || /^\/wiki\/[^:]+$/.test(path) && !url.search,
    github: ["/", "/search"].includes(path) || /^\/[\w.-]+\/[\w.-]+\/?$/.test(path) && !url.search && !/^\/(settings|orgs|users|marketplace|sponsors)\//.test(path),
    mdn: ["/", "/en-US/", "/en-US/search"].includes(path) || path.startsWith("/en-US/docs/") && !url.search && !/\$(edit|history|revision)/.test(path),
    usajobs: ["/", "/Search/Results"].includes(path) || /^\/job\/\d+\/?$/.test(path) && !url.search,
    duckduckgo: path === "/",
    stackoverflow: ["/", "/search", "/questions"].includes(path) || /^\/questions\/\d+(?:\/(?!edit(?:\/|$)|delete(?:\/|$))[\w-]+)?\/?$/.test(path) && !url.search
  };
  // Encoded route separators/colons must not smuggle an unreviewed operation.
  return allowed[site.id] && !/%(?:2f|3a|5c)/i.test(path) ? site : undefined;
}
export function searchDestination(id: SiteId, text: string): string {
  if (!text.trim() || text.length > 1000) throw new Error("empty_search");
  const site = sites.find(site => site.id === id)!;
  const recipes: Record<SiteId, [string, string]> = { google: ["/search", "q"], youtube: ["/results", "search_query"], wikipedia: ["/w/index.php", "search"], github: ["/search", "q"], mdn: ["/en-US/search", "q"], usajobs: ["/Search/Results", "k"], duckduckgo: ["/", "q"], stackoverflow: ["/search", "q"] };
  const [path, key] = recipes[id], url = new URL(path, site.origin);
  url.searchParams.set(key, text);
  if (id === "wikipedia") { url.searchParams.set("title", "Special:Search"); url.searchParams.set("fulltext", "1"); }
  if (id === "github") url.searchParams.set("type", "repositories");
  return url.href;
}
export function filterDestination(address: string, filter: SearchFilter): string {
  const site = siteForPage(address), current = new URL(address);
  if (!site || !["google", "usajobs"].includes(site.id) || (site.id === "google" ? !["all", "images", "videos", "news"].includes(filter) : !["all", "remote"].includes(filter))) throw new Error("unsupported_filter");
  const query = current.searchParams.get(site.id === "google" ? "q" : "k");
  if (!query || current.pathname !== (site.id === "google" ? "/search" : "/Search/Results")) throw new Error("empty_search");
  const url = new URL(searchDestination(site.id, query));
  if (site.id === "usajobs" && filter === "remote") url.searchParams.set("rmi", "true");
  if (site.id === "google") { const udm = { all: "", images: "2", videos: "7", news: "12", remote: "" }[filter]; if (udm) url.searchParams.set("udm", udm); }
  return url.href;
}
export function reviewedResult(id: SiteId, address: string): boolean {
  const site = siteForPage(address); if (site?.id !== id) return false;
  const url = new URL(address);
  if (id === "wikipedia") return url.pathname.startsWith("/wiki/") && !url.search;
  if (id === "github") return /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) && !url.search;
  if (id === "mdn") return url.pathname.startsWith("/en-US/docs/") && !url.search;
  if (id === "usajobs") return /^\/job\/\d+\/?$/.test(url.pathname) && !url.search;
  if (id === "stackoverflow") return /^\/questions\/\d+(?:\/[\w-]+)?\/?$/.test(url.pathname) && !url.search;
  return id === "youtube" && url.pathname === "/watch" && /^[\w-]{11}$/.test(url.searchParams.get("v") ?? "") && [...url.searchParams.keys()].every(key => key === "v");
}
export function navigationMatches(expected: string, actual: string): boolean {
  const a = new URL(expected), b = new URL(actual);
  const normalized: Record<string, string> = a.origin === "https://en.wikipedia.org" && a.pathname === "/w/index.php" ? { ns0: "1" } : a.origin === "https://duckduckgo.com" && a.pathname === "/" ? { ia: "web" } : {};
  return a.origin === b.origin && a.pathname === b.pathname && a.hash === b.hash && [...a.searchParams.keys()].every(key => JSON.stringify(a.searchParams.getAll(key)) === JSON.stringify(b.searchParams.getAll(key))) && [...b.searchParams.keys()].every(key => a.searchParams.has(key) || b.searchParams.getAll(key).length === 1 && normalized[key] === b.searchParams.get(key));
}
