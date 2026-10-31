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
  state: () => ipcRenderer.invoke("setup:state"), save: value => ipcRenderer.invoke("setup:save", value),
  key: value => ipcRenderer.invoke("setup:key", value), removeKey: () => ipcRenderer.invoke("setup:remove-key"), importEnvironmentKey: () => ipcRenderer.invoke("setup:import-key"),
  testDecision: () => ipcRenderer.invoke("setup:test"), beginTurn: () => ipcRenderer.invoke("setup:begin"),
  startHandsfree: config => ipcRenderer.invoke("setup:handsfree-start", config),
  handsfreeFrame: (id, sequence, pcm) => ipcRenderer.send("setup:handsfree-frame", id, sequence, pcm),
  handsfreeFailure: id => ipcRenderer.invoke("setup:handsfree-failure", id),
  checkLocalModel: () => ipcRenderer.invoke("setup:check-local-model"),
  insertTranscript: mode => ipcRenderer.invoke("setup:insert-transcript", mode),
  prepareDictation: () => ipcRenderer.invoke("setup:prepare-dictation"),
  desktopPermission: (approved, denied) => ipcRenderer.invoke("setup:desktop-permission", approved, denied),
  desktopScan: () => ipcRenderer.invoke("setup:desktop-scan"), desktopOpen: () => ipcRenderer.invoke("setup:desktop-open"),
  desktopPrepare: id => ipcRenderer.invoke("setup:desktop-prepare", id), desktopRun: command => ipcRenderer.invoke("setup:desktop-run", command),
  desktopInsertTranscript: mode => ipcRenderer.invoke("setup:desktop-insert", mode), desktopReconcile: () => ipcRenderer.invoke("setup:desktop-reconcile"),
  finishTurn: (id, pcm) => ipcRenderer.invoke("setup:finish", id, pcm), cancelTurn: () => ipcRenderer.invoke("setup:cancel"), clearTranscript: () => ipcRenderer.invoke("setup:clear-transcript"),
  chromeResume: () => ipcRenderer.invoke("setup:chrome-resume"), reconcileChrome: () => ipcRenderer.invoke("setup:reconcile-chrome"), chromeRun: command => ipcRenderer.invoke("setup:chrome-run", command), revoke: origin => ipcRenderer.invoke("setup:revoke", origin), installHost: () => ipcRenderer.invoke("setup:install-host"), launchChrome: () => ipcRenderer.invoke("setup:launch-chrome"),
  subscribe: listener => { const receive = (_event: unknown, state: SetupState): void => listener(state); ipcRenderer.on("setup:state", receive); return () => ipcRenderer.removeListener("setup:state", receive); }
};
contextBridge.exposeInMainWorld("setup", setup);
