import { test, expect } from "vitest";
import { sites, siteForPage, searchDestination, filterDestination, reviewedResult, navigationMatches } from "../../packages/contracts/src/sites";
import { parsePageIntent, parsePageScope } from "../../packages/contracts/src/browser";
import { readFileSync } from "node:fs";

test("the compiled catalog and exact optional-host manifest stay aligned", () => {
  const manifest = JSON.parse(readFileSync("apps/chrome-extension/manifest.json", "utf8"));
  expect(manifest.host_permissions).toBeUndefined(); expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.optional_host_permissions.filter((origin: string) => !origin.includes("ytimg"))).toEqual(sites.map(site => site.pattern));
});

test("every catalog recipe encodes literal queries without creating action parameters", () => {
  for (const site of sites) {
    const url = new URL(searchDestination(site.id, "piano & action=delete # !bang"));
    expect(url.origin).toBe(site.origin); expect(siteForPage(url.href)?.id).toBe(site.id);
    expect(url.searchParams.has("action")).toBe(false); expect(url.hash).toBe("");
  }
  expect(new URL(searchDestination("wikipedia", "Piano")).searchParams.get("fulltext")).toBe("1");
  expect(new URL(searchDestination("github", "piano")).searchParams.get("type")).toBe("repositories");
});
test("catalog profiles exclude account, submission, edit and unknown routes", () => {
  for (const url of ["https://github.com/login", "https://github.com/acme/repo/issues/new", "https://github.com/settings/profile", "https://en.wikipedia.org/w/index.php?title=Piano&action=edit", "https://en.wikipedia.org/wiki/Special:UserLogin", "https://en.wikipedia.org/wiki/Special%3AUserLogin", "https://developer.mozilla.org/en-US/docs/Web/$edit", "https://www.usajobs.gov/Applicant/Application", "https://stackoverflow.com/questions/ask", "https://stackoverflow.com/nocaptcha", "https://www.google.com.attacker.com/", "https://user@github.com/", "http://github.com/"]) expect(siteForPage(url), url).toBeUndefined();
  for (const url of ["https://github.com/acme/repo?delete=true", "https://github.com/acme/repo/settings", "https://www.usajobs.gov/job/123/apply", "https://stackoverflow.com/questions/123/edit", "https://en.wikipedia.org/wiki/Help:Contents"]) expect(reviewedResult(siteForPage(new URL(url).origin + "/")!.id, url), url).toBe(false);
});
test("job remote filtering preserves the query and cannot become an application", () => {
  const remote = filterDestination(searchDestination("usajobs", "software engineer"), "remote");
  expect(remote).toBe("https://www.usajobs.gov/Search/Results?k=software+engineer&rmi=true");
  expect(filterDestination(remote, "all")).toBe(searchDestination("usajobs", "software engineer"));
  expect(parsePageIntent("filter remote")).toEqual({ kind: "filter", filter: "remote" });
  for (const [url, filter] of [["https://github.com/search?q=work", "remote"], [remote, "images"], ["https://www.usajobs.gov/", "remote"]]) expect(() => filterDestination(url!, filter as "remote")).toThrow();
});
test("navigation verification checks every requested query value, duplicate and fragment", () => {
  const expected = searchDestination("usajobs", "music");
  expect(navigationMatches(expected, expected)).toBe(true);
  for (const actual of [expected.replace("music", "piano"), expected + "&rmi=true", expected + "&k=piano", expected + "#wrong", expected.replace("/Search/Results", "/login")]) expect(navigationMatches(expected, actual)).toBe(false);
  expect(navigationMatches(searchDestination("wikipedia", "piano"), searchDestination("wikipedia", "piano") + "&ns0=1")).toBe(true);
  expect(navigationMatches(searchDestination("duckduckgo", "piano"), searchDestination("duckduckgo", "piano") + "&ia=web")).toBe(true);
  expect(navigationMatches(searchDestination("duckduckgo", "piano"), searchDestination("duckduckgo", "piano") + "&ia=images")).toBe(false);
});
test("new profiles cannot advertise dictation privileges and frame commands are bounded", () => {
  const scope = { tabId: 1, windowId: 1, documentId: "doc", snapshot: { document: "token", url: "https://github.com/", profile: "github", searchAvailable: true, deniedFrames: 0, targets: [{ id: "search", revision: "r", name: "Search", role: "textbox", profile: "search_control", actions: ["focus"] }] } };
  expect(parsePageScope(scope).snapshot.targets[0]?.actions).toEqual(["focus"]);
  expect(() => parsePageScope({ ...scope, snapshot: { ...scope.snapshot, targets: [{ ...scope.snapshot.targets[0], profile: "search_field", actions: ["focus", "edit"] }] } })).toThrow("invalid_profile");
  expect(parsePageIntent("inspect frames")).toEqual({ kind: "frames" }); expect(parsePageIntent("open frame 4")).toEqual({ kind: "click", label: "@frame", ordinal: 3 }); expect(parsePageIntent("open frame 5")).toBeNull();
});
