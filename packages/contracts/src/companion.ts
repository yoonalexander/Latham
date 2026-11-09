import type { HandsfreeTarget } from "./handsfree";
import type { SpeechPreviewState } from "./speech-preview";
import type { ComputerConfirmation } from "./computer";

export type CompanionState = {
  recoveryRequired: boolean;
  confirmation: ComputerConfirmation | null;
  speechPreview: SpeechPreviewState;
  phase: "idle" | "listening" | "processing";
  sessionId: string | null;
  microphoneId: string;
  target: HandsfreeTarget;
  message: string;
  noticeId: number;
  talkShortcutRegistered: boolean;
  controlHoldReady: boolean;
  holdToTalk: boolean;
  mirrored: boolean;
  above: boolean;
  left: number;
  top: number;
};
export type CompanionBridge = {
  confirm(id: string, approved: boolean): Promise<void>;
  confirmationImage(id: string): Promise<string>;
  interact(id: string, enabled: boolean): Promise<void>;
  state(): Promise<CompanionState>;
  subscribe(listener: (state: CompanionState) => void): () => void;
  frame(id: string, sequence: number, pcm: ArrayBuffer): void;
  failure(id: string): Promise<void>;
};
export const companionHeight = (confirmation: ComputerConfirmation | null): number => confirmation ? confirmation.scope === "action" ? 328 : 224 : 136;
export const companionTransitionMs = 220;

// DIP coordinates can be negative on monitors left of the primary display.
export function companionPosition(cursor: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, follow: boolean, placement?: { mirrored: boolean; above: boolean }): { x: number; y: number } {
  const clamp = (value: number, min: number, extent: number, length: number): number => Math.round(Math.max(min, Math.min(value, min + Math.max(0, extent - length))));
  const mirrored = placement?.mirrored ?? cursor.x + 24 + size.width > area.x + area.width;
  const above = placement?.above ?? cursor.y + 16 + size.height > area.y + area.height;
  const x = follow ? (mirrored ? cursor.x - size.width - 16 : cursor.x + 24) : area.x + area.width - size.width - 16;
  const y = follow ? (above ? cursor.y - size.height - 12 : cursor.y + 16) : area.y + area.height / 2 - size.height / 2;
  return { x: clamp(x, area.x, area.width, size.width), y: clamp(y, area.y, area.height, size.height) };
}

export function microphoneLevel(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return Number.isFinite(rms) && rms >= 0.012 ? Math.min(1, rms * 8) : 0;
}
