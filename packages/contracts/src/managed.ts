import { record } from "./index";

export const managedPolicy = "latham-managed-local-v1";
export type ManagedCredentials = { origin: string; token: string; expires: number; accountId: string; policy: typeof managedPolicy };
export type ManagedUsage = { accountId: string; active: boolean; day: string; used: number; dailyLimit: number; expires: number; billing: "disabled"; policy: typeof managedPolicy };
export type ManagedState = { signedIn: boolean; origin: string; accountId: string; expires: number; usage: ManagedUsage | null; busy: boolean; message: string };
export function managedOrigin(value: unknown, allowLoopback = false): string {
  if (typeof value !== "string" || value.length > 256) throw new Error("invalid_service_origin");
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(url.protocol === "https:" || (allowLoopback && url.protocol === "http:" && url.hostname === "127.0.0.1"))) throw new Error("invalid_service_origin");
  return url.origin;
}
export function parseManagedCredentials(value: unknown, allowLoopback: boolean): ManagedCredentials {
  if (!record(value) || Object.keys(value).length !== 5 || value.policy !== managedPolicy || typeof value.token !== "string" || !/^[a-f0-9]{64}$/.test(value.token) || typeof value.accountId !== "string" || !/^[a-f0-9]{32}$/.test(value.accountId) || typeof value.expires !== "number" || !Number.isSafeInteger(value.expires) || value.expires < 1) throw new Error("invalid_managed_session");
  return { origin: managedOrigin(value.origin, allowLoopback), token: value.token, accountId: value.accountId, expires: value.expires, policy: managedPolicy };
}
export function parseManagedUsage(value: unknown): ManagedUsage {
  if (!record(value) || Object.keys(value).length !== 8 || value.policy !== managedPolicy || value.billing !== "disabled" || typeof value.active !== "boolean" || typeof value.accountId !== "string" || !/^[a-f0-9]{32}$/.test(value.accountId) || typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || ![value.used, value.dailyLimit, value.expires].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) throw new Error("invalid_provider_response");
  return value as ManagedUsage;
}
