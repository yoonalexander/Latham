// A single active-tab lease. No free-form command, selector, script or provider tool is accepted.
let workflowLease = null;
const workflowFence = (generation, id) => pageFence(generation) && workflowLease?.valid && workflowLease.id === id && workflowLease.epoch === generation.epoch && workflowLease.session === generation.session && Date.now() < workflowLease.deadline;
function interruptWorkflow() {
  if (!workflowLease?.valid) return;
  workflowLease.valid = false; active = false; send({ type: "context_changed" });
}
function sameWorkflowScope(a, b) {
  return a && b && a.tabId === b.tabId && a.windowId === b.windowId && a.documentId === b.documentId && a.snapshot?.document === b.snapshot?.document && a.snapshot?.url === b.snapshot?.url;
}
async function validateWorkflow(request, generation) {
  const lease = workflowLease;
  if (!workflowFence(generation, request.flowId) || !sameWorkflowScope(request.scope, lease.scope)) throw new Error("workflow_stale");
  const tab = await currentPage(generation);
  if (!workflowFence(generation, request.flowId) || tab.id !== lease.tabId || tab.windowId !== lease.windowId || tab.url !== lease.scope.snapshot.url) throw new Error("workflow_stale");
  const checked = await callPage(lease.scope, { op: "workflow_check", flowId: lease.id, epoch: generation.epoch, document: lease.scope.snapshot.document, url: lease.scope.snapshot.url });
  if (checked.outcome !== "verified" || !workflowFence(generation, request.flowId)) throw new Error("workflow_interrupted");
  return tab;
}
async function workflowRequest(request, generation) {
  if (request.kind === "workflow_begin") {
    if (workflowLease || typeof request.flowId !== "string" || !/^[\w-]{36}$/.test(request.flowId)) throw new Error("workflow_stale");
    const tab = await currentPage(generation);
    const site = lathamCatalog.sites.find(site => site.id === request.site);
    if (!site || new URL(tab.url).origin !== site.origin || lathamCatalog.siteForPage(tab.url)?.id !== site.id) throw new Error("workflow_context");
    if (!pageFence(generation)) throw new Error("cancelled");
    workflowLease = { id: request.flowId, site: site.id, tabId: tab.id, windowId: tab.windowId, scope: null, epoch: generation.epoch, session: generation.session, valid: true, started: false, actions: 0, requests: 1, deadline: Date.now() + lathamCatalog.workflowLimits.previewMs, destination: null };
    const scope = await observePage(generation, false, request.flowId);
    if (!workflowFence(generation, request.flowId)) throw new Error("workflow_stale");
    workflowLease.scope = scope; return { outcome: "verified", scope };
  }
  const lease = workflowLease;
  if (!workflowFence(generation, request.flowId)) throw new Error("workflow_stale");
  if (++lease.requests > lathamCatalog.workflowLimits.requests) throw new Error("request_budget");
  if (request.kind === "workflow_end") {
    await validateWorkflow({ ...request, scope: lease.scope }, generation);
    const result = await callPage(lease.scope, { op: "workflow_end", flowId: lease.id, epoch: generation.epoch, document: lease.scope.snapshot.document, url: lease.scope.snapshot.url });
    if (result.outcome !== "verified") throw new Error("workflow_stale");
    workflowLease = null; return { outcome: "verified" };
  }
  const tab = await validateWorkflow(request, generation);
  if (request.kind === "workflow_start") {
    if (lease.started) throw new Error("workflow_stale");
    lease.started = true; lease.deadline = Date.now() + lathamCatalog.workflowLimits.durationMs; return { outcome: "verified", scope: lease.scope };
  }
  if (!lease.started) throw new Error("workflow_stale");
  if (request.kind === "workflow_observe") {
    const scope = await observePage(generation, false, lease.id);
    if (!workflowFence(generation, lease.id)) throw new Error("workflow_stale");
    lease.scope = scope; return { outcome: "verified", scope };
  }
  if (request.kind !== "workflow_step" || !request.step || typeof request.step !== "object") throw new Error("unsupported_goal");
  if (++lease.actions > lathamCatalog.workflowLimits.actions) throw new Error("action_budget");
  const step = request.step, scope = lease.scope; let destination, issued = false;
  try {
    if (step.kind === "search" && Object.keys(step).sort().join(",") === "kind,text" && typeof step.text === "string" && step.text.trim() && step.text.length <= 300) destination = lathamCatalog.searchDestination(scope.snapshot.profile, step.text);
    else if (step.kind === "filter" && Object.keys(step).sort().join(",") === "filter,kind" && ["all", "images", "videos", "news", "remote"].includes(step.filter)) destination = lathamCatalog.filterDestination(scope.snapshot.url, step.filter);
    else if (step.kind === "scroll" && Object.keys(step).join(",") === "kind") {
      issued = true;
      const result = await callPage(scope, { op: "action", flowId: lease.id, epoch: generation.epoch, document: scope.snapshot.document, url: scope.snapshot.url, action: { kind: "scroll", direction: "down" } });
      if (result.outcome !== "verified") return result;
    } else if (step.kind === "open" && Object.keys(step).sort().join(",") === "kind,revision,targetId") {
      const target = scope.snapshot.targets.find(target => target.id === step.targetId && target.revision === step.revision && target.profile === "result");
      if (!target) throw new Error("target_missing");
      issued = true;
      const result = await callPage(scope, { op: "action", flowId: lease.id, epoch: generation.epoch, document: scope.snapshot.document, url: scope.snapshot.url, action: { kind: "click", targetId: target.id, revision: target.revision } });
      if (result.outcome !== "verified") return result;
      if (!result.destination || !lathamCatalog.reviewedResult(scope.snapshot.profile, result.destination)) throw new Error("unsupported_goal");
      destination = result.destination;
    } else throw new Error("unsupported_goal");
    if (!workflowFence(generation, lease.id)) throw new Error("workflow_interrupted");
    let result;
    if (destination) {
      lease.destination = destination;
      try { issued = true; result = await navigateVerified(tab, destination, generation, lease.id); }
      finally { lease.destination = null; }
    } else result = { outcome: "verified", scope: await observePage(generation, false, lease.id) };
    if (result.outcome === "verified" && workflowFence(generation, lease.id)) lease.scope = result.scope;
    return result;
  } catch (error) { if (!issued) throw error; return { outcome: "unknown", reason: "navigation_unverified" }; }
}
