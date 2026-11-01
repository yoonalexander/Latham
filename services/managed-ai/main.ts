import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ServiceStore } from "./store";
import { managedService } from "./server";

const directory = resolve(process.env.LATHAM_SERVICE_DATA ?? ".test-artifacts/managed-data");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const store = new ServiceStore(join(directory, "accounts.sqlite"));
const limit = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value !== undefined && !/^[1-9][0-9]{0,6}$/.test(value)) throw new Error("invalid_service_limit");
  return value === undefined ? fallback : Number(value);
};
if (process.argv[2] === "invite") {
  // Operator-only terminal output is a one-time credential; never send it to telemetry.
  console.log(JSON.stringify(store.invite(limit("LATHAM_ACCOUNT_DAILY_REQUESTS", 20), Date.now(), process.argv[3])));
  store.close();
} else if (!process.argv[2] || process.argv[2] === "serve") {
  const service = managedService({ store, key: process.env.GEMINI_API_KEY ?? "", dailyRequests: limit("LATHAM_SERVICE_DAILY_REQUESTS", 100), totalRequests: limit("LATHAM_SERVICE_TOTAL_REQUESTS", 1000) });
  const port = limit("LATHAM_SERVICE_PORT", 47831);
  if (port > 65535) throw new Error("invalid_service_port");
  // Local-only until a separately reviewed TLS ingress/deployment is configured.
  service.server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ event: "ready", port, billing: "disabled" })));
  const timer = process.env.LATHAM_SERVICE_DIAGNOSTICS === "1" ? setInterval(() => console.log(JSON.stringify({ event: "counts", ...service.metrics() })), 60000) : undefined;
  let stopping = false;
  const stop = (): void => { if (stopping) return; stopping = true; clearInterval(timer); void service.stop().finally(() => { store.close(); }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
} else { store.close(); throw new Error("use_serve_or_invite"); }
