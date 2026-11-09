using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Reports only Ctrl gesture state, never key codes, characters or mouse positions.
static class ControlKey {
    delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int kind, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
    [StructLayout(LayoutKind.Sequential)] struct Key { public uint Code, Scan, Flags, Time; public UIntPtr Extra; }
    static readonly Hook KeyboardCallback = Keyboard, MouseCallback = Mouse;
    static readonly object Gate = new object();
    static IntPtr keyboard, mouse;
    static bool left, right, cancelled;
    static void Report(string kind) { lock (Gate) { Console.WriteLine("{\"kind\":\"" + kind + "\"}"); Console.Out.Flush(); } }
    static bool IsCtrl(int key) { return key == 0x11 || key == 0xA2 || key == 0xA3; }
    static bool OtherPressed() {
        for (int key = 1; key < 256; key++) if (!IsCtrl(key) && GetAsyncKeyState(key) < 0) return true;
        return false;
    }
    static void Cancel() { if ((left || right) && !cancelled) { cancelled = true; Report("cancel"); } }
    static IntPtr Keyboard(int code, IntPtr message, IntPtr data) {
        if (code >= 0) {
            var key = (Key)Marshal.PtrToStructure(data, typeof(Key));
            int kind = message.ToInt32(); bool down = kind == 0x100 || kind == 0x104, up = kind == 0x101 || kind == 0x105;
            // Injected input cannot open capture; it can still invalidate a chord.
            if ((key.Flags & 0x10) != 0) { if (down) Cancel(); }
            else if (IsCtrl((int)key.Code) && (down || up)) {
                bool wasDown = left || right;
                if (key.Code == 0xA3 || (key.Code == 0x11 && (key.Flags & 1) != 0)) right = down; else left = down;
                if (!wasDown && (left || right)) { cancelled = OtherPressed(); if (!cancelled) Report("down"); }
                else if (wasDown && !left && !right) { Report(cancelled ? "cancel" : "up"); cancelled = false; }
            } else if (down) Cancel();
        }
        return CallNextHookEx(keyboard, code, message, data);
    }
    static IntPtr Mouse(int code, IntPtr message, IntPtr data) {
        int kind = message.ToInt32();
        if (code >= 0 && (kind == 0x201 || kind == 0x204 || kind == 0x207 || kind == 0x20B || kind == 0x20A || kind == 0x20E)) Cancel();
        return CallNextHookEx(mouse, code, message, data);
    }
    [STAThread] static int Main() {
        try {
            // Starting with Ctrl held never activates capture. Require a fresh press.
            left = GetAsyncKeyState(0xA2) < 0; right = GetAsyncKeyState(0xA3) < 0; cancelled = left || right;
            IntPtr module = GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName);
            keyboard = SetWindowsHookEx(13, KeyboardCallback, module, 0);
            mouse = SetWindowsHookEx(14, MouseCallback, module, 0);
            if (keyboard == IntPtr.Zero || mouse == IntPtr.Zero) throw new Exception();
            var input = new Thread(() => { Console.OpenStandardInput().ReadByte(); Environment.Exit(0); }); input.IsBackground = true; input.Start();
            using (var timer = new System.Windows.Forms.Timer()) {
                timer.Interval = 250;
                timer.Tick += (sender, e) => {
                    // A missed release or desktop switch cancels rather than submits.
                    if ((left || right) && GetAsyncKeyState(0xA2) >= 0 && GetAsyncKeyState(0xA3) >= 0) { Cancel(); left = right = false; }
                    Report("health");
                };
                timer.Start(); Report("ready"); Application.Run();
            }
            return 0;
        } catch { Report("failed"); return 1; }
        finally { if (keyboard != IntPtr.Zero) UnhookWindowsHookEx(keyboard); if (mouse != IntPtr.Zero) UnhookWindowsHookEx(mouse); }
    }
}
