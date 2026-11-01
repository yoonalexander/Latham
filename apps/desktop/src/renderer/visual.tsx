import { useState } from "react";
import type { SetupState } from "../../../../packages/contracts/src/setup";
import type { VisualRoute } from "../../../../packages/contracts/src/visual";
export function VisualPanel({ state, act }: { state: SetupState; act: (operation: () => Promise<unknown>) => Promise<void> }) {
  const visual = state.visual;
  const [query, setQuery] = useState("text PIANO"), [route, setRoute] = useState<VisualRoute>("ocr"), [model, setModel] = useState("llava");
  const unavailable = visual.busy || state.handsfree.phase !== "off";
  return <section className="setup-group visual-panel" aria-label="Visual thumbnail matching">
    <div className="section-kicker">OPTIONAL VISUAL CAPTURE / YOUTUBE</div><h3>6. Find a video by its thumbnail</h3>
    <p className="mini">Capture up to four visible, reviewed YouTube thumbnail images. Frames, overlays, form fields and desktop pixels are excluded. This does not capture the full screen. YouTube approval and the extension's separate thumbnail-image grant are required.</p>
    <label><input type="checkbox" checked={visual.consent} disabled={state.handsfree.phase !== "off"} onChange={event => void act(() => window.setup.visualPermission(event.target.checked))} /> Allow thumbnail capture for this session</label>
    <label>Visual route<select value={route} disabled={unavailable} onChange={event => setRoute(event.target.value as VisualRoute)}><option value="ocr">Local OCR and layout</option><option value="local">Installed Ollama vision model</option><option value="cloud">Gemini · sends captured images</option></select></label>
    {route === "local" && <label>Installed vision model<input value={model} maxLength={100} disabled={unavailable} onChange={event => setModel(event.target.value)} /></label>}
    <p className="mini">{route === "ocr" ? "Windows OCR recognizes printed English text. Use text PIANO or leftmost thumbnail. Faces and icons need a visual model." : route === "local" ? "Only the local Ollama server receives the thumbnails and OCR. Install a vision-capable model separately; Latham never downloads or substitutes one." : "Only the approved thumbnail images, OCR and bounded labels go to Google Gemini with your saved key. No automatic cloud fallback."}</p>
    <form onSubmit={event => { event.preventDefault(); void act(() => window.setup.visualFind({ text: query, route, model })); }}><label>Thumbnail description<input value={query} maxLength={300} disabled={unavailable} onChange={event => setQuery(event.target.value)} /></label><button type="submit" disabled={unavailable || !visual.consent || !state.chromeActive || !query.trim()}>Capture and find thumbnail</button></form>
    <p role="status" data-testid="visual-status">{visual.message}</p>
    <div className="visual-candidates">{visual.candidates.map((candidate, index) => <figure key={candidate.id} className={visual.proposed === candidate.id ? "visual-proposed" : ""}>
      <img src={`data:image/jpeg;base64,${candidate.image}`} alt={`Captured thumbnail ${index + 1}`} width={192} height={108} />
      <figcaption>{index + 1}. {candidate.label}</figcaption><p className="mini">{candidate.text || "No printed text detected."}</p>
      <button disabled={unavailable || !visual.ready} onClick={() => void act(() => window.setup.visualHighlight(candidate.id))}>Highlight candidate {index + 1}</button>
    </figure>)}</div>
    <div className="setup-buttons"><button disabled={unavailable || !visual.ready || !visual.proposed} onClick={() => void act(() => window.setup.visualOpen())}>Open highlighted video</button><button onClick={() => void window.latham.stop()}>Stop and clear visual capture</button></div>
    <p className="mini">An outline proposes a target; it does not click it. Capture again after page movement, zoom or content changes. Stop, permission loss and restart clear image consent and previews. Images are never saved by default.</p>
  </section>;
}
