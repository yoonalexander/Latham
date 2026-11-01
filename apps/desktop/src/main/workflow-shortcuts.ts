import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { record } from "../../../../packages/contracts/src/index";
import { parseWorkflowGoal, type WorkflowGoal, type WorkflowShortcut } from "../../../../packages/contracts/src/workflow";
import type { Encryption } from "./provider-store";

export class WorkflowShortcuts {
  private entries: WorkflowShortcut[] = [];
  private readonly path: string;
  locked = false;
  constructor(directory: string, private encryption: Encryption) {
    this.path = join(directory, "workflow-shortcuts.bin");
    if (!existsSync(this.path)) return;
    try {
      if (!this.available || statSync(this.path).size > 65536) throw new Error();
      const value = JSON.parse(encryption.decryptString(readFileSync(this.path)));
      if (!record(value) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 10) throw new Error();
      this.entries = value.entries.map(entry => {
        if (!record(entry) || Object.keys(entry).sort().join(",") !== "goal,id,name" || typeof entry.id !== "string" || !/^[\w-]{36}$/.test(entry.id)) throw new Error();
        return { id: entry.id, name: this.name(entry.name), goal: parseWorkflowGoal(entry.goal) };
      });
      if (new Set(this.entries.map(entry => entry.id)).size !== this.entries.length || new Set(this.entries.map(entry => entry.name.toLowerCase())).size !== this.entries.length) throw new Error();
    } catch { this.entries = []; this.locked = true; }
  }
  get available(): boolean { return process.platform === "win32" && this.encryption.isEncryptionAvailable(); }
  get list(): WorkflowShortcut[] { return structuredClone(this.entries); }
  private name(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.length > 80 || /[\x00-\x1f]/.test(value)) throw new Error("invalid_shortcut_name"); return value.trim(); }
  private write(entries: WorkflowShortcut[]): void {
    if (!this.available || this.locked) throw new Error("shortcut_storage_locked");
    const temp = this.path + ".tmp"; writeFileSync(temp, this.encryption.encryptString(JSON.stringify({ version: 1, entries })), { mode: 0o600 }); renameSync(temp, this.path); this.entries = entries;
  }
  save(name: unknown, goal: WorkflowGoal, id: unknown): void {
    const label = this.name(name);
    if (id !== null && (typeof id !== "string" || !this.entries.some(entry => entry.id === id))) throw new Error("shortcut_missing");
    if (this.entries.some(entry => entry.id !== id && entry.name.toLowerCase() === label.toLowerCase()) || id === null && this.entries.length >= 10) throw new Error("shortcut_limit_or_duplicate");
    const entry = { id: id === null ? randomUUID() : id as string, name: label, goal: parseWorkflowGoal(goal) };
    this.write([...this.entries.filter(item => item.id !== id), entry]);
  }
  remove(id: unknown): void {
    if (typeof id !== "string" || !this.entries.some(entry => entry.id === id)) throw new Error("shortcut_missing");
    this.write(this.entries.filter(entry => entry.id !== id));
  }
  clear(): void { if (existsSync(this.path)) unlinkSync(this.path); this.entries = []; this.locked = false; }
}
