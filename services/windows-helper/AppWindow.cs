using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

// Callers retain their own app identity, consent, desktop and cancellation checks.
static class AppWindow {
    delegate bool WindowCallback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    static bool Candidate(IntPtr window, Func<IntPtr, bool> allowed) {
        return window != IntPtr.Zero && IsWindowVisible(window) && GetWindow(window, 4) == IntPtr.Zero && allowed(window);
    }
    static IntPtr Find(Func<IntPtr, bool> allowed, IntPtr preferred) {
        if (preferred != IntPtr.Zero) {
            IntPtr foreground = GetForegroundWindow();
            if (Candidate(foreground, allowed)) return foreground;
            if (GetAncestor(preferred, 2) == preferred && Candidate(preferred, allowed)) return preferred;
        }
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, data) => {
            if (Candidate(hwnd, allowed)) { result = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        return result;
    }
    public static IntPtr Open(string executable, Func<IntPtr, bool> allowed, Action fence, Action dispatched, Func<IntPtr, bool> verified = null, IntPtr preferred = default(IntPtr)) {
        fence(); IntPtr window = Find(allowed, preferred);
        if (window == IntPtr.Zero) {
            dispatched();
            // Shell launch avoids inheriting the hidden worker's console startup flags.
            Process.Start(new ProcessStartInfo(executable) { UseShellExecute = true, WindowStyle = ProcessWindowStyle.Normal });
            for (int attempt = 0; attempt < 35 && window == IntPtr.Zero; attempt++) { fence(); Thread.Sleep(100); window = Find(allowed, preferred); }
        }
        if (window == IntPtr.Zero) throw new Exception("computer_launch_unverified");
        fence(); if (!allowed(window)) throw new Exception("computer_app_denied");
        if (IsIconic(window)) {
            dispatched(); ShowWindowAsync(window, 9);
            for (int attempt = 0; attempt < 20 && IsIconic(window); attempt++) { fence(); Thread.Sleep(50); }
        }
        fence(); if (!allowed(window)) throw new Exception("computer_app_denied");
        if (GetForegroundWindow() != window) {
            dispatched();
            if (!SetForegroundWindow(window)) {
                // The accessibility provider can activate a window for a background assistant.
                // Its result still needs the independent foreground check below.
                try { AutomationElement.FromHandle(window).SetFocus(); } catch {}
            }
        }
        for (int attempt = 0; attempt <= 10; attempt++) {
            fence();
            if (!IsIconic(window) && GetForegroundWindow() == window && (verified ?? allowed)(window)) {
                fence();
                if (GetForegroundWindow() == window) return window;
            }
            if (attempt < 10) Thread.Sleep(50);
        }
        throw new Exception("computer_focus_denied");
    }
}
