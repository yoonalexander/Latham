import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSettings, type Diagnostic, type Settings } from "@latham/contracts";
const defaults: Settings = { fixtureAllowed: false, diagnosticsEnabled: false, delayMs: 300 };
export class Storage {
  settings: Settings = { ...defaults };
  diagnosticWriteFailed = false;
  private events: Diagnostic[] = [];
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    try { this.settings = parseSettings(JSON.parse(readFileSync(join(directory, "settings.json"), "utf8"))); } catch { /* Fail closed with no grant if missing or malformed. */ }
  }
  save(settings: Settings): void {
    const temp = join(this.directory, "settings.json.tmp");
    writeFileSync(temp, JSON.stringify(settings) + "\n", { mode: 0o600 });
    renameSync(temp, join(this.directory, "settings.json"));
    this.settings = settings;
    if (!settings.diagnosticsEnabled) this.clearDiagnostics();
  }
  record(event: Diagnostic): void {
    if (!this.settings.diagnosticsEnabled) return;
    this.events = [...this.events.slice(-49), event];
    this.flush();
  }
  clearDiagnostics(): void { this.events = []; this.flush(); }
  private flush(): void {
    try {
      writeFileSync(join(this.directory, "diagnostics.jsonl"), this.events.map(event => JSON.stringify(event)).join("\n"), { mode: 0o600 });
      this.diagnosticWriteFailed = false;
    } catch { this.diagnosticWriteFailed = true; }
  }
}
