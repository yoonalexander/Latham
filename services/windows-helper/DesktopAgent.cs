using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// The supervisor never calls UIA. All provider calls live in a disposable MTA process.
static class DesktopAgent {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32768 };
    static readonly object OutputLock = new object();
    static void Write(object value) { lock (OutputLock) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); } }
    static Dictionary<string, object> Read() {
        var line = new StringBuilder(); int c;
        while ((c = Console.Read()) != -1 && c != '\n') { if (line.Length >= 16384) throw new Exception("invalid_request"); line.Append((char)c); }
        if (c == -1 && line.Length == 0) return null;
        return Json.Deserialize<Dictionary<string, object>>(line.ToString());
    }
    static string S(Dictionary<string, object> value, string key) { object v; return value.TryGetValue(key, out v) ? v as string ?? "" : ""; }
    static object Reply(string id, string outcome, string reason) { return new { id, outcome, reason }; }
    static void Check(bool allowed, string reason) { if (!allowed) throw new Exception(reason); }
    [MTAThread] static int Main(string[] args) {
        try { Check(Native.SafeToken(Process.GetCurrentProcess().Handle), "elevated_helper_denied"); if (args.Length >= 3 && args[0] == "--worker") Worker(args); else Supervisor(args); return 0; }
        catch { return 1; }
    }

    static void Supervisor(string[] args) {
        Check(args.Length >= 1, "invalid_controller"); int controller = int.Parse(args[0]);
        bool testing = args.Length == 2 && args[1] == "--test";
        string eventName = "Local\\LathamDesktop-" + Guid.NewGuid().ToString("N");
        var acl = new EventWaitHandleSecurity(); acl.SetAccessRuleProtection(true, false);
        acl.AddAccessRule(new EventWaitHandleAccessRule(WindowsIdentity.GetCurrent().User, EventWaitHandleRights.FullControl, AccessControlType.Allow));
        bool created; var fence = new EventWaitHandle(false, EventResetMode.ManualReset, eventName, out created, acl);
        Process worker = null; int generation = 0; bool busy = false; string pendingId = null; var gate = new object();
        Action stop = () => { fence.Set(); if (worker != null) { try { if (!worker.HasExited) worker.Kill(); worker.WaitForExit(1500); } catch {} } };
        try {
            Dictionary<string, object> request;
            while ((request = Read()) != null) {
                string id = S(request, "id"), kind = S(request, "kind");
                if (id.Length > 64 || id.Length == 0) throw new Exception("invalid_request");
                if (kind == "stop") {
                    lock (gate) { generation++; stop(); busy = false; pendingId = null; }
                    Write(Reply(id, worker == null || worker.HasExited ? "verified" : "unknown", "fence")); continue;
                }
                lock (gate) {
                    if (busy) { Write(Reply(id, "blocked", "native_busy")); continue; }
                    if (worker == null || worker.HasExited) {
                        fence.Reset();
                        var start = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,
                            "--worker " + Process.GetCurrentProcess().Id + " " + eventName + " " + controller + (testing ? " --test" : ""));
                        start.UseShellExecute = false; start.CreateNoWindow = true; start.RedirectStandardInput = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
                        worker = Process.Start(start); Native.AllowSetForegroundWindow(worker.Id); int captured = generation; Process current = worker;
                        Task.Run(() => {
                            try {
                                string line;
                                while ((line = current.StandardOutput.ReadLine()) != null) {
                                    Check(line.Length <= 32768, "invalid_reply"); var reply = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(line);
                                    lock (gate) { if (captured != generation) return; if (S(reply, "id") == pendingId) { busy = false; pendingId = null; } Write(reply); }
                                }
                            } catch {}
                            lock (gate) { if (captured != generation) return; if (pendingId != null) Write(Reply(pendingId, "unknown", "worker_lost")); busy = false; pendingId = null; Write(new { eventKind = "invalidated", reason = "worker_lost" }); }
                        });
                    }
                    busy = true; pendingId = id; Native.AllowSetForegroundWindow(worker.Id);
                    worker.StandardInput.WriteLine(Json.Serialize(request)); worker.StandardInput.Flush();
                }
            }
        } finally { stop(); fence.Dispose(); }
    }

    sealed class WindowRef { public IntPtr Hwnd; public int Pid; public long Start; public string App, Title; }
    sealed class Binding {
        public WindowRef Window; public IntPtr Field; public AutomationElement Element, PlainMode;
        public string Runtime, Title, Expected, Before, After, Mode; public long Revision;
    }
    static EventWaitHandle Cancel;
    static Binding Bound;
    static readonly Dictionary<string, WindowRef> Windows = new Dictionary<string, WindowRef>();
    static long Changes;
    static IntPtr TargetRoot, TargetField, Desk;
    static bool Editing;
    static AutomationElement PlainMode;
    static Native.WinEventProc HookCallback;
    static void Fence() { Check(!Cancel.WaitOne(0), "cancelled"); }
    static void Worker(string[] args) {
        int parent = int.Parse(args[1]); Cancel = EventWaitHandle.OpenExisting(args[2]);
        int controller = int.Parse(args[3]); bool testing = args.Length == 5 && args[4] == "--test";
        var watchdog = new Thread(() => { try { Process.GetProcessById(parent).WaitForExit(); } catch {} Cancel.Set(); Environment.Exit(1); }); watchdog.IsBackground = true; watchdog.Start();
        StartEvents();
        Dictionary<string, object> request;
        while ((request = Read()) != null) {
            string id = S(request, "id"), kind = S(request, "kind"); bool dispatched = false;
            try {
                Fence();
                int deskPid; Desk = new IntPtr(Convert.ToInt64(request["desk"])); Native.GetWindowThreadProcessId(Desk, out deskPid);
                Check(deskPid == controller, "invalid_controller");
                string app = S(request, "app"); Check(app == "notepad" || (testing && app == "fixture"), "app_denied");
                if (kind == "open") {
                    Check(app == "notepad", "app_denied");
                    AppWindow.Open(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32\\notepad.exe"),
                        window => { try { Identify(window, app, testing); return true; } catch { return false; } }, Fence, () => { dispatched = true; });
                    Write(Reply(id, "verified", "app_window_verified")); continue;
                }
                if (kind == "scan") {
                    Bound = null; TargetRoot = TargetField = IntPtr.Zero; Windows.Clear(); var list = new List<object>();
                    Native.EnumWindows((hwnd, data) => {
                        if (!Native.IsWindowVisible(hwnd) || Native.GetWindow(hwnd, 4) != IntPtr.Zero || list.Count >= 12) return true;
                        try { var scope = Identify(hwnd, app, testing); string key = Guid.NewGuid().ToString("N"); Windows.Add(key, scope); string name = (list.Count + 1) + ". " + scope.Title; list.Add(new { id = key, name = name.Substring(0, Math.Min(80, name.Length)) }); } catch {}
                        return true;
                    }, IntPtr.Zero);
                    Write(new { id, outcome = "verified", reason = "windows", windows = list }); continue;
                }
                if (kind == "prepare") {
                    Bound = null; WindowRef scope; Check(Windows.TryGetValue(S(request, "windowId"), out scope) && scope.App == app, "stale_window"); ValidateWindow(scope, testing);
                    TargetRoot = scope.Hwnd; Fence(); dispatched = true; Native.ShowWindow(scope.Hwnd, 9); Fence(); Native.SetForegroundWindow(scope.Hwnd);
                    var root = AutomationElement.FromHandle(scope.Hwnd); var fields = new List<AutomationElement>(); int visited = 0; PlainMode = null;
                    FindFields(root, app, fields, ref visited, 0);
                    Check(app != "notepad" || PlainMode != null, "plain_text_required");
                    Check(fields.Count == 1, fields.Count == 0 ? "unsupported_editor" : "ambiguous_editor"); var element = fields[0];
                    IntPtr field = new IntPtr(element.Current.NativeWindowHandle); Check(field != IntPtr.Zero, "unsupported_editor");
                    Fence(); dispatched = true; element.SetFocus(); Thread.Sleep(120); Check(Native.GetForegroundWindow() == scope.Hwnd, "focus_denied");
                    TargetField = field;
                    Bound = new Binding { Window = scope, Field = field, Element = element, PlainMode = PlainMode, Runtime = Runtime(element), Title = Native.Title(scope.Hwnd), Expected = Value(element), Revision = Interlocked.Read(ref Changes) };
                    Validate(testing); Write(Reply(id, "verified", "bound")); continue;
                }
                Validate(testing);
                if (kind == "inspect") { Write(Reply(id, "verified", "bound")); continue; }
                if (kind == "unbind") { Bound = null; Write(Reply(id, "verified", "unbound")); continue; }
                if (kind == "focus") { Fence(); dispatched = true; Native.SetForegroundWindow(Bound.Window.Hwnd); Check(Native.GetForegroundWindow() == Bound.Window.Hwnd, "focus_denied"); Fence(); Bound.Element.SetFocus(); Thread.Sleep(100); Bound.Revision = Interlocked.Read(ref Changes); Validate(testing); Write(Reply(id, "verified", "focused")); continue; }
                Check(kind == "edit" || kind == "undo", "unsupported_native_command");
                string next, mode = S(request, "mode"), text = S(request, "text"), before = Bound.Expected;
                if (kind == "undo") { Check(Bound.After != null && Bound.Expected == Bound.After, "undo_unavailable"); next = Bound.Before; }
                else {
                    Check(text.Length > 0 && text.Length <= 1000 && (mode == "append" || mode == "replace" || mode == "correct"), "invalid_request");
                    if (mode == "correct") { Check(Bound.After != null && Bound.Expected == Bound.After, "undo_unavailable"); mode = Bound.Mode; before = Bound.Before; }
                    next = mode == "replace" ? text : before + (before.Length > 0 && !char.IsWhiteSpace(before[before.Length - 1]) ? " " : "") + text;
                }
                Check(next.Length <= 20000, "text_too_long"); Validate(testing); Fence();
                Editing = true; dispatched = true;
                try { SetValue(Bound.Element, Bound.Field, next); Thread.Sleep(150); Check(Value(Bound.Element) == next, "verification_failed"); }
                finally { Editing = false; }
                Bound.Expected = next; Bound.Title = Native.Title(Bound.Window.Hwnd); Bound.Window.Title = Bound.Title; Bound.Revision = Interlocked.Read(ref Changes);
                Validate(testing);
                if (kind == "undo") { Bound.Before = Bound.After = Bound.Mode = null; }
                else { Bound.Before = before; Bound.After = next; Bound.Mode = mode; }
                Write(Reply(id, "verified", "edit_verified"));
            } catch (Exception error) {
                Bound = null; string reason = error.Message; if (reason.Length > 60 || reason.Contains(" ")) reason = "unsupported_editor";
                Write(Reply(id, dispatched ? "unknown" : "blocked", reason));
            }
        }
    }
    static WindowRef Identify(IntPtr hwnd, string app, bool testing) {
        int pid; Native.GetWindowThreadProcessId(hwnd, out pid); var process = Process.GetProcessById(pid);
        Check(process.SessionId == Process.GetCurrentProcess().SessionId, "session_denied");
        string path = process.MainModule.FileName;
        bool allowed = false;
        if (app == "notepad") {
            string system = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32\\notepad.exe");
            string packages = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WindowsApps") + "\\Microsoft.WindowsNotepad_";
            allowed = string.Equals(path, system, StringComparison.OrdinalIgnoreCase) || (path.StartsWith(packages, StringComparison.OrdinalIgnoreCase) && path.EndsWith("_x64__8wekyb3d8bbwe\\Notepad\\Notepad.exe", StringComparison.OrdinalIgnoreCase));
            allowed = allowed && Native.Class(hwnd) == "Notepad";
        } else if (testing && app == "fixture") allowed = string.Equals(path, Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Latham.NativeFixture.exe"), StringComparison.OrdinalIgnoreCase);
        Check(allowed, "app_denied"); Check(Native.SafeToken(process.Handle), "elevated_or_other_user");
        return new WindowRef { Hwnd = hwnd, Pid = pid, Start = process.StartTime.ToUniversalTime().Ticks, App = app, Title = Native.Title(hwnd) };
    }
    static void ValidateWindow(WindowRef scope, bool testing) {
        Check(Native.IsWindow(scope.Hwnd) && Native.IsWindowVisible(scope.Hwnd), "stale_window");
        var current = Identify(scope.Hwnd, scope.App, testing); Check(current.Pid == scope.Pid && current.Start == scope.Start && current.Title == scope.Title, "stale_window");
        Check(Native.DefaultDesktop(), "secure_desktop");
    }
    static string Runtime(AutomationElement element) { return string.Join("-", element.GetRuntimeId()); }
    static bool Editor(AutomationElement element, string app) {
        var current = element.Current;
        if (!current.IsEnabled || current.IsOffscreen || current.IsPassword || current.NativeWindowHandle == 0 || (current.ControlType != ControlType.Edit && current.ControlType != ControlType.Document)) return false;
        string cls = Native.Class(new IntPtr(current.NativeWindowHandle));
        return app == "notepad" ? cls == "RichEditD2DPT" || cls == "Edit" : current.AutomationId == "Draft";
    }
    static void FindFields(AutomationElement element, string app, List<AutomationElement> fields, ref int visited, int depth) {
        Fence(); Check(++visited <= 180 && depth <= 15, "tree_limit");
        if (app == "notepad" && element.Current.ControlType == ControlType.Text && element.Current.AutomationId == "ContentTextBlock" && element.Current.Name == "Plain text") PlainMode = element;
        if (Editor(element, app)) { fields.Add(element); return; }
        var child = TreeWalker.ControlViewWalker.GetFirstChild(element);
        while (child != null) { FindFields(child, app, fields, ref visited, depth + 1); child = TreeWalker.ControlViewWalker.GetNextSibling(child); }
    }
    static string Value(AutomationElement element) {
        Check(!element.Current.IsPassword, "secure_field"); object pattern; string value;
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) { var p = (ValuePattern)pattern; Check(!p.Current.IsReadOnly, "read_only"); value = p.Current.Value; }
        else { Check(element.TryGetCurrentPattern(TextPattern.Pattern, out pattern), "unsupported_editor"); value = ((TextPattern)pattern).DocumentRange.GetText(20001).TrimEnd('\r'); }
        Check(value.Length <= 20000, "text_too_long"); return value;
    }
    static void SetValue(AutomationElement element, IntPtr hwnd, string value) {
        object pattern;
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) { Check(!((ValuePattern)pattern).Current.IsReadOnly, "read_only"); Fence(); ((ValuePattern)pattern).SetValue(value); }
        else {
            // Reviewed Notepad RichEdit only: target its exact HWND, never the global keyboard/clipboard.
            Check(Native.Class(hwnd) == "RichEditD2DPT" && (Native.GetWindowLong(hwnd, -16) & 0x800) == 0, "unsupported_editor");
            Fence(); IntPtr result; Check(Native.SendMessageTimeout(hwnd, 0x000C, IntPtr.Zero, value, 0x0002, 2000, out result) != IntPtr.Zero && result != IntPtr.Zero, "verification_failed");
        }
    }
    static void Validate(bool testing) {
        Fence(); Check(Bound != null, "dictation_suspended"); ValidateWindow(Bound.Window, testing);
        Check(Bound.Window.App != "notepad" || (Bound.PlainMode != null && Bound.PlainMode.Current.Name == "Plain text"), "plain_text_required");
        Check(Native.GetForegroundWindow() == Bound.Window.Hwnd || Native.GetForegroundWindow() == Desk, "focus_changed");
        Check(Native.IsWindow(Bound.Field) && Native.IsChild(Bound.Window.Hwnd, Bound.Field) && Editor(Bound.Element, Bound.Window.App), "stale_control");
        int pid; uint thread = Native.GetWindowThreadProcessId(Bound.Field, out pid); Check(pid == Bound.Window.Pid, "stale_control");
        var info = new Native.GUIINFO(); info.cbSize = Marshal.SizeOf(info); Check(Native.GetGUIThreadInfo(thread, ref info) && info.hwndFocus == Bound.Field, "focus_changed");
        Check(Runtime(Bound.Element) == Bound.Runtime && Native.Title(Bound.Window.Hwnd) == Bound.Title, "document_changed");
        Check(Interlocked.Read(ref Changes) == Bound.Revision && Value(Bound.Element) == Bound.Expected, "user_edit");
    }
    static void StartEvents() {
        var ready = new ManualResetEvent(false);
        var thread = new Thread(() => {
            HookCallback = (hook, evt, hwnd, obj, child, tid, time) => {
                if (TargetRoot == IntPtr.Zero) return;
                if ((evt == 3 && hwnd != TargetRoot && hwnd != Desk) || (evt == 0x8005 && hwnd != TargetField && Native.IsChild(TargetRoot, hwnd)) || ((evt == 0x8001 || (!Editing && (evt == 0x800E || evt == 0x800C))) && (hwnd == TargetField || hwnd == TargetRoot))) {
                    Interlocked.Increment(ref Changes);
                    if (Bound != null) { Bound = null; Write(new { eventKind = "invalidated", reason = "focus_or_edit_changed" }); }
                }
            };
            Native.SetWinEventHook(3, 3, IntPtr.Zero, HookCallback, 0, 0, 0);
            Native.SetWinEventHook(0x8001, 0x800E, IntPtr.Zero, HookCallback, 0, 0, 0);
            ready.Set(); Native.MSG message; while (Native.GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { Native.TranslateMessage(ref message); Native.DispatchMessage(ref message); }
        }); thread.IsBackground = true; thread.SetApartmentState(ApartmentState.MTA); thread.Start(); ready.WaitOne();
    }
}

static class Native {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
    public delegate void WinEventProc(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int process);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wparam, string value, uint flags, uint timeout, out IntPtr result);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct GUIINFO { public int cbSize, flags; public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret; public RECT rcCaret; }
    [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread, ref GUIINFO info);
    [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] public static extern int GetMessage(out MSG message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")] public static extern IntPtr DispatchMessage(ref MSG message);
    public static string Class(IntPtr hwnd) { var s = new StringBuilder(256); GetClassName(hwnd, s, s.Capacity); return s.ToString(); }
    public static string Title(IntPtr hwnd) { var s = new StringBuilder(512); GetWindowText(hwnd, s, s.Capacity); return s.ToString(); }
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, StringBuilder info, int count, out int needed);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    public static bool DefaultDesktop() { var d = OpenInputDesktop(0, false, 1); if (d == IntPtr.Zero) return false; try { var s = new StringBuilder(256); int needed; return GetUserObjectInformation(d, 2, s, 512, out needed) && s.ToString() == "Default"; } finally { CloseDesktop(d); } }
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr buffer, int size, out int needed);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static bool SafeToken(IntPtr process) {
        IntPtr token; if (!OpenProcessToken(process, 8, out token)) return false;
        try {
            using (var identity = new WindowsIdentity(token)) if (identity.User != WindowsIdentity.GetCurrent().User) return false;
            int needed; GetTokenInformation(token, 25, IntPtr.Zero, 0, out needed); IntPtr data = Marshal.AllocHGlobal(needed);
            try { if (!GetTokenInformation(token, 25, data, needed, out needed)) return false; var sid = new SecurityIdentifier(Marshal.ReadIntPtr(data)); string[] parts = sid.Value.Split('-'); return int.Parse(parts[parts.Length - 1]) <= 8192; } finally { Marshal.FreeHGlobal(data); }
        } finally { CloseHandle(token); }
    }
}
