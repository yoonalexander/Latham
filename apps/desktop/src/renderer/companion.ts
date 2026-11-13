import type { CompanionBridge, CompanionState } from "../../../../packages/contracts/src/companion";
import { microphoneLevel, companionTransitionMs, companionHeight } from "../../../../packages/contracts/src/companion";
import "./companion.css";

declare global { interface Window { companion: CompanionBridge } }
const root = document.getElementById("companion")!;
const glyph = document.getElementById("glyph")!;
const bars = Array.from(glyph.querySelectorAll("i"));
const notice = document.getElementById("notice")!;
const caption = document.getElementById("caption")!;
const detail = document.getElementById("detail")!;
const buttons = document.getElementById("confirm-buttons")!;
const imageCanvas = document.getElementById("confirm-image") as HTMLCanvasElement;
let hovered = false;
async function interact(enabled: boolean): Promise<void> { if (hovered === enabled) return; hovered = enabled; const id = state?.confirmation?.id; if (id) await window.companion.interact(id, enabled).catch(() => {}); }
notice.addEventListener("mouseenter", () => void interact(true));
notice.addEventListener("mouseleave", () => void interact(false));
async function answer(approved: boolean): Promise<void> {
  const id = state.confirmation?.id; if (!id) return;
  try { await window.companion.confirm(id, approved); } catch { detail.textContent = "This question expired. Start a fresh task."; }
}
document.getElementById("confirm-yes")!.onclick = () => void answer(true);
document.getElementById("confirm-no")!.onclick = () => void answer(false);
async function confirmationImage(id: string): Promise<void> {
  const encoded = await window.companion.confirmationImage(id).catch(() => "");
  if (!encoded || state.confirmation?.id !== id) return;
  const image = new Image(); image.onload = () => {
    if (state.confirmation?.id !== id) return;
    imageCanvas.width = image.width; imageCanvas.height = image.height;
    const ctx = imageCanvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    const action = state.confirmation.action; ctx.beginPath(); ctx.arc(action.x * image.width / 1000, action.y * image.height / 1000, Math.max(8, image.width / 60), 0, Math.PI * 2); ctx.strokeStyle = "#ff6040"; ctx.lineWidth = Math.max(3, image.width / 250); ctx.stroke(); imageCanvas.hidden = false;
  }; image.src = `data:image/png;base64,${encoded}`;
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const placementAnimations = new Map<HTMLElement, Animation>();
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) { placementAnimations.forEach(animation => animation.cancel()); placementAnimations.clear(); } });
let state: CompanionState;
let noticeTimer: ReturnType<typeof setTimeout>;
type Capture = { id: string; sequence: number; stream?: MediaStream; context?: AudioContext; node?: ScriptProcessorNode };
let capture: Capture | undefined;
function clean(): void {
  const previous = capture; capture = undefined;
  if (!previous) return;
  if (previous.node) { previous.node.onaudioprocess = null; previous.node.disconnect(); }
  previous.stream?.getTracks().forEach(track => { track.onmute = track.onended = null; track.stop(); });
  if (previous.context) { previous.context.onstatechange = null; void previous.context.close(); }
  bars.forEach(bar => bar.style.removeProperty("height"));
}
async function record(current: Capture, microphoneId: string): Promise<void> {
  const fail = (): void => { if (capture === current) { clean(); void window.companion.failure(current.id); } };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
    if (capture !== current) { stream.getTracks().forEach(track => track.stop()); return; }
    current.stream = stream; stream.getAudioTracks().forEach(track => { track.onmute = track.onended = fail; });
    const context = new AudioContext({ sampleRate: 16000 }); current.context = context;
    if (context.sampleRate !== 16000) throw new Error("unsupported_sample_rate");
    const source = context.createMediaStreamSource(stream), node = context.createScriptProcessor(2048, 1, 1); current.node = node;
    node.onaudioprocess = event => {
      if (capture !== current) return;
      const values = event.inputBuffer.getChannelData(0), pcm = new Int16Array(values.length);
      for (let index = 0; index < values.length; index++) pcm[index] = Math.round(Math.max(-1, Math.min(1, values[index]!)) * 32767);
      // Heights follow actual input energy; silence always returns to three dots.
      if (state.phase === "listening") {
        const level = microphoneLevel(values);
        bars.forEach((bar, index) => { bar.style.height = `${4 + level * (index === 1 ? 30 : 19)}px`; });
      }
      window.companion.frame(current.id, current.sequence++, pcm.buffer);
    };
    source.connect(node); node.connect(context.destination); await context.resume();
    if (capture !== current) return;
    context.onstatechange = () => { if (context.state !== "running") fail(); };
    if (context.state !== "running") fail();
  } catch { fail(); }
}
function update(next: CompanionState): void {
  const previous = state; state = next;
  const moving = previous && (previous.above !== next.above || previous.mirrored !== next.mirrored);
  const before = moving ? [root, glyph, notice].map(element => ({ element, rect: element.getBoundingClientRect() })) : [];
  root.style.left = `${next.left}px`; root.style.top = `${next.top}px`;
  root.style.height = `${companionHeight(next.confirmation)}px`;
  root.classList.toggle("confirming", !!next.confirmation);
  buttons.hidden = !next.confirmation;
  if (previous?.confirmation?.id !== next.confirmation?.id) {
    hovered = false; imageCanvas.hidden = true; imageCanvas.width = imageCanvas.height = 0;
    if (next.confirmation?.scope === "action") void confirmationImage(next.confirmation.id);
  }
  root.dataset.phase = next.phase;
  root.classList.toggle("mirrored", next.mirrored);
  root.classList.toggle("above", next.above);
  glyph.setAttribute("aria-label", next.phase === "idle" ? "Microphone off" : next.phase === "processing" ? "Processing command" : "Microphone on · listening");
  if (next.phase !== "listening") bars.forEach(bar => bar.style.removeProperty("height"));
  if (capture?.id !== next.sessionId) {
    clean();
    if (next.sessionId) { capture = { id: next.sessionId, sequence: 0 }; void record(capture, next.microphoneId); }
  }
  if (!previous || previous.phase !== next.phase || previous.message !== next.message || previous.noticeId !== next.noticeId || previous.controlHoldReady !== next.controlHoldReady || previous.speechPreview.text !== next.speechPreview.text || previous.speechPreview.status !== next.speechPreview.status || previous.confirmation?.id !== next.confirmation?.id || previous.recoveryRequired !== next.recoveryRequired) {
    const speech = next.speechPreview, showSpeech = !!speech.text;
    notice.setAttribute("aria-live", showSpeech && speech.status !== "final" ? "off" : "polite");
    root.classList.toggle("has-transcript", showSpeech);
    caption.textContent = showSpeech ? speech.text : next.phase === "processing" ? "On it…" : next.phase === "listening" ? next.holdToTalk ? "Listening · hold Ctrl" : "Listening · one command" : next.message;
    caption.scrollTop = caption.scrollHeight;
    detail.textContent = showSpeech ? speech.status === "final" ? "Heard · final transcript" : speech.status === "processing" ? "Finishing transcript…" : "Live transcript · may change" : speech.status === "unavailable" ? "Speech recognizer unavailable · check AI setup" : next.phase === "idle" ? next.controlHoldReady ? "Hold Ctrl to talk · tray for settings" : next.talkShortcutRegistered ? "Ctrl hold unavailable · Ctrl + Alt + Space to talk" : "Talk shortcuts unavailable · use the tray" : next.holdToTalk && next.phase === "listening" ? "Release Ctrl to finish · Ctrl + Alt + . to stop" : "Ctrl + Alt + . to stop";
    if (next.recoveryRequired && !next.confirmation) {
      root.classList.remove("has-transcript"); notice.setAttribute("aria-live", "polite");
      caption.textContent = "Check the last task";
      detail.textContent = "Settings → I've checked — continue";
    }
    if (next.confirmation) {
      root.classList.remove("has-transcript"); notice.setAttribute("aria-live", "polite");
      caption.textContent = next.confirmation.scope === "task" ? "Continue with this task?" : `Click this point in ${next.confirmation.app}?`;
      detail.textContent = next.confirmation.goal;
    }
    notice.classList.add("visible"); clearTimeout(noticeTimer);
    if (!next.confirmation && !showSpeech && next.phase !== "listening") noticeTimer = setTimeout(() => notice.classList.remove("visible"), next.phase === "idle" ? 6000 : 2500);
  }
  for (const { element, rect } of before) {
    placementAnimations.get(element)?.cancel(); placementAnimations.delete(element);
    if (reducedMotion.matches) continue;
    const after = element.getBoundingClientRect();
    const parentOffset = element === root ? { x: 0, y: 0 } : before[0]!.rect;
    const parentAfter = element === root ? { x: 0, y: 0 } : root.getBoundingClientRect();
    // Independent translate preserves the processing glyph's orbit transform.
    const animation = element.animate([{ translate: `${rect.x - parentOffset.x - after.x + parentAfter.x}px ${rect.y - parentOffset.y - after.y + parentAfter.y}px` }, { translate: "0 0" }], { duration: companionTransitionMs, easing: "cubic-bezier(0.333333, 1, 0.666667, 1)", id: "companion-placement" });
    placementAnimations.set(element, animation);
    animation.onfinish = () => { if (placementAnimations.get(element) === animation) placementAnimations.delete(element); };
  }
}
const unsubscribe = window.companion.subscribe(update);
void window.companion.state().then(next => { if (!state) update(next); });
window.addEventListener("beforeunload", () => { unsubscribe(); clean(); });
