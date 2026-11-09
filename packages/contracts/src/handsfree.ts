import { record } from "./index";
export type HandsfreeTarget = "computer" | "chrome" | "desktop";
export type HandsfreeConfig = { target: HandsfreeTarget; wake: boolean };
export type HandsfreeState = {
  id: string | null; phase: "off" | "starting" | "armed" | "listening" | "capturing" | "transcribing" | "executing";
  target: HandsfreeTarget; wake: boolean; audioReady: boolean; stopReady: boolean; wakeReady: boolean; message: string;
};
export const emptyHandsfree = (): HandsfreeState => ({ id: null, phase: "off", target: "chrome", wake: false, audioReady: false, stopReady: false, wakeReady: false, message: "Microphone off · hands-free is opt-in each time." });
export function parseHandsfreeConfig(value: unknown): HandsfreeConfig {
  if (!record(value) || Object.keys(value).length !== 2 || !["computer", "chrome", "desktop"].includes(String(value.target)) || typeof value.wake !== "boolean") throw new Error("invalid_handsfree_config");
  return { target: value.target as HandsfreeTarget, wake: value.wake };
}
