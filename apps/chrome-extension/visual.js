// Source-isolated capture: never call captureVisibleTab/getDisplayMedia or read frame pixels.
async function thumbnailBytes(source, generation) {
  if (!pageFence(generation)) throw Error("cancelled");
  if (!/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(hq720|hqdefault|mqdefault|default|sddefault|maxresdefault)\.jpg$/.test(source)) throw Error("visual_source_denied");
  const response = await fetch(source, { credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!response.ok || !/^image\/(jpeg|png)(;|$)/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw Error("visual_image_unavailable"); }
  const reader = response.body.getReader(), parts = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 262144) throw Error("visual_image_too_large"); parts.push(value); } } finally { await reader.cancel(); }
  if (!pageFence(generation)) throw Error("cancelled");
  const image = await createImageBitmap(new Blob(parts));
  try {
    if (image.width > 4096 || image.height > 4096 || image.width < 24 || image.height < 24) throw Error("visual_image_too_large");
    const canvas = new OffscreenCanvas(192, 108); canvas.getContext("2d").drawImage(image, 0, 0, 192, 108);
    let blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
    if (blob.size > 8192) blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.35 });
    if (blob.size > 8192) throw Error("visual_image_too_large");
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  } finally { image.close(); }
}
async function visualRequest(request, generation) {
  if (!await chrome.permissions.contains({ origins: ["https://i.ytimg.com/*"] })) throw Error("visual_image_grant_required");
  const tab = await currentPage(generation);
  if (new URL(tab.url).origin !== "https://www.youtube.com") throw Error("visual_scope_denied");
  if (request.kind === "visual_capture") {
    const scope = await observePage(generation), prepared = await callPage(scope, { op: "visual_prepare", session: generation.session, epoch: generation.epoch });
    if (prepared.outcome !== "verified" || !Array.isArray(prepared.candidates) || !prepared.candidates.length || prepared.candidates.length > 4) return prepared;
    const candidates = [];
    for (const item of prepared.candidates) {
      const image = await thumbnailBytes(item.source, generation);
      const checked = await callPage(scope, { op: "visual_validate", token: prepared.token, session: generation.session, epoch: generation.epoch }); if (checked.outcome !== "verified") return checked;
      if (!pageFence(generation) || !await approved(tab.url) || !await chrome.permissions.contains({ origins: ["https://i.ytimg.com/*"] })) throw Error("cancelled");
      candidates.push({ id: item.id, revision: item.revision, label: item.label, rect: item.rect, image });
    }
    const limitedScope = { ...scope, snapshot: { ...scope.snapshot, targets: scope.snapshot.targets.filter(t => candidates.some(c => c.id === t.id)) } };
    return { outcome: "verified", capture: { scope: limitedScope, token: prepared.token, candidates } };
  }
  const { scope, token, targetId } = request;
  if (!scope || scope.tabId !== tab.id || scope.windowId !== tab.windowId || scope.snapshot?.url !== tab.url) throw Error("visual_stale");
  if (typeof token !== "string" || token.length > 64) throw Error("invalid_visual_request");
  const result = await callPage(scope, { op: request.kind, token, targetId, session: generation.session, epoch: generation.epoch });
  if (!pageFence(generation)) throw Error("cancelled");
  if (result.destination) return navigateVerified(tab, result.destination, generation);
  return result;
}
