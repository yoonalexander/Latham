import { spawn } from "node:child_process";
import electron from "electron";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Electron is a GUI process: a hidden startup flag suppresses its first Settings show on Windows.
const child = spawn(electron, ["dist/main.cjs"], { stdio: "inherit", env, windowsHide: false });
child.on("exit", code => process.exit(code ?? 1));
