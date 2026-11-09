import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
const compiler = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
const framework = join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/WPF");
execFileSync(compiler, ["/nologo", "/target:exe", "/optimize+", "/reference:System.Web.Extensions.dll", "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", ...["UIAutomationClient", "UIAutomationTypes", "WindowsBase"].map(name => `/reference:${join(framework, name + ".dll")}`), `/out:${resolve("dist/native/Latham.NativeFixture.exe")}`, resolve("tests/fixtures/NativeFixture.cs")], { stdio: "inherit", windowsHide: true });
