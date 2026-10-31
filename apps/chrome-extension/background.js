const sites = ["https://www.google.com", "https://www.youtube.com"];
let port, active = false, epoch = 0, busy = false, connection = "Disconnected";
let pageSession = crypto.randomUUID(), navigationExpected = false;
const agents = new Map();
const restoredAgents = chrome.storage.session.get("pageAgents").then(value => { for (const agent of value.pageAgents ?? []) if (Number.isInteger(agent.tabId) && typeof agent.documentId === "string") agents.set(agent.documentId, agent); });
const rememberAgents = () => chrome.storage.session.set({ pageAgents: [...agents.values()].map(({ tabId, documentId }) => ({ tabId, documentId })) });
const pageFence = generation => active && epoch === generation.epoch && pageSession === generation.session && port;
async function callPage(scope, request) {
  const results = await chrome.scripting.executeScript({ target: { tabId: scope.tabId, documentIds: [scope.documentId] }, world: "ISOLATED", func: request => globalThis.lathamPage?.call(request), args: [{ session: pageSession, ...request }] });
  const result = results.find(result => result.frameId === 0 && result.documentId === scope.documentId)?.result;
  if (!result) throw new Error("document_unavailable"); return result;
}
async function fencePages(generation) {
  const session = pageSession;
  await restoredAgents;
  let confirmed = true;
  for (const scope of agents.values()) {
    try { const tab = await chrome.tabs.get(scope.tabId); if (!tab || tab.status === "unloaded") { agents.delete(scope.documentId); continue; }
      if (session !== pageSession) return false;
      const result = await callPage(scope, { op: "fence", session, epoch: generation, active: false }); if (result.outcome !== "verified") confirmed = false;
    } catch { // A removed tab/document cannot run a document-ID-bound request. A denied live document needs reload/reconciliation.
      try { const results = await chrome.scripting.executeScript({ target: { tabId: scope.tabId, frameIds: [0] }, func: () => null }); if (results[0]?.documentId !== scope.documentId) agents.delete(scope.documentId); else confirmed = false; }
      catch { try { await chrome.tabs.get(scope.tabId); confirmed = false; } catch { agents.delete(scope.documentId); } }
    }
  }
  if (confirmed && session === pageSession) agents.clear();
  await rememberAgents(); return confirmed;
}
async function currentPage(generation) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!pageFence(generation) || !tab?.id || !tab.url || !await approved(tab.url)) throw new Error("scope_denied");
  if (tab.status !== "complete") throw new Error("page_loading"); return tab;
}
async function observePage(generation) {
  const tab = await currentPage(generation);
  const loaded = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "ISOLATED", files: ["page.js"] });
  const documentId = loaded.find(result => result.frameId === 0)?.documentId;
  if (!documentId || !pageFence(generation)) throw new Error("cancelled");
  const scope = { tabId: tab.id, windowId: tab.windowId, documentId };
  const old = agents.get(documentId);
  if (!old && agents.size >= 32) throw new Error("reload_required");
  agents.set(documentId, { ...scope, epoch: generation.epoch, session: generation.session }); await rememberAgents();
  if (!pageFence(generation)) throw new Error("cancelled");
  if (old?.epoch !== generation.epoch || old?.session !== generation.session) { const initialized = await callPage(scope, { op: "fence", session: generation.session, epoch: generation.epoch, active: true }); if (initialized.outcome !== "verified") throw new Error("reload_required"); }
  if (!pageFence(generation)) throw new Error("cancelled");
  const result = await callPage(scope, { op: "snapshot", session: generation.session, epoch: generation.epoch });
  if (!pageFence(generation) || result.outcome !== "verified" || result.snapshot?.url !== tab.url) throw new Error(result.reason ?? "stale_target");
  return { ...scope, snapshot: result.snapshot };
}
async function navigateVerified(tab, destination, generation) {
  if (typeof destination !== "string" || destination.length > 4096 || !await approved(destination) || !pageFence(generation)) return { outcome: "blocked", reason: "scope_denied" };
  const url = new URL(destination); if (url.protocol !== "https:" || url.username || url.password) return { outcome: "blocked", reason: "scope_denied" };
  navigationExpected = true;
  try {
    await chrome.tabs.update(tab.id, { url: destination });
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && pageFence(generation)) {
      const current = await chrome.tabs.get(tab.id);
      if (!current.url || new URL(current.url).origin !== url.origin) return { outcome: "unknown", reason: "navigation_changed_origin" };
      const actual = new URL(current.url), keys = url.pathname === "/watch" ? ["v"] : url.pathname === "/search" ? ["q", "udm"] : ["search_query"];
      if (current.status === "complete" && actual.pathname === url.pathname && keys.every(key => actual.searchParams.get(key) === url.searchParams.get(key))) {
        const scope = await observePage(generation);
        if (scope.tabId === tab.id && scope.snapshot.searchAvailable) return { outcome: "verified", reason: "navigation_verified", scope };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { outcome: "unknown", reason: "navigation_unverified" };
  } finally { if (generation.session === pageSession) navigationExpected = false; }
}
async function pageRequest(message) {
  const generation = { epoch, session: pageSession }; let result = { outcome: "blocked", reason: "scope_denied" }, issued = false; busy = true;
  try {
    if (!pageFence(generation)) return;
    if (message.request?.kind === "snapshot") result = { outcome: "verified", scope: await observePage(generation) };
    else {
      const scope = message.request?.scope, tab = await currentPage(generation);
      if (!scope || tab.id !== scope.tabId || tab.windowId !== scope.windowId || tab.url !== scope.snapshot?.url) throw new Error("stale_target");
      if (message.request.kind === "navigate") { issued = true; result = await navigateVerified(tab, message.request.destination, generation); }
      else if (message.request.kind === "action") {
        if (!pageFence(generation)) throw new Error("cancelled");
        issued = true;
        result = await callPage(scope, { op: "action", session: generation.session, epoch: generation.epoch, document: scope.snapshot.document, url: scope.snapshot.url, action: message.request.action });
        if (result.proof && result.outcome === "verified") {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!pageFence(generation)) throw new Error("cancelled");
          result = await callPage(scope, { op: "verify", session: generation.session, epoch: generation.epoch, proof: result.proof });
        }
        if (result.destination) result = await navigateVerified(tab, result.destination, generation);
      }
    }
  } catch (error) { result = { outcome: issued ? "unknown" : "blocked", reason: ["scope_denied", "cancelled", "stale_target", "unsupported_page", "reload_required", "page_loading"].includes(error.message) ? error.message : "document_unavailable" }; }
  finally { if (generation.session === pageSession) { busy = false; send({ type: "page_result", id: message.id, epoch: message.epoch, ...result }); } }
}
const send = value => { try { port?.postMessage(value); } catch { disconnect(); } };
function disconnect() { const previous = port; port = undefined; active = false; busy = false; navigationExpected = false; pageSession = crypto.randomUUID(); epoch++; connection = "Disconnected — open Latham and connect again"; try { previous?.disconnect(); } catch {} }
async function grants() { const origins = []; for (const origin of sites) if (await chrome.permissions.contains({ origins: [origin + "/*"] })) origins.push(origin); send({ type: "grants", origins }); return origins; }
async function consent() { const stored = await chrome.storage.local.get("consent"); return Array.isArray(stored.consent) ? stored.consent.filter(origin => sites.includes(origin)) : []; }
async function approved(url) {
  try { const origin = new URL(url).origin; return (await consent()).includes(origin) && await chrome.permissions.contains({ origins: [origin + "/*"] }); } catch { return false; }
}
function connect() {
  if (port) return;
  active = false; epoch++; pageSession = crypto.randomUUID(); connection = "Connecting";
  const connectedPort = chrome.runtime.connectNative("com.latham.host"); port = connectedPort;
  connectedPort.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (port === connectedPort) disconnect(); });
  connectedPort.onMessage.addListener(message => { if (port === connectedPort) void receive(message).catch(() => { active = false; epoch++; }); });
}
async function receive(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "pause") { active = false; epoch = message.epoch; const generation = epoch, session = pageSession; if (await fencePages(generation) && generation === epoch && session === pageSession) send({ type: "paused", epoch }); return; }
  if (message.type === "resume" && Number.isSafeInteger(message.epoch)) { active = true; epoch = message.epoch; return; }
  if (message.type === "sync" && Array.isArray(message.consent)) {
    if (message.protocol !== 2) { active = false; connection = "Incompatible Latham desktop. Update the desktop and register its host."; return; }
    active = false; connection = "Connected — start a Chrome session in Latham";
    send({ type: "ready", protocol: 2, version: chrome.runtime.getManifest().version });
    const saved = await consent(), kept = saved.filter(origin => message.consent.includes(origin));
    await chrome.storage.local.set({ consent: kept });
    // A grant removed while disconnected also removes Latham's mirror on this reconnect.
    await grants(); send({ type: "reconcile", origins: kept }); return;
  }
  if (message.type === "revoke" && sites.includes(message.origin)) {
    active = false; epoch++; await chrome.storage.local.set({ consent: (await consent()).filter(origin => origin !== message.origin) });
    await chrome.permissions.remove({ origins: [message.origin + "/*"] }); await grants(); return;
  }
  if (message.type === "page_request" && typeof message.id === "string" && message.id.length <= 64 && message.epoch === epoch && !busy) { await pageRequest(message); return; }
  if (message.type !== "command" || typeof message.id !== "string" || message.id.length > 64 || message.epoch !== epoch || busy) return;
  const generation = epoch, session = pageSession, command = message.command;
  const fence = () => active && epoch === generation && pageSession === session && port;
  let outcome = "blocked";
  busy = true; navigationExpected = true;
  try {
    if (!fence() || !command || typeof command !== "object") return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!fence()) return;
    if (command.kind === "new_tab") {
      const created = await chrome.tabs.create({ active: true, url: "about:blank" });
      const current = await chrome.tabs.get(created.id); outcome = current.active ? "verified" : "unknown";
    } else if (["next_tab", "previous_tab"].includes(command.kind) && tab) {
      const tabs = (await chrome.tabs.query({ windowId: tab.windowId })).sort((a, b) => a.index - b.index);
      const index = tabs.findIndex(item => item.id === tab.id), offset = command.kind === "next_tab" ? 1 : -1;
      const target = tabs[(index + offset + tabs.length) % tabs.length];
      if (!target || !fence()) return;
      await chrome.tabs.update(target.id, { active: true }); outcome = (await chrome.tabs.get(target.id)).active ? "verified" : "unknown";
    } else if (command.kind === "navigate" && tab && typeof command.url === "string" && command.url.length <= 2000) {
      const url = new URL(command.url);
      if (url.protocol !== "https:" || url.username || url.password || !await approved(url.href) || !fence()) return;
      await chrome.tabs.update(tab.id, { url: url.href }); outcome = "dispatched";
    } else if (["back", "forward"].includes(command.kind) && tab?.url && await approved(tab.url) && fence()) {
      if (command.kind === "back") await chrome.tabs.goBack(tab.id); else await chrome.tabs.goForward(tab.id);
      outcome = "dispatched";
    }
  } catch { outcome = "unknown"; }
  finally { if (session === pageSession) { busy = false; navigationExpected = false; send({ type: "result", id: message.id, epoch: message.epoch, outcome }); } }
}
chrome.permissions.onRemoved.addListener(() => {
  active = false; epoch++;
  void (async () => { const current = await grants(), kept = (await consent()).filter(origin => current.includes(origin)); await chrome.storage.local.set({ consent: kept }); send({ type: "reconcile", origins: kept }); })();
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "page_invalidated" && sender.id === chrome.runtime.id && sender.tab?.id && sender.frameId === 0 && agents.has(sender.documentId) && active) { send({ type: "context_changed" }); return; }
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) return;
  void (async () => {
    if (message?.type === "connect") connect();
    if (message?.type === "disconnect") { port?.disconnect(); disconnect(); }
    if (message?.type === "consent" && sites.includes(message.origin)) {
      if (!port || !await chrome.permissions.contains({ origins: [message.origin + "/*"] })) throw new Error("Connect Latham before approving a site.");
      const saved = await consent(); await chrome.storage.local.set({ consent: [...new Set([...saved, message.origin])] }); send({ type: "consent", origin: message.origin, granted: true }); await grants();
    }
    if (message?.type === "revoke" && sites.includes(message.origin)) {
      active = false; epoch++; await chrome.storage.local.set({ consent: (await consent()).filter(origin => origin !== message.origin) }); await chrome.permissions.remove({ origins: [message.origin + "/*"] }); await grants(); send({ type: "reconcile", origins: await consent() });
    }
    const granted = await grants(), saved = await consent();
    reply({ connection, connected: !!port && connection.startsWith("Connected"), active, sites: sites.map(origin => ({ origin, granted: granted.includes(origin), consent: saved.includes(origin) })) });
  })().catch(() => reply({ error: "Unable to update access. Connect Latham first, then try again." }));
  return true;
});
function contextChanged(tabId) { if (!navigationExpected && active && [...agents.values()].some(scope => scope.tabId === tabId)) send({ type: "context_changed" }); }
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => { if ([...agents.values()].some(scope => scope.windowId === windowId && scope.tabId !== tabId)) contextChanged([...agents.values()].find(scope => scope.windowId === windowId).tabId); });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (!navigationExpected && (change.url || change.status === "loading")) contextChanged(tabId); });
chrome.tabs.onRemoved.addListener(tabId => { contextChanged(tabId); for (const [id, scope] of agents) if (scope.tabId === tabId) agents.delete(id); void rememberAgents(); });
