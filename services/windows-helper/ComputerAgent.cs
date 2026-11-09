using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// One bounded request per disposable worker. Main owns deadlines and kills on Stop.
static class ComputerAgent {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4000000 };
    static Dictionary<string, object> Request;
    static int Controller; static bool Dispatched;
    static List<AutomationElement> Elements = new List<AutomationElement>();
    static List<object> Targets = new List<object>(); static List<Rectangle> Masks = new List<Rectangle>();
    static List<string> Revision = new List<string>(); static int Visited;
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct LastInput { public uint Size, Tick; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public InputData Data; }
    [StructLayout(LayoutKind.Explicit)] struct InputData { [FieldOffset(0)] public Mouse Mouse; [FieldOffset(0)] public Keyboard Keyboard; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LastInput info);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, int length, out int needed);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int length, out int needed);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static void Check(bool value, string code) { if (!value) throw new Exception(code); }
    static string S(Dictionary<string, object> value, string key) { object v; return value.TryGetValue(key, out v) ? v as string ?? "" : ""; }
    static string Hash(string text) { using (var hash = SHA256.Create()) return Convert.ToBase64String(hash.ComputeHash(Encoding.UTF8.GetBytes(text))); }
    static uint Tick() { var input = new LastInput { Size = (uint)Marshal.SizeOf(typeof(LastInput)) }; Check(GetLastInputInfo(ref input), "input_identity_unavailable"); return input.Tick; }
    static bool Safe(Process process) {
        IntPtr token; if (!OpenProcessToken(process.Handle, 8, out token)) return false;
        try { using (var identity = new WindowsIdentity(token)) { if (!identity.User.Equals(WindowsIdentity.GetCurrent().User)) return false; }
            IntPtr data = Marshal.AllocHGlobal(4); try { int needed; return GetTokenInformation(token, 20, data, 4, out needed) && Marshal.ReadInt32(data) == 0; } finally { Marshal.FreeHGlobal(data); }
        } finally { CloseHandle(token); }
    }
    static void Desktop() {
        IntPtr desktop = OpenInputDesktop(0, false, 1); Check(desktop != IntPtr.Zero, "secure_desktop");
        try { var name = new StringBuilder(128); int needed; Check(GetUserObjectInformation(desktop, 2, name, 256, out needed) && name.ToString() == "Default", "secure_desktop"); } finally { CloseDesktop(desktop); }
    }
    static bool Browser(string app) { return app == "chrome" || app == "msedge" || app == "firefox" || app == "brave" || app == "opera"; }
    static string Identity(IntPtr hwnd, out Process process, out Rect rect, bool allowMinimized = false) {
        Desktop(); int pid; GetWindowThreadProcessId(hwnd, out pid); process = Process.GetProcessById(pid);
        Check(pid != Controller && process.SessionId == Process.GetCurrentProcess().SessionId && Safe(process) && IsWindowVisible(hwnd) && (allowMinimized || !IsIconic(hwnd)), "computer_app_denied");
        string app = process.ProcessName.ToLowerInvariant();
        string original = Path.GetFileNameWithoutExtension(process.MainModule.FileVersionInfo.OriginalFilename ?? "").ToLowerInvariant();
        string excluded = "^(cmd|powershell|pwsh|conhost|windowsterminal|wt|logonui|lockapp|credentialuibroker|consent|keepass.*|1password.*|bitwarden.*|sechealthui|securityhealth.*|taskmgr|regedit|mmc|msiexec)$";
        Check(!System.Text.RegularExpressions.Regex.IsMatch(app, excluded) && !System.Text.RegularExpressions.Regex.IsMatch(original, excluded), "computer_app_denied");
        foreach (object denied in (System.Collections.IEnumerable)Request["deniedApps"]) Check(app != Convert.ToString(denied).ToLowerInvariant(), "computer_app_denied");
        Check(!(Browser(app) || Browser(original)) || (Convert.ToBoolean(Request["browserAllowed"]) && !Convert.ToBoolean(Request["siteBlocked"])), "computer_browser_scope_denied");
        Check(GetWindowRect(hwnd, out rect) && ((allowMinimized && IsIconic(hwnd)) || (rect.Right - rect.Left >= 40 && rect.Bottom - rect.Top >= 40 && rect.Right - rect.Left <= 7680 && rect.Bottom - rect.Top <= 4320)), "computer_geometry_unavailable"); return app;
    }
    static string Runtime(AutomationElement element) { return string.Join(".", element.GetRuntimeId()); }
    static void Walk(AutomationElement element, Rect window, int depth) {
        if (++Visited > 700 || depth > 14 || Targets.Count >= 120) throw new Exception("computer_tree_limit");
        var info = element.Current; var r = info.BoundingRectangle;
        if (info.IsOffscreen || r.IsEmpty) return;
        if (info.IsPassword || System.Text.RegularExpressions.Regex.IsMatch(info.Name ?? "", "\\b(terminal|powershell|command prompt|password manager)\\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) { Masks.Add(new Rectangle((int)r.X - window.Left, (int)r.Y - window.Top, (int)r.Width, (int)r.Height)); return; }
        string name = info.Name ?? "", role = info.ControlType.ProgrammaticName.Replace("ControlType.", "");
        if (name.Length > 240) name = name.Substring(0, 240);
        object pattern; var actions = new List<string>();
        if (info.IsEnabled && info.IsKeyboardFocusable) actions.Add("focus");
        if (info.IsEnabled && (element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern) || element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern) || element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern))) actions.Add("click");
        if (info.IsEnabled && element.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern) && ((ScrollPattern)pattern).Current.VerticallyScrollable) actions.Add("scroll");
        string valueHash = "", visibleValue = "";
        if (info.IsEnabled && element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) {
            var value = (ValuePattern)pattern;
            string current = value.Current.Value;
            if (current.Length <= 20000) { if (!value.Current.IsReadOnly) actions.Add("type"); valueHash = Hash(current); visibleValue = current.Substring(0, Math.Min(1000, current.Length)); }
        }
        else if (info.IsEnabled && info.IsKeyboardFocusable && (info.ControlType == ControlType.Edit || info.ControlType == ControlType.Document) && element.TryGetCurrentPattern(TextPattern.Pattern, out pattern)) {
            var range = ((TextPattern)pattern).DocumentRange; string current = range.GetText(20001);
            if (current.Length <= 20000) { if (Equals(range.GetAttributeValue(TextPattern.IsReadOnlyAttribute), false)) actions.Add("type"); valueHash = Hash(current); visibleValue = current.Substring(0, Math.Min(1000, current.Length)); }
        }
        string id = Runtime(element);
        Revision.Add(id + "|" + name + "|" + role + "|" + r.ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + info.IsEnabled + "|" + info.HasKeyboardFocus + "|" + valueHash);
        if (name.Length > 0 || actions.Count > 0) { Targets.Add(new { id, name, role, actions = actions.ToArray(), value = visibleValue, focused = info.HasKeyboardFocus }); Elements.Add(element); }
        var walker = TreeWalker.ControlViewWalker; var child = walker.GetFirstChild(element);
        while (child != null) { Walk(child, window, depth + 1); child = walker.GetNextSibling(child); }
    }
    static string Capture(IntPtr hwnd, Rect rect, out string hash) {
        // PrintWindow renders in the target's DPI context; UIA bounds remain physical pixels.
        IntPtr previous = SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(hwnd)); Check(previous != IntPtr.Zero, "computer_geometry_unavailable");
        Rect rendered; try { Check(GetWindowRect(hwnd, out rendered), "computer_geometry_unavailable"); } finally { SetThreadDpiAwarenessContext(previous); }
        int width = rendered.Right - rendered.Left, height = rendered.Bottom - rendered.Top;
        double scaleX = (double)width / (rect.Right - rect.Left), scaleY = (double)height / (rect.Bottom - rect.Top);
        Check(width >= 40 && height >= 40 && width <= 7680 && height <= 4320, "computer_geometry_unavailable");
        using (var image = new Bitmap(width, height)) {
            using (var graphics = Graphics.FromImage(image)) { IntPtr dc = graphics.GetHdc(); try { Check(PrintWindow(hwnd, dc, 2), "computer_capture_unavailable"); } finally { graphics.ReleaseHdc(dc); }
                foreach (var mask in Masks) graphics.FillRectangle(Brushes.Black, (float)(mask.Left * scaleX), (float)(mask.Top * scaleY), (float)Math.Ceiling(mask.Width * scaleX), (float)Math.Ceiling(mask.Height * scaleY)); }
            using (var small = new Bitmap(image, Math.Min(width, 1280), Math.Max(1, (int)(height * Math.Min(1.0, 1280.0 / width))))) using (var stream = new MemoryStream()) {
                small.Save(stream, ImageFormat.Png); var bytes = stream.ToArray(); Check(bytes.Length <= 1500000, "computer_image_limit");
                using (var sha = SHA256.Create()) hash = Convert.ToBase64String(sha.ComputeHash(bytes)); return Convert.ToBase64String(bytes);
            }
        }
    }
    static void Key(ushort key, bool shift, bool ctrl) {
        var inputs = new List<Input>();
        if (ctrl) inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x11 } } });
        if (shift) inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x10 } } });
        inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = key } } });
        inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = key, Flags = 2 } } });
        if (shift) inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x10, Flags = 2 } } });
        if (ctrl) inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x11, Flags = 2 } } });
        Dispatched = true; Check(SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(Input))) == inputs.Count, "computer_input_unconfirmed");
    }
    static bool LaunchName(string name, string app) { return app == "notepad" ? name == "notepad" : name == "calculator" || name == "calculatorapp" || name == "calc"; }
    static bool LaunchWindow(IntPtr window, string app) {
        Process process = null;
        try {
            Rect rect; string name = Identity(window, out process, out rect, true);
            string original = Path.GetFileNameWithoutExtension(process.MainModule.FileVersionInfo.OriginalFilename ?? "").ToLowerInvariant();
            return LaunchName(name, app) || LaunchName(original, app);
        } catch { return false; } finally { if (process != null) process.Dispose(); }
    }
    static void Launch(string app) {
        Check(app == "calculator" || app == "notepad", "computer_launch_blocked"); Desktop();
        foreach (object denied in (System.Collections.IEnumerable)Request["deniedApps"]) Check(!LaunchName(Convert.ToString(denied).ToLowerInvariant(), app), "computer_app_denied");
        AppWindow.Open(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", app == "calculator" ? "calc.exe" : "notepad.exe"),
            window => LaunchWindow(window, app), Desktop, () => { Dispatched = true; });
        Process process; Rect rect; Identity(GetForegroundWindow(), out process, out rect);
    }
    [MTAThread] static int Main(string[] args) {
        try {
            Controller = int.Parse(args[0]); Check(Safe(Process.GetCurrentProcess()), "elevated_helper_denied"); SetProcessDPIAware();
            var parent = new Thread(() => { try { Process.GetProcessById(Controller).WaitForExit(); } catch {} Environment.Exit(1); }); parent.IsBackground = true; parent.Start();
            string line = Console.ReadLine(); Check(line != null && line.Length <= 100000, "invalid_request"); Request = Json.Deserialize<Dictionary<string, object>>(line);
            string kind = S(Request, "kind"); IntPtr hwnd = GetForegroundWindow();
            if (kind == "launch") { Launch(S(Request, "app")); Console.WriteLine("{\"outcome\":\"verified\",\"reason\":\"app_window_verified\"}"); return 0; }
            if (kind == "restore") {
                var expectedWindow = (Dictionary<string, object>)Request["observation"]; var desired = new IntPtr(long.Parse(S(expectedWindow, "hwnd")));
                int foregroundPid; GetWindowThreadProcessId(hwnd, out foregroundPid); Check(hwnd == desired || foregroundPid == Controller, "computer_focus_changed");
                Process restoreProcess; Rect restoreRect; Identity(desired, out restoreProcess, out restoreRect);
                Check(restoreProcess.Id == Convert.ToInt32(expectedWindow["pid"]) && restoreProcess.StartTime.ToUniversalTime().Ticks.ToString() == S(expectedWindow, "started"), "computer_focus_changed");
                if (hwnd != desired) SetForegroundWindow(desired); Thread.Sleep(100); Check(GetForegroundWindow() == desired, "computer_focus_denied");
                Console.WriteLine("{\"outcome\":\"verified\"}"); return 0;
            }
            Process process; Rect rect; string app = Identity(hwnd, out process, out rect);
            uint inputTick = Tick();
            var root = AutomationElement.FromHandle(hwnd); Revision.Add(rect.Left + "|" + rect.Top + "|" + rect.Right + "|" + rect.Bottom); Walk(root, rect, 0);
            string revision = Hash(string.Join("\n", Revision.ToArray())), imageHash = "", image = "";
            if (Convert.ToBoolean(Request["images"])) image = Capture(hwnd, rect, out imageHash);
            Check(GetForegroundWindow() == hwnd, "computer_focus_changed"); Check(Tick() == inputTick, "computer_user_input_changed");
            if (kind == "observe") {
                string title = root.Current.Name ?? ""; if (title.Length > 200) title = title.Substring(0, 200);
                Console.WriteLine(Json.Serialize(new { outcome = "verified", observation = new { hwnd = hwnd.ToInt64().ToString(), pid = process.Id, started = process.StartTime.ToUniversalTime().Ticks.ToString(), app, title, revision, imageHash, inputTick = Tick(), capturedAt = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top, targets = Targets.ToArray(), image } })); return 0;
            }
            Check(kind == "act", "invalid_request"); var expected = (Dictionary<string, object>)Request["observation"];
            Check(S(expected, "hwnd") == hwnd.ToInt64().ToString() && Convert.ToInt32(expected["pid"]) == process.Id && S(expected, "started") == process.StartTime.ToUniversalTime().Ticks.ToString(), "computer_focus_changed");
            Check(revision == S(expected, "revision"), "computer_observation_changed");
            Check(Tick() == Convert.ToUInt32(expected["inputTick"]), "computer_user_input_changed");
            Check((DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds - Convert.ToDouble(expected["capturedAt"]) <= 15000, "computer_observation_expired");
            var action = (Dictionary<string, object>)Request["action"]; string operation = S(action, "kind"), target = S(action, "target"), text = S(action, "text");
            AutomationElement element = Elements.Find(item => Runtime(item) == target); object pattern = null;
            for (int attempt = 0; attempt < 20 && (GetAsyncKeyState(0x11) < 0 || GetAsyncKeyState(0x12) < 0 || GetAsyncKeyState(0x10) < 0 || GetAsyncKeyState(0x5B) < 0 || GetAsyncKeyState(0x5C) < 0); attempt++) Thread.Sleep(20);
            Check(GetAsyncKeyState(0x11) >= 0 && GetAsyncKeyState(0x12) >= 0 && GetAsyncKeyState(0x10) >= 0 && GetAsyncKeyState(0x5B) >= 0 && GetAsyncKeyState(0x5C) >= 0, "computer_input_busy");
            Check(GetForegroundWindow() == hwnd && Tick() == inputTick, "computer_user_input_changed");
            if (operation == "focus") { Check(element != null && element.Current.IsKeyboardFocusable, "computer_target_required"); Dispatched = true; element.SetFocus(); Check(element.Current.HasKeyboardFocus, "computer_input_unconfirmed"); }
            else if (operation == "type") {
                Check(element != null && !element.Current.IsPassword && text.Length > 0 && text.Length <= 1000, "computer_edit_blocked");
                if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) { var value = (ValuePattern)pattern; Check(!value.Current.IsReadOnly, "computer_edit_blocked"); Dispatched = true; value.SetValue(text); for (int attempt = 0; attempt < 20 && value.Current.Value != text; attempt++) Thread.Sleep(20); Check(value.Current.Value == text, "computer_input_unconfirmed"); }
                else {
                    Check(element.TryGetCurrentPattern(TextPattern.Pattern, out pattern) && Equals(((TextPattern)pattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute), false), "computer_edit_blocked");
                    Dispatched = true; element.SetFocus(); Check(element.Current.HasKeyboardFocus && GetForegroundWindow() == hwnd && Tick() == inputTick, "computer_focus_changed");
                    // Selection and text are one paired batch so other input cannot split the replacement.
                    var inputs = new List<Input> { new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x11 } } }, new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 65 } } }, new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 65, Flags = 2 } } }, new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Key = 0x11, Flags = 2 } } } };
                    foreach (char character in text) { inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Scan = character, Flags = 4 } } }); inputs.Add(new Input { Type = 1, Data = new InputData { Keyboard = new Keyboard { Scan = character, Flags = 6 } } }); }
                    Check(SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(Input))) == inputs.Count, "computer_input_unconfirmed");
                    Thread.Sleep(120); Check(((TextPattern)pattern).DocumentRange.GetText(1001).Replace("\r\n", "\n").TrimEnd('\r', '\n') == text.Replace("\r\n", "\n").TrimEnd('\r', '\n'), "computer_input_unconfirmed");
                }
            }
            else if (operation == "click" && element != null) {
                Dispatched = true;
                if (element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) ((InvokePattern)pattern).Invoke();
                else if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) ((SelectionItemPattern)pattern).Select();
                else if (element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern)) ((ExpandCollapsePattern)pattern).Expand();
                else throw new Exception("computer_target_required");
            } else if (operation == "click") {
                Check(image.Length > 0 && imageHash == S(expected, "imageHash"), "computer_image_changed");
                Check(Convert.ToDouble(action["x"]) >= 0 && Convert.ToDouble(action["x"]) <= 1000 && Convert.ToDouble(action["y"]) >= 0 && Convert.ToDouble(action["y"]) <= 1000, "computer_geometry_unavailable");
                var point = new Point { X = rect.Left + (int)(Convert.ToDouble(action["x"]) * (rect.Right - rect.Left - 1) / 1000), Y = rect.Top + (int)(Convert.ToDouble(action["y"]) * (rect.Bottom - rect.Top - 1) / 1000) };
                Check(!Masks.Exists(mask => mask.Contains(point.X - rect.Left, point.Y - rect.Top)), "computer_edit_blocked");
                Check(GetAncestor(WindowFromPoint(point), 2) == hwnd, "computer_click_occluded"); Point before; GetCursorPos(out before); Check(SetCursorPos(point.X, point.Y), "computer_input_unconfirmed");
                try { var inputs = new[] { new Input { Data = new InputData { Mouse = new Mouse { Flags = 2 } } }, new Input { Data = new InputData { Mouse = new Mouse { Flags = 4 } } } }; Dispatched = true; Check(SendInput(2, inputs, Marshal.SizeOf(typeof(Input))) == 2, "computer_input_unconfirmed"); } finally { Point current; if (GetCursorPos(out current) && current.X == point.X && current.Y == point.Y) SetCursorPos(before.X, before.Y); }
            } else if (operation == "scroll") {
                Check(text == "up" || text == "down", "invalid_request");
                // Use an accessible scroll container; wheel input can reach an unrelated window under the pointer.
                Check(element != null && element.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern) && ((ScrollPattern)pattern).Current.VerticallyScrollable, "computer_scroll_unavailable"); Dispatched = true;
                ((ScrollPattern)pattern).Scroll(ScrollAmount.NoAmount, text == "up" ? ScrollAmount.LargeDecrement : ScrollAmount.LargeIncrement);
            }
            else if (operation == "open") { Launch(text); }
            else if (operation == "key") {
                var focused = AutomationElement.FocusedElement; Check(focused != null && !focused.Current.IsPassword, "computer_edit_blocked");
                var focusedRect = focused.Current.BoundingRectangle; Check(!Masks.Exists(mask => mask.Contains((int)(focusedRect.X + focusedRect.Width / 2) - rect.Left, (int)(focusedRect.Y + focusedRect.Height / 2) - rect.Top)), "computer_edit_blocked");
                var keys = new Dictionary<string, ushort> { { "Tab", 9 }, { "Shift+Tab", 9 }, { "Enter", 13 }, { "Escape", 27 }, { "ArrowUp", 38 }, { "ArrowDown", 40 }, { "ArrowLeft", 37 }, { "ArrowRight", 39 }, { "PageUp", 33 }, { "PageDown", 34 }, { "Ctrl+f", 70 }, { "Ctrl+l", 76 }, { "Ctrl+a", 65 } }; Check(keys.ContainsKey(text), "computer_key_blocked"); Key(keys[text], text == "Shift+Tab", text.StartsWith("Ctrl+"));
            } else throw new Exception("invalid_request");
            Console.WriteLine(Json.Serialize(new { outcome = "verified", reason = "input_completed" })); return 0;
        } catch (Exception error) { string code = error.Message.StartsWith("computer_") || error.Message == "secure_desktop" ? error.Message : "computer_provider_unavailable"; Console.WriteLine(Json.Serialize(new { outcome = Dispatched ? "unknown" : "blocked", reason = code })); return 1; }
    }
}
