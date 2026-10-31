import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
if (process.platform !== "win32") throw new Error("The development native host targets Windows.");
mkdirSync("dist/native", { recursive: true });
const csc = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
execFileSync(csc, ["/nologo", "/target:exe", "/optimize+", "/reference:System.Web.Extensions.dll", `/out:${resolve("dist/native/Latham.NativeHost.exe")}`, resolve("services/windows-helper/NativeHost.cs")], { stdio: "inherit", windowsHide: true });
const framework = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
execFileSync(csc, ["/nologo", "/target:exe", "/optimize+", "/reference:System.Web.Extensions.dll", `/reference:${join(framework, "WPF/UIAutomationClient.dll")}`, `/reference:${join(framework, "WPF/UIAutomationTypes.dll")}`, `/reference:${join(framework, "WPF/WindowsBase.dll")}`, `/out:${resolve("dist/native/Latham.DesktopAgent.exe")}`, resolve("services/windows-helper/DesktopAgent.cs")], { stdio: "inherit", windowsHide: true });
