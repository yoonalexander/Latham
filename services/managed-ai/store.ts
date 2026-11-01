import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { managedPolicy, type ManagedUsage } from "../../packages/contracts/src/managed";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const secret = (): string => randomBytes(32).toString("hex");
type Account = { id: string; active: number; daily_limit: number };
export class ServiceStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;");
    const version = this.db.prepare("PRAGMA user_version").get()!;
    if (Number(version.user_version) > 1) { this.db.close(); throw new Error("service_schema_too_new"); }
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, active INTEGER NOT NULL, daily_limit INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage(account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, day TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(account,day));
      CREATE TABLE IF NOT EXISTS global_usage(day TEXT PRIMARY KEY, used INTEGER NOT NULL);
      PRAGMA user_version=1; COMMIT;`);
  }
  close(): void { this.db.close(); }
  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  invite(dailyLimit: number, now = Date.now(), accountId?: string): { accountId: string; invite: string } {
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) throw new Error("invalid_limit");
    const id = accountId ?? randomBytes(16).toString("hex"), token = secret();
    this.transaction(() => {
      if (accountId) {
        if (!this.db.prepare("SELECT id FROM accounts WHERE id=?").get(id)) throw new Error("account_missing");
        this.db.prepare("DELETE FROM sessions WHERE account=?").run(id);
        this.db.prepare("DELETE FROM invites WHERE account=?").run(id);
        this.db.prepare("UPDATE accounts SET active=1,daily_limit=? WHERE id=?").run(dailyLimit, id);
      } else this.db.prepare("INSERT INTO accounts VALUES(?,1,?)").run(id, dailyLimit);
      this.db.prepare("INSERT INTO invites VALUES(?,?,?)").run(hash(token), id, now + 86400000);
    });
    return { accountId: id, invite: token };
  }
  enroll(invite: string, policy: string, now: number): { token: string; accountId: string; expires: number; policy: typeof managedPolicy } {
    if (policy !== managedPolicy || !/^[a-f0-9]{64}$/.test(invite)) throw new Error("authentication_failed");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT account FROM invites WHERE hash=? AND expires>?").get(hash(invite), now);
      if (!row) throw new Error("authentication_failed");
      const token = secret(), expires = now + 30 * 86400000, id = String(row.account);
      this.db.prepare("DELETE FROM invites WHERE hash=?").run(hash(invite));
      this.db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(hash(token), id, expires);
      return { token, accountId: id, expires, policy: managedPolicy };
    });
  }
  authenticate(token: string, now: number): Account & { expires: number } {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("authentication_failed");
    const row = this.db.prepare("SELECT a.*,s.expires FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.hash=? AND s.expires>?").get(hash(token), now);
    if (!row) throw new Error("authentication_failed");
    return { id: String(row.id), active: Number(row.active), daily_limit: Number(row.daily_limit), expires: Number(row.expires) };
  }
  usage(token: string, now: number): ManagedUsage {
    const account = this.authenticate(token, now), day = new Date(now).toISOString().slice(0, 10);
    const used = Number(this.db.prepare("SELECT used FROM usage WHERE account=? AND day=?").get(account.id, day)?.used ?? 0);
    return { accountId: account.id, active: account.active === 1, day, used, dailyLimit: account.daily_limit, expires: account.expires, billing: "disabled", policy: managedPolicy };
  }
  reserve(token: string, now: number, globalDaily: number, globalTotal: number): string {
    return this.transaction(() => {
      const account = this.usage(token, now);
      if (!account.active) throw new Error("service_cancelled");
      const daily = Number(this.db.prepare("SELECT used FROM global_usage WHERE day=?").get(account.day)?.used ?? 0);
      const total = Number(this.db.prepare("SELECT SUM(used) AS used FROM global_usage").get()?.used ?? 0);
      if (account.used >= account.dailyLimit || daily >= globalDaily || total >= globalTotal) throw new Error("quota_or_rate_limit");
      this.db.prepare("INSERT INTO usage VALUES(?,?,1) ON CONFLICT(account,day) DO UPDATE SET used=used+1").run(account.accountId, account.day);
      this.db.prepare("INSERT INTO global_usage VALUES(?,1) ON CONFLICT(day) DO UPDATE SET used=used+1").run(account.day);
      return account.accountId;
    });
  }
  signOut(token: string): void { this.db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(token)); }
  cancel(token: string, now: number): string {
    const { id } = this.authenticate(token, now);
    this.db.prepare("UPDATE accounts SET active=0 WHERE id=?").run(id); return id;
  }
  remove(token: string, now: number): string {
    const { id } = this.authenticate(token, now);
    this.db.prepare("DELETE FROM accounts WHERE id=?").run(id); return id;
  }
  prune(now: number): void {
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
    this.db.prepare("DELETE FROM invites WHERE expires<=?").run(now);
    this.db.prepare("DELETE FROM usage WHERE day<?").run(new Date(now - 31 * 86400000).toISOString().slice(0, 10));
    this.db.prepare("DELETE FROM accounts WHERE NOT EXISTS(SELECT 1 FROM sessions s WHERE s.account=accounts.id) AND NOT EXISTS(SELECT 1 FROM invites i WHERE i.account=accounts.id)").run();
  }
}
