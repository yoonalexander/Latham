import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopState } from "@latham/contracts";
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
