const sites = ["https://www.google.com", "https://www.youtube.com"];
let port, active = false, epoch = 0, busy = false, connection = "Disconnected";
const send = value => { try { port?.postMessage(value); } catch { disconnect(); } };
function disconnect() { active = false; epoch++; connection = "Disconnected — open Latham and connect again"; port = undefined; }
async function grants() { const origins = []; for (const origin of sites) if (await chrome.permissions.contains({ origins: [origin + "/*"] })) origins.push(origin); send({ type: "grants", origins }); return origins; }
async function consent() { const stored = await chrome.storage.local.get("consent"); return Array.isArray(stored.consent) ? stored.consent.filter(origin => sites.includes(origin)) : []; }
async function approved(url) {
  try { const origin = new URL(url).origin; return (await consent()).includes(origin) && await chrome.permissions.contains({ origins: [origin + "/*"] }); } catch { return false; }
}
function connect() {
  if (port) return;
  active = false; epoch++; connection = "Connecting";
  port = chrome.runtime.connectNative("com.latham.host");
  port.onDisconnect.addListener(() => { void chrome.runtime.lastError; disconnect(); });
  port.onMessage.addListener(message => { void receive(message).catch(() => { active = false; epoch++; }); });
}
async function receive(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "pause") { active = false; epoch = message.epoch; send({ type: "paused", epoch }); return; }
  if (message.type === "resume" && Number.isSafeInteger(message.epoch)) { active = true; epoch = message.epoch; return; }
  if (message.type === "sync" && Array.isArray(message.consent)) {
    active = false; connection = "Connected — start a Chrome session in Latham";
    const saved = await consent(), kept = saved.filter(origin => message.consent.includes(origin));
    await chrome.storage.local.set({ consent: kept });
    // A grant removed while disconnected also removes Latham's mirror on this reconnect.
    await grants(); send({ type: "reconcile", origins: kept }); return;
  }
  if (message.type === "revoke" && sites.includes(message.origin)) {
    active = false; epoch++; await chrome.storage.local.set({ consent: (await consent()).filter(origin => origin !== message.origin) });
    await chrome.permissions.remove({ origins: [message.origin + "/*"] }); await grants(); return;
  }
  if (message.type !== "command" || typeof message.id !== "string" || message.id.length > 64 || message.epoch !== epoch || busy) return;
  const generation = epoch, command = message.command;
  const fence = () => active && epoch === generation && port;
  let outcome = "blocked";
  busy = true;
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
  finally { busy = false; send({ type: "result", id: message.id, epoch: message.epoch, outcome }); }
}
chrome.permissions.onRemoved.addListener(() => {
  active = false; epoch++;
  void (async () => { const current = await grants(), kept = (await consent()).filter(origin => current.includes(origin)); await chrome.storage.local.set({ consent: kept }); send({ type: "reconcile", origins: kept }); })();
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
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
