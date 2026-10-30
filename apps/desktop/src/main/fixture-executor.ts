import type { WebContents } from "electron";
import { record, type AuthorizedAction, type DispatchReceipt, type FixtureExecutor } from "@latham/contracts";
export class LocalFixtureExecutor implements FixtureExecutor {
  constructor(private readonly contents: WebContents) {}
  private assertFixture(): void {
    if (this.contents.isDestroyed() || this.contents.getURL() !== "latham://fixture/index.html") throw new Error("executor_unavailable");
  }
  async observe(): Promise<unknown> { this.assertFixture(); return this.contents.executeJavaScript("window.fixtureApi.observe()"); }
  async dispatch(action: AuthorizedAction, signal: AbortSignal): Promise<DispatchReceipt> {
    if (signal.aborted) return { dispatch: "not_dispatched", reason: "cancelled" };
    this.assertFixture();
    const request = { documentId: action.scope.documentId, key: action.target.key, nodeId: action.target.nodeId, revision: action.target.revision, action: action.action };
    const result: unknown = await this.contents.executeJavaScript("window.fixtureApi.apply(" + JSON.stringify(request) + ")");
    if (!record(result) || !["not_dispatched", "dispatched"].includes(String(result.dispatch))) return { dispatch: "unknown", reason: "executor_unavailable" };
    if (result.dispatch === "dispatched") return { dispatch: "dispatched" };
    return { dispatch: "not_dispatched", reason: result.reason === "secure_field" ? "secure_field" : "stale_target" };
  }
}
