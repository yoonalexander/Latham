import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopState } from "@latham/contracts";
import type { SetupBridge, SetupState } from "../../../../packages/contracts/src/setup";
const bridge: DesktopBridge = {
  runtime: { sandboxed: process.sandboxed === true, contextIsolated: process.contextIsolated === true },
  getState: () => ipcRenderer.invoke("latham:state"),
  run: command => ipcRenderer.invoke("latham:run", command),
  resume: () => ipcRenderer.invoke("latham:resume"),
  stop: () => ipcRenderer.invoke("latham:stop"),
  resetFixture: () => ipcRenderer.invoke("latham:reset"),
  updateSettings: settings => ipcRenderer.invoke("latham:settings", settings),
  clearDiagnostics: () => ipcRenderer.invoke("latham:clear"),
  setFixtureBounds: bounds => ipcRenderer.send("latham:bounds", bounds),
  subscribe: listener => {
    const receive = (_event: unknown, state: DesktopState): void => listener(state);
    ipcRenderer.on("latham:state", receive);
    return () => ipcRenderer.removeListener("latham:state", receive);
  }
};
contextBridge.exposeInMainWorld("latham", bridge);
const setup: SetupBridge = {
  voiceFrame: (id, sequence, pcm) => ipcRenderer.send("setup:voice-frame", id, sequence, pcm),
  rendererReady: () => ipcRenderer.invoke("setup:ready"),
  computerConfigure: options => ipcRenderer.invoke("setup:computer-configure", options), computerDisable: () => ipcRenderer.invoke("setup:computer-disable"), computerRun: goal => ipcRenderer.invoke("setup:computer-run", goal), computerReview: () => ipcRenderer.invoke("setup:computer-review"), computerReconcile: () => ipcRenderer.invoke("setup:computer-reconcile"), computerUnblock: origin => ipcRenderer.invoke("setup:computer-unblock", origin), selectCompanionTarget: target => ipcRenderer.invoke("setup:companion-target", target),
  showCompanion: () => ipcRenderer.invoke("setup:companion"),
  talkFromCompanion: () => ipcRenderer.invoke("setup:companion-talk"),
  chooseBrowser: browser => ipcRenderer.invoke("setup:choose-browser", browser), addEvaluation: trial => ipcRenderer.invoke("setup:evaluation-add", trial), clearEvaluation: () => ipcRenderer.invoke("setup:evaluation-clear"),
  managedSignIn: input => ipcRenderer.invoke("setup:managed-sign-in", input), managedAccount: operation => ipcRenderer.invoke("setup:managed-account", operation),
  state: () => ipcRenderer.invoke("setup:state"), save: value => ipcRenderer.invoke("setup:save", value),
  key: value => ipcRenderer.invoke("setup:key", value), removeKey: () => ipcRenderer.invoke("setup:remove-key"), importEnvironmentKey: () => ipcRenderer.invoke("setup:import-key"),
  testDecision: () => ipcRenderer.invoke("setup:test"), beginTurn: () => ipcRenderer.invoke("setup:begin"),
  startHandsfree: config => ipcRenderer.invoke("setup:handsfree-start", config),
  handsfreeFrame: (id, sequence, pcm) => ipcRenderer.send("setup:handsfree-frame", id, sequence, pcm),
  handsfreeFailure: id => ipcRenderer.invoke("setup:handsfree-failure", id),
  checkLocalModel: () => ipcRenderer.invoke("setup:check-local-model"),
  visualPermission: allowed => ipcRenderer.invoke("setup:visual-permission", allowed), visualFind: query => ipcRenderer.invoke("setup:visual-find", query),
  visualHighlight: id => ipcRenderer.invoke("setup:visual-highlight", id), visualOpen: () => ipcRenderer.invoke("setup:visual-open"),
  prepareWorkflow: goal => ipcRenderer.invoke("setup:workflow-prepare", goal), runWorkflow: id => ipcRenderer.invoke("setup:workflow-run", id),
  cancelWorkflow: () => ipcRenderer.invoke("setup:workflow-cancel"), saveWorkflowShortcut: (name, id) => ipcRenderer.invoke("setup:workflow-shortcut-save", name, id),
  deleteWorkflowShortcut: id => ipcRenderer.invoke("setup:workflow-shortcut-delete", id), clearWorkflowShortcuts: () => ipcRenderer.invoke("setup:workflow-shortcut-clear"),
  insertTranscript: mode => ipcRenderer.invoke("setup:insert-transcript", mode),
  prepareDictation: () => ipcRenderer.invoke("setup:prepare-dictation"),
  desktopPermission: (approved, denied) => ipcRenderer.invoke("setup:desktop-permission", approved, denied),
  desktopScan: () => ipcRenderer.invoke("setup:desktop-scan"), desktopOpen: () => ipcRenderer.invoke("setup:desktop-open"),
  desktopPrepare: id => ipcRenderer.invoke("setup:desktop-prepare", id), desktopRun: command => ipcRenderer.invoke("setup:desktop-run", command),
  desktopInsertTranscript: mode => ipcRenderer.invoke("setup:desktop-insert", mode), desktopReconcile: () => ipcRenderer.invoke("setup:desktop-reconcile"),
  finishTurn: (id, pcm) => ipcRenderer.invoke("setup:finish", id, pcm), cancelTurn: () => ipcRenderer.invoke("setup:cancel"), clearTranscript: () => ipcRenderer.invoke("setup:clear-transcript"),
  chromeResume: () => ipcRenderer.invoke("setup:chrome-resume"), reconcileChrome: () => ipcRenderer.invoke("setup:reconcile-chrome"), chromeRun: command => ipcRenderer.invoke("setup:chrome-run", command), revoke: origin => ipcRenderer.invoke("setup:revoke", origin), installHost: () => ipcRenderer.invoke("setup:install-host"), launchBrowser: () => ipcRenderer.invoke("setup:launch-browser"),
  subscribe: listener => { const receive = (_event: unknown, state: SetupState): void => listener(state); ipcRenderer.on("setup:state", receive); return () => ipcRenderer.removeListener("setup:state", receive); }
};
contextBridge.exposeInMainWorld("setup", setup);
