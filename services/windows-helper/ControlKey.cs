using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// Reports only mouse chord state, never key codes, characters or mouse positions.
static class ControlKey {
    delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int kind, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
    static readonly Hook KeyboardCallback = Keyboard, MouseCallback = Mouse;
    static readonly object Gate = new object();
    static IntPtr keyboard, mouse;
    static readonly MouseChord Chord = new MouseChord(Report);
    static void Report(string kind) { lock (Gate) { Console.WriteLine("{\"kind\":\"" + kind + "\"}"); Console.Out.Flush(); } }

    static int ButtonsDown() {
        return (GetAsyncKeyState(0x01) < 0 ? 1 : 0) + (GetAsyncKeyState(0x02) < 0 ? 1 : 0);
    }
    static bool OtherPressed() {
        for (int key = 3; key < 256; key++) {
            if (GetAsyncKeyState(key) < 0) return true;
        }
        return false;
    }
    static IntPtr Keyboard(int code, IntPtr message, IntPtr data) {
        int kind = message.ToInt32();
        if (code == 0 && (kind == 0x100 || kind == 0x104)) Chord.Cancel();
        return CallNextHookEx(keyboard, code, message, data);
    }
    static IntPtr Mouse(int code, IntPtr message, IntPtr data) {
        if (code == 0) {
            switch (message.ToInt32()) {
                case 0x0201: MouseButton(1, true, data); break;   // WM_LBUTTONDOWN
                case 0x0202: MouseButton(1, false, data); break;  // WM_LBUTTONUP
                case 0x0204: MouseButton(2, true, data); break;   // WM_RBUTTONDOWN
                case 0x0205: MouseButton(2, false, data); break;  // WM_RBUTTONUP
                case 0x0207: // WM_MBUTTONDOWN
                case 0x020B: // WM_XBUTTONDOWN
                case 0x020A: // WM_MOUSEWHEEL
                case 0x020E: // WM_MOUSEHWHEEL
                    Chord.Cancel();
                    break;
            }
        }
        return CallNextHookEx(mouse, code, message, data);
    }
    static void MouseButton(int button, bool down, IntPtr data) {
        // MSLLHOOKSTRUCT.flags follows POINT (8 bytes) and mouseData (4 bytes).
        // Read only the flags. Injected presses and releases cannot start or submit a turn.
        bool injected = (Marshal.ReadInt32(data, 12) & 0x03) != 0;
        Chord.Button(button, down, injected, OtherPressed);
    }
    [STAThread] static int Main() {
        try {
            // Require a fresh press if either mouse button is already down at startup.
            Chord.Reconcile(ButtonsDown());
            IntPtr module = GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName);
            keyboard = SetWindowsHookEx(13, KeyboardCallback, module, 0);
            mouse = SetWindowsHookEx(14, MouseCallback, module, 0);
            if (keyboard == IntPtr.Zero || mouse == IntPtr.Zero) throw new Exception();
            var input = new Thread(() => { Console.OpenStandardInput().ReadByte(); Environment.Exit(0); }); input.IsBackground = true; input.Start();
            using (var timer = new System.Windows.Forms.Timer()) {
                timer.Interval = 250;
                timer.Tick += (sender, e) => {
                    // A missed release or desktop switch cancels rather than submits.
                    Chord.Reconcile(ButtonsDown());
                    Report("health");
                };
                timer.Start(); Report("ready"); Application.Run();
            }
            return 0;
        } catch { Report("failed"); return 1; }
        finally { if (keyboard != IntPtr.Zero) UnhookWindowsHookEx(keyboard); if (mouse != IntPtr.Zero) UnhookWindowsHookEx(mouse); }
    }
}

sealed class MouseChord {
    const int BothButtons = 3;
    readonly Action<string> report;
    int held;
    bool active, waitForRelease;

    public MouseChord(Action<string> report) { this.report = report; }

    public void Button(int button, bool down, bool injected, Func<bool> otherPressed) {
        if (injected) {
            Reset();
            return;
        }
        if (waitForRelease) return;

        int previous = held;
        held = down ? held | button : held & ~button;
        if (held == previous) return;
        if (active) {
            active = false;
            report("up");
        } else if (held == BothButtons && !otherPressed()) {
            active = true;
            report("down");
        }
    }

    public void Cancel() {
        if (!active) return;
        active = false;
        report("cancel");
    }

    public void Reconcile(int buttonsDown) {
        // The count works with either Windows primary-button setting.
        int expected = held == BothButtons ? 2 : held == 0 ? 0 : 1;
        if (buttonsDown != expected) Reset();
        if (buttonsDown == 0) waitForRelease = false;
    }

    void Reset() {
        Cancel();
        held = 0;
        waitForRelease = true;
    }
}
