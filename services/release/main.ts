import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
import { resolve, join } from "node:path";
import { verifyRelease } from "./integrity";

const [command, directoryArg, keyPath, currentVersion] = process.argv.slice(2);
if (!directoryArg || !keyPath) throw new Error("use_sign_directory_privateKey_or_verify_directory_pinnedPublicKey_currentVersion");
const directory = resolve(directoryArg), path = join(directory, "release-manifest.json");
if (command === "sign") {
  const key = createPrivateKey(readFileSync(keyPath));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("ed25519_key_required");
  writeFileSync(path + ".sig", sign(null, readFileSync(path), key), { flag: "wx" });
  console.log("Manifest signed. This does not replace Windows Authenticode or authenticate an untrusted public key.");
} else if (command === "verify" && currentVersion) {
  console.log(JSON.stringify(verifyRelease(readFileSync(path), readFileSync(path + ".sig"), readFileSync(keyPath, "utf8"), directory, currentVersion)));
} else throw new Error("invalid_release_command");
