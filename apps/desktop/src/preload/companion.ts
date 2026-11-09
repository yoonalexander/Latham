import { contextBridge, ipcRenderer } from "electron";
import type { CompanionBridge, CompanionState } from "../../../../packages/contracts/src/companion";

// Presentation and current-question responses only; no arbitrary observation/action API.
const companion: CompanionBridge = {
  confirm: (id, approved) => ipcRenderer.invoke("companion:confirm", id, approved),
  confirmationImage: id => ipcRenderer.invoke("companion:image", id),
  interact: (id, enabled) => ipcRenderer.invoke("companion:interact", id, enabled),
  state: () => ipcRenderer.invoke("companion:state"),
  subscribe: listener => {
    const receive = (_event: unknown, state: CompanionState): void => listener(state);
    ipcRenderer.on("companion:state", receive);
    return () => ipcRenderer.removeListener("companion:state", receive);
  },
  frame: (id, sequence, pcm) => ipcRenderer.send("companion:frame", id, sequence, pcm),
  failure: id => ipcRenderer.invoke("companion:failure", id)
};
contextBridge.exposeInMainWorld("companion", companion);
