import { expect, test } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyRelease } from "../../services/release/integrity";

test("pinned release signatures bind metadata, both archives, version and bytes without executing an update", () => {
  const directory = mkdtempSync(join(tmpdir(), "latham-release-")), key = generateKeyPairSync("ed25519");
  const publicKey = key.publicKey.export({ type: "spki", format: "pem" }).toString();
  const names = ["Latham-0.8.0-win-x64-preview.zip", "Latham-extension-0.8.0.zip"];
  const files = names.map(name => { const bytes = Buffer.from(name); writeFileSync(join(directory, name), bytes); return { name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; });
  const manifest = { version: "0.8.0", channel: "unsigned-developer-preview", platform: "win32-x64", minimumChrome: 120, autoUpdate: false, files };
  const bytes = Buffer.from(JSON.stringify(manifest)), signature = sign(null, bytes, key.privateKey);
  expect(verifyRelease(bytes, signature, publicKey, directory, "0.7.0")).toEqual({ version: "0.8.0", files: names });
  for (const current of ["0.8.0", "0.9.0"]) expect(() => verifyRelease(bytes, signature, publicKey, directory, current)).toThrow("release_not_newer");
  expect(() => verifyRelease(Buffer.concat([bytes, Buffer.from(" ")]), signature, publicKey, directory, "0.7.0")).toThrow("release_signature_invalid");
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  expect(() => verifyRelease(bytes, signature, other, directory, "0.7.0")).toThrow("release_signature_invalid");
  for (const change of [{ ...manifest, files: [{ ...files[0], name: "../escape.zip" }, files[1]] }, { ...manifest, files: [files[0], files[0]] }, { ...manifest, autoUpdate: true }, { ...manifest, platform: "linux" }]) {
    const altered = Buffer.from(JSON.stringify(change));
    expect(() => verifyRelease(altered, sign(null, altered, key.privateKey), publicKey, directory, "0.7.0")).toThrow("release_manifest_invalid");
  }
  writeFileSync(join(directory, names[1]!), "tampered");
  expect(() => verifyRelease(bytes, signature, publicKey, directory, "0.7.0")).toThrow("release_artifact_invalid");
});
