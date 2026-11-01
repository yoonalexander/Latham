import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { record } from "../../packages/contracts/src/index";

export function verifyRelease(manifestBytes: Buffer, signature: Buffer, pinnedPublicKey: string, directory: string, currentVersion: string): { version: string; files: string[] } {
  const key = createPublicKey(pinnedPublicKey);
  if (key.asymmetricKeyType !== "ed25519" || signature.length !== 64 || manifestBytes.length > 16384 || !verify(null, manifestBytes, key, signature)) throw new Error("release_signature_invalid");
  const value: unknown = JSON.parse(manifestBytes.toString("utf8"));
  const versionParts = (version: unknown): number[] => {
    if (typeof version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error("release_manifest_invalid");
    return version.split(".").map(Number);
  };
  if (!record(value) || Object.keys(value).sort().join(",") !== "autoUpdate,channel,files,minimumChrome,platform,version" || value.platform !== "win32-x64" || value.channel !== "unsigned-developer-preview" || value.autoUpdate !== false || value.minimumChrome !== 120 || !Array.isArray(value.files) || value.files.length !== 2) throw new Error("release_manifest_invalid");
  const next = versionParts(value.version), current = versionParts(currentVersion);
  const difference = next.map((part, i) => part - current[i]!).find(n => n !== 0);
  if (difference === undefined || difference < 0) throw new Error("release_not_newer");
  const expected = [`Latham-${value.version}-win-x64-preview.zip`, `Latham-extension-${value.version}.zip`];
  for (const file of value.files) {
    if (!record(file) || Object.keys(file).sort().join(",") !== "bytes,name,sha256" || typeof file.name !== "string" || !expected.includes(file.name) || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 1000000000) throw new Error("release_manifest_invalid");
    const path = join(directory, file.name), info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== file.bytes || createHash("sha256").update(readFileSync(path)).digest("hex") !== file.sha256) throw new Error("release_artifact_invalid");
    expected.splice(expected.indexOf(file.name), 1);
  }
  if (expected.length) throw new Error("release_manifest_invalid");
  // Verification never extracts, launches, downloads or installs an artifact.
  return { version: String(value.version), files: value.files.map(file => String(file.name)) };
}
