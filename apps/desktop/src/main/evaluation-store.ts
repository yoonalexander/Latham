import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { record } from "../../../../packages/contracts/src/index";
import { parseTrial, type Trial } from "../../../../packages/contracts/src/compatibility";

export class EvaluationStore {
  trials: Trial[] = []; locked = false;
  private path: string;
  constructor(directory: string) {
    this.path = join(directory, "evaluation.json");
    if (existsSync(this.path)) try {
      const bytes = readFileSync(this.path); if (bytes.length > 32768) throw new Error("oversize_evaluation");
      const value: unknown = JSON.parse(bytes.toString());
      if (!record(value) || value.version !== 1 || Object.keys(value).length !== 2 || !Array.isArray(value.trials) || value.trials.length > 50) throw new Error("invalid_evaluation");
      this.trials = value.trials.map(parseTrial);
    } catch { this.locked = true; }
  }
  add(input: unknown): void {
    if (this.locked) throw new Error("evaluation_locked");
    const next = [...this.trials.slice(-49), parseTrial(input)], temp = this.path + ".tmp";
    writeFileSync(temp, JSON.stringify({ version: 1, trials: next }), { mode: 0o600 }); renameSync(temp, this.path); this.trials = next;
  }
  clear(): void { for (const path of [this.path, this.path + ".tmp"]) if (existsSync(path)) unlinkSync(path); this.trials = []; this.locked = false; }
}
