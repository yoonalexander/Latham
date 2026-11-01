import { test, expect, vi, afterEach } from "vitest";
import { VisualController } from "../../apps/desktop/src/main/visual-controller";
import { parseVisualCapture, parseVisualQuery, visualMatches, type VisualCandidate } from "../../packages/contracts/src/visual";
import { selectVisual, validateVisualMatches } from "../../packages/speech/src/providers";
const image = "/9j/" + "A".repeat(100);
const candidate = (id: string, text = "PIANO", x = 0): VisualCandidate => ({ id, revision: "revision", label: "Same title", image, rect: { x, y: 0, width: 192, height: 108 }, text });
const capture = () => ({ token: "capture", scope: { tabId: 1, windowId: 2, documentId: "doc", snapshot: { document: "token", url: "https://www.youtube.com/results?search_query=piano", profile: "youtube", searchAvailable: true, deniedFrames: 1, targets: ["one", "two"].map(id => ({ id, revision: "revision", name: "Same title", role: "link", profile: "result", actions: ["navigate"] })) } }, candidates: [candidate("one"), candidate("two", "VIOLIN", 240)] });
function fixture() {
  const chrome = { active: true, connected: true, needsReview: false, request: vi.fn(async (_request: object, _mutation?: boolean): Promise<unknown> => ({ outcome: "verified", capture: capture() })) };
  const ocr = vi.fn(async () => "PIANO"), key = vi.fn(() => "FAKE_VISUAL_KEY"), changed = vi.fn();
  const visual = new VisualController(chrome, ocr, key, changed); return { chrome, visual, ocr, key };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test("visual consent is transient, explicit and cannot authorize a denied/paused origin", async () => {
  const f = fixture(); await expect(f.visual.find({ text: "PIANO", route: "ocr", model: "llava" })).rejects.toThrow(); expect(f.chrome.request).not.toHaveBeenCalled();
  f.visual.permission(true); f.chrome.active = false; await expect(f.visual.find({ text: "PIANO", route: "ocr", model: "llava" })).rejects.toThrow();
  f.visual.stop(); expect(f.visual.state.consent).toBe(false); expect(() => f.visual.permission("yes")).toThrow();
});
test("capture contracts reject unknown targets, oversized pixels, geometry and unsupported scope", () => {
  expect(parseVisualCapture(capture()).candidates).toHaveLength(2);
  for (const invalid of [null, { ...capture(), candidates: [candidate("invented")] }, { ...capture(), candidates: [candidate("one"), candidate("one")] }, { ...capture(), candidates: [{ ...candidate("one"), image: image.repeat(200) }] }, { ...capture(), candidates: [{ ...candidate("one"), rect: { x: NaN, y: 0, width: 2, height: 20 } }] }]) expect(() => parseVisualCapture(invalid)).toThrow();
  for (const input of [{ text: "PIANO", route: "auto", model: "llava" }, { text: "x", route: "local", model: "cloud-model" }, { text: "x", route: "ocr", model: "llava", screenshot: true }]) expect(() => parseVisualQuery(input)).toThrow();
});
test("OCR and spatial grounding clarify duplicates and cannot invent an icon or face match", () => {
  const images = [candidate("one"), candidate("two", "PIANO", 240)]; expect(visualMatches("text piano", images)).toEqual(["one", "two"]);
  expect(visualMatches("leftmost thumbnail", images)).toEqual(["one"]); expect(visualMatches("rightmost thumbnail", images)).toEqual(["two"]);
  expect(visualMatches("the blue circle", images)).toEqual([]); expect(visualMatches("Ludwig", images)).toEqual([]);
});
test("visual model matches preserve ambiguity and reject invented IDs, duplicates or actions", () => {
  const candidates = ["one", "two"].map(id => ({ id, label: "Same", role: "link" }));
  expect(validateVisualMatches({ candidateIds: ["one", "two"] }, candidates)).toEqual(["one", "two"]); expect(validateVisualMatches({ candidateIds: [] }, candidates)).toEqual([]);
  for (const value of [{ candidateIds: ["invented"] }, { candidateIds: ["one", "one"] }, { candidateIds: ["one"], click: true }, { candidateId: "one" }]) expect(() => validateVisualMatches(value, candidates)).toThrow();
});
test("multiple model matches stay in clarification without a highlight or automatic action", async () => {
  const f = fixture(); f.visual.permission(true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"candidateIds":["one","two"]}' }] } }] })));
  await f.visual.find({ text: "a circle", route: "cloud", model: "llava" });
  expect(f.visual.state.message).toContain("Several candidates match (1, 2)"); expect(f.visual.state.proposed).toBe(null);
  expect(f.chrome.request.mock.calls.map(c => (c[0] as { kind: string }).kind)).toEqual(["visual_capture", "visual_validate"]); f.visual.stop();
});
test("local OCR only proposes; explicit highlight/open uses the captured target and effect gateway", async () => {
  const f = fixture(); f.ocr.mockResolvedValueOnce("PIANO").mockResolvedValueOnce("VIOLIN"); f.visual.permission(true);
  await f.visual.find({ text: "text PIANO", route: "ocr", model: "llava" }); expect(f.visual.state.proposed).toBe("one"); expect(f.key).not.toHaveBeenCalled();
  expect(f.chrome.request.mock.calls.map(c => (c[0] as { kind: string }).kind)).not.toContain("visual_open");
  await expect(f.visual.highlight("invented")).rejects.toThrow(); await f.visual.open();
  expect(f.chrome.request).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "visual_open", targetId: "one" }), true);
  expect(f.visual.state.candidates).toEqual([]); f.visual.stop();
});
test("Stop during OCR drops late pixels and proposals without provider calls or navigation", async () => {
  const f = fixture(); let done!: (text: string) => void; f.ocr.mockImplementation(() => new Promise(resolve => { done = resolve; })); f.visual.permission(true);
  const pending = f.visual.find({ text: "PIANO", route: "cloud", model: "llava" }); await vi.waitFor(() => expect(f.ocr).toHaveBeenCalled());
  f.visual.stop(); done("PIANO"); await pending; expect(f.visual.state).toMatchObject({ consent: false, busy: false, candidates: [], proposed: null }); expect(f.key).not.toHaveBeenCalled();
});
test("stale capture is rechecked before external inference; provider failure has no fallback", async () => {
  const f = fixture(); f.visual.permission(true); f.chrome.request.mockResolvedValueOnce({ outcome: "verified", capture: capture() }).mockResolvedValueOnce({ outcome: "blocked", reason: "visual_stale" });
  await f.visual.find({ text: "PIANO", route: "cloud", model: "llava" }); expect(f.key).not.toHaveBeenCalled(); expect(f.visual.state.ready).toBe(false);
  const request = vi.fn(async () => { throw Error("offline"); }); await expect(selectVisual({ mode: "local", model: "llava" }, "blue circle", [candidate("one")], new AbortController().signal, request)).rejects.toThrow("offline"); expect(request).toHaveBeenCalledOnce(); f.visual.stop();
});
test("visual providers accept only candidate IDs; local routes enforce loopback installed vision capability", async () => {
  const urls: string[] = []; const local = vi.fn(async (url, _init) => { urls.push(String(url)); return Response.json(String(url).endsWith("show") ? { model_info: {}, capabilities: ["vision"] } : { done: true, message: { content: '{"candidateIds":["one"]}' } }); }) as typeof fetch;
  expect(await selectVisual({ mode: "local", model: "llava" }, "circle", [candidate("one")], new AbortController().signal, local)).toEqual(["one"]); expect(urls.every(u => u.startsWith("http://127.0.0.1:11434/"))).toBe(true);
  const remote = vi.fn(async () => Response.json({ remote_host: "https://remote", model_info: {}, capabilities: ["vision"] })); await expect(selectVisual({ mode: "local", model: "llava" }, "circle", [candidate("one")], new AbortController().signal, remote)).rejects.toThrow(); expect(remote).toHaveBeenCalledOnce();
  const cloud = vi.fn(async (_url, init) => { const body = JSON.parse(String(init?.body)); expect(body.contents[0].parts[2].inlineData.mimeType).toBe("image/jpeg"); return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"candidateId":"invented"}' }] } }] }); }) as typeof fetch;
  await expect(selectVisual({ mode: "cloud", key: "FAKE" }, "circle", [candidate("one")], new AbortController().signal, cloud)).rejects.toThrow("invalid_selection");
});
