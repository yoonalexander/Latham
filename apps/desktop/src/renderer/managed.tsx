import { useState } from "react";
import { managedPolicy } from "../../../../packages/contracts/src/managed";
import type { SetupState } from "../../../../packages/contracts/src/setup";

export function ManagedPanel({ state, act }: { state: SetupState; act: (operation: () => Promise<unknown>) => Promise<void> }) {
  const [origin, setOrigin] = useState(state.canImportEnvironmentKey ? "http://127.0.0.1:47831" : "");
  const [invite, setInvite] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const managed = state.managed;
  return <section className="setup-group managed-panel" aria-label="Managed AI account">
    <h4>Optional managed AI · local preview</h4>
    <p className="mini">Billing is disabled. Sign in with a one-time invitation from your local service operator; you do not need a provider key. Public hosting is not configured.</p>
    <p className="mini">When you explicitly select and save this route, active recordings (up to 30 seconds), your target request and bounded visible control labels go to the displayed service, then Google Gemini. Field values, screenshots and idle wake audio are excluded. Managed vision is unavailable; visual routes keep their separate local/user-key choice.</p>
    <p className="mini">This service keeps account/session hashes and request counts, not audio, transcripts or page content. Google has separate retention terms; unpaid Gemini inputs may be used to improve its products and reviewed by people. Use synthetic, non-sensitive content in this preview. No automatic cloud fallback.</p>
    <fieldset disabled={managed.busy}>
      {!managed.signedIn ? <>
        <label>Managed service address<input value={origin} placeholder={state.canImportEnvironmentKey ? "http://127.0.0.1:47831" : "https://your-service.example"} maxLength={256} spellCheck={false} onChange={event => { setOrigin(event.target.value); setConsent(false); }} /></label>
        <label>One-time invitation<input type="password" autoComplete="off" value={invite} maxLength={64} onChange={event => setInvite(event.target.value)} /></label>
        <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I accept this address and the audio/control-label routing and retention described above.</label>
        <button disabled={!state.vaultAvailable || !consent || !/^[a-f0-9]{64}$/.test(invite)} onClick={() => void act(async () => { await window.setup.managedSignIn({ origin, invite, consent: managedPolicy }); setInvite(""); })}>Sign in with invitation</button>
      </> : <>
        <p>Service: {managed.origin}<br />Account: {managed.accountId}<br />Session expires: {new Date(managed.expires).toLocaleString()}</p>
        <p className="mini">A signed-in account does not switch your saved AI route. Use “Latham-managed AI”, then “Save AI setup”. Sign-out, cancellation and deletion pause current work.</p>
        <div className="setup-buttons"><button onClick={() => void act(() => window.setup.managedAccount("refresh"))}>Refresh usage</button><button onClick={() => void act(() => window.setup.managedAccount("sign_out"))}>Sign out and revoke session</button></div>
        {managed.usage && <p role="status">{managed.usage.active ? "Service active" : "Service cancelled"} · {managed.usage.used}/{managed.usage.dailyLimit} admitted requests on {managed.usage.day} (UTC). No charges.</p>}
        <label>Type cancel to stop service, or delete to erase this account<input value={confirmation} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></label>
        <div className="setup-buttons"><button disabled={confirmation !== "cancel"} onClick={() => void act(async () => { await window.setup.managedAccount("cancel"); setConfirmation(""); })}>Cancel managed service</button><button disabled={confirmation !== "delete"} onClick={() => void act(async () => { await window.setup.managedAccount("delete"); setConfirmation(""); })}>Delete managed account</button></div>
        <p className="mini">Deletion removes account, sessions and identifiable usage from the live service database. Anonymous global totals remain. Provider retention is separate; copied operator backups need their own deletion procedure.</p>
      </>}
      <details><summary>Offline session recovery</summary><p className="mini">Forget only removes this device's encrypted session. It does not cancel service or revoke a server session. Use it if sign-in storage is damaged or the service is unavailable; ask the operator to revoke other sessions.</p><button onClick={() => void act(() => window.setup.managedAccount("forget"))}>Forget managed session on this device</button></details>
    </fieldset>
    <p role="status" data-testid="managed-status">{managed.busy ? "Contacting managed service…" : managed.message}</p>
  </section>;
}
