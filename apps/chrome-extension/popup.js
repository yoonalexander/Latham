const status = document.getElementById("status"), error = document.getElementById("error");
async function refresh(message = { type: "state" }) {
  const state = await chrome.runtime.sendMessage(message);
  if (state.error) { error.textContent = state.error; return; }
  status.textContent = state.connection + (state.active ? " · Session active" : " · Paused");
  document.getElementById("disconnect").disabled = !state.connected;
  document.getElementById("images").disabled = !state.connected || state.imagesGranted;
  document.getElementById("revoke-images").disabled = !state.imagesGranted;
  document.getElementById("images").textContent = state.imagesGranted ? "Thumbnail images approved" : "Allow YouTube thumbnail images";
  document.getElementById("sites").replaceChildren(...state.sites.map(site => {
    const row = document.createElement("div"); row.className = "site";
    const title = document.createElement("strong"); title.textContent = site.origin;
    const detail = document.createElement("small"); detail.textContent = site.granted && site.consent ? "Approved (remembered)" : "Not approved";
    const allow = document.createElement("button"); allow.textContent = "Approve"; allow.disabled = !state.connected || (site.granted && site.consent);
    allow.onclick = () => {
      error.textContent = "";
      // Called directly from this user gesture, never from a provider or content script.
      chrome.permissions.request({ origins: [site.origin + "/*"] }).then(granted => granted ? refresh({ type: "consent", origin: site.origin }) : (error.textContent = "Chrome permission denied. Nothing was approved.")).catch(() => { error.textContent = "Permission request failed."; });
    };
    const revoke = document.createElement("button"); revoke.textContent = "Revoke"; revoke.disabled = !site.granted && !site.consent; revoke.onclick = () => void refresh({ type: "revoke", origin: site.origin });
    row.append(title, detail, allow, revoke); return row;
  }));
}
document.getElementById("connect").onclick = () => { void refresh({ type: "connect" }); };
document.getElementById("disconnect").onclick = () => { void refresh({ type: "disconnect" }); };
document.getElementById("images").onclick = () => { chrome.permissions.request({ origins: ["https://i.ytimg.com/*"] }).then(granted => { error.textContent = granted ? "Thumbnail image grant enabled. Approve capture separately in Latham." : "Thumbnail image permission denied."; void refresh(); }).catch(() => { error.textContent = "Thumbnail image permission request failed."; }); };
document.getElementById("revoke-images").onclick = () => { void chrome.permissions.remove({ origins: ["https://i.ytimg.com/*"] }).then(() => refresh()); };
void refresh(); setInterval(() => { void refresh(); }, 1500);
