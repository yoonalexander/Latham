using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class NativeFixture : Form {
    delegate bool ChildWindowCallback(IntPtr window, IntPtr data);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, ChildWindowCallback callback, IntPtr data);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int command);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    IntPtr launchedWindow; int launchedPid;
    TextBox draft, secret, other; Form otherWindow; int blockAfterEdit; bool reactive;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    NativeFixture() {
        Text = "Latham synthetic native fixture"; Width = 720; Height = 480;
        StartPosition = FormStartPosition.Manual; Location = new Point(40, 80);
        draft = MakeDraft(); Controls.Add(draft);
        secret = new TextBox { Name = "Password", AccessibleName = "Password", UseSystemPasswordChar = true, Text = "PRIVATE_NATIVE_SENTINEL", Left = 30, Top = 260, Width = 400 }; Controls.Add(secret);
        other = new TextBox { Name = "Other", AccessibleName = "Other field", Text = "Other field", Left = 30, Top = 310, Width = 400 }; Controls.Add(other);
        Controls.Add(new Button { Text = "Send", Name = "Send", Left = 470, Top = 310 });
        Shown += (s, e) => { draft.Focus(); Report("ready"); };
        new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Length > 16384) break;
                var command = json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(line);
                BeginInvoke((Action)(() => {
                    string kind = (string)command["kind"];
                    if (kind == "edit") draft.Text = (string)command["text"];
                    else if (kind == "focus_other") other.Focus();
                    else if (kind == "focus") {
                        Activate();
                        FocusWindow(Handle);
                        draft.Focus();
                    }
                    else if (kind == "remember_launched_app") {
                        var window = GetForegroundWindow(); int pid; GetWindowThreadProcessId(window, out pid);
                        object app;
                        if (!command.TryGetValue("app", out app) || !IsTestAppWindow(window, pid, app as string)) {
                            Report("launch_app_mismatch"); return;
                        }
                        launchedWindow = window; launchedPid = pid;
                    }
                    else if (kind == "minimize_launched_app") {
                        int pid; GetWindowThreadProcessId(launchedWindow, out pid);
                        if (launchedWindow == IntPtr.Zero || pid != launchedPid) { Report("launch_app_changed"); return; }
                        ShowWindow(launchedWindow, 6);
                    }
                    else if (kind == "restore_launched_app" && launchedWindow != IntPtr.Zero) ShowWindow(launchedWindow, 9);
                    else if (kind == "replace") { Controls.Remove(draft); draft.Dispose(); draft = MakeDraft(); Controls.Add(draft); draft.Focus(); }
                    else if (kind == "password") draft.UseSystemPasswordChar = true;
                    else if (kind == "readonly") draft.ReadOnly = true;
                    else if (kind == "reactive") reactive = true;
                    else if (kind == "block_after_edit") blockAfterEdit = 4000;
                    else if (kind == "stall") { Report("stalling"); Thread.Sleep(10000); }
                    else if (kind == "move") { Location = new Point(Convert.ToInt32(command["x"]), Convert.ToInt32(command["y"])); }
                    else if (kind == "scale") Scale(new SizeF(1.5F, 1.5F));
                    else if (kind == "wrong_window") { otherWindow = new Form { Text = "Unselected native window", Width = 400, Height = 300 }; otherWindow.Show(this); otherWindow.Activate(); }
                    else if (kind == "close") { Close(); return; }
                    Report(kind);
                }));
            }
        }) { IsBackground = true }.Start();
    }
    static bool FocusWindow(IntPtr window) {
        if (GetForegroundWindow() != window) {
            try { System.Windows.Automation.AutomationElement.FromHandle(window).SetFocus(); }
            catch (InvalidOperationException) {}
            catch (System.Windows.Automation.ElementNotAvailableException) {}
        }
        return GetForegroundWindow() == window;
    }
    static bool IsCalculatorProcess(int pid) {
        try {
            using (var process = Process.GetProcessById(pid)) {
                string name = process.ProcessName.ToLowerInvariant();
                return name == "calculatorapp" || name == "calculator" || name == "calc";
            }
        } catch (ArgumentException) { return false; }
    }
    static bool IsTestAppWindow(IntPtr window, int pid, string app) {
        try {
            using (var process = Process.GetProcessById(pid)) {
                if (app == "notepad") return process.ProcessName.Equals("notepad", StringComparison.OrdinalIgnoreCase);
                if (app != "calculator") return false;
                if (IsCalculatorProcess(pid)) return true;
                if (!process.ProcessName.Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase)) return false;
            }
        } catch (ArgumentException) { return false; }
        bool found = false;
        EnumChildWindows(window, (child, data) => {
            int childPid; GetWindowThreadProcessId(child, out childPid);
            found = childPid != pid && IsCalculatorProcess(childPid);
            return !found;
        }, IntPtr.Zero);
        return found;
    }
    TextBox MakeDraft() {
        var field = new TextBox { Name = "Draft", AccessibleName = "Draft", Multiline = false, Left = 30, Top = 50, Width = 600, Text = "" };
        field.TextChanged += (s, e) => {
            Report("changed");
            if (blockAfterEdit > 0) { int delay = blockAfterEdit; blockAfterEdit = 0; Thread.Sleep(delay); }
            if (reactive) { reactive = false; var timer = new System.Windows.Forms.Timer { Interval = 50 }; timer.Tick += (a, b) => { timer.Stop(); field.Text = "PAGE_CHANGED_LATER"; timer.Dispose(); }; timer.Start(); }
        }; return field;
    }
    void Report(string kind) { using (var graphics = CreateGraphics()) lock (json) { Console.WriteLine(json.Serialize(new { kind, pid = Process.GetCurrentProcess().Id, started = Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(), hwnd = Handle.ToInt64(), foreground = GetForegroundWindow().ToInt64(), launchedWindow = launchedWindow.ToInt64(), launchedMinimized = launchedWindow != IntPtr.Zero && IsIconic(launchedWindow), text = draft.Text, dpi = graphics.DpiX, screens = Screen.AllScreens.Length, x = Left, y = Top })); Console.Out.Flush(); } }
    [STAThread] static int Main(string[] args) {
        if (args.Length == 2 && args[0] == "--focus-test-browser") {
            foreach (var browser in Process.GetProcessesByName("latham-test-browser")) {
                using (browser) {
                    try {
                        IntPtr window = browser.MainWindowHandle;
                        if (window != IntPtr.Zero && browser.MainWindowTitle.Contains(args[1]) && FocusWindow(window)) return 0;
                    } catch (InvalidOperationException) {}
                }
            }
            return 1;
        }
        Application.EnableVisualStyles();
        Application.Run(new NativeFixture());
        return 0;
    }
}
