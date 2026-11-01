using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// A framing relay only. It has no shell, UI automation, browser, or provider-key APIs.
internal static class NativeHost {
    const int Limit = 65536;
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ProcessEntry {
        public uint Size, Usage, Id;
        public UIntPtr Heap;
        public uint Module, Threads, Parent;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Exe;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint id);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static bool MatchingBrowser(string browser) {
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) return false;
        try {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
            uint current = (uint)Process.GetCurrentProcess().Id;
            var entries = new Dictionary<uint, ProcessEntry>();
            if (!Process32FirstW(snapshot, ref entry)) return false;
            do { entries[entry.Id] = entry; } while (Process32NextW(snapshot, ref entry));
            if (!entries.ContainsKey(current) || !entries.ContainsKey(entries[current].Parent)) return false;
            var parentEntry = entries[entries[current].Parent];
            // Chromium can use one Windows cmd.exe intermediary. Never accept an arbitrary shell chain.
            if (String.Equals(parentEntry.Exe, "cmd.exe", StringComparison.OrdinalIgnoreCase)) {
                using (var shell = Process.GetProcessById((int)parentEntry.Id)) {
                    string shellPath = shell.MainModule.FileName;
                    string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                    if (!String.Equals(shellPath, Path.Combine(windows, "System32", "cmd.exe"), StringComparison.OrdinalIgnoreCase) && !String.Equals(shellPath, Path.Combine(windows, "SysWOW64", "cmd.exe"), StringComparison.OrdinalIgnoreCase)) return false;
                }
                if (!entries.ContainsKey(parentEntry.Parent)) return false;
                parentEntry = entries[parentEntry.Parent];
            }
            using (var parent = Process.GetProcessById((int)parentEntry.Id)) {
                string name = Path.GetFileName(parent.MainModule.FileName).ToLowerInvariant();
                return browser == "edge" ? name == "msedge.exe" : browser == "chrome" && (name == "chrome.exe" || name == "latham-test-browser.exe");
            }
        } finally { CloseHandle(snapshot); }
    }
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = Limit };
    static byte[] Read(Stream stream) {
        byte[] prefix = new byte[4]; Exact(stream, prefix); int size = BitConverter.ToInt32(prefix, 0);
        if (size <= 0 || size > Limit) throw new InvalidDataException();
        byte[] body = new byte[size]; Exact(stream, body); return body;
    }
    static void Exact(Stream stream, byte[] bytes) { int offset = 0; while (offset < bytes.Length) { int count = stream.Read(bytes, offset, bytes.Length - offset); if (count == 0) throw new EndOfStreamException(); offset += count; } }
    static void Write(Stream stream, byte[] bytes) { if (bytes.Length > Limit) throw new InvalidDataException(); byte[] prefix = BitConverter.GetBytes(bytes.Length); stream.Write(prefix, 0, 4); stream.Write(bytes, 0, bytes.Length); stream.Flush(); }
    static int Main(string[] args) {
        try {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            var config = Json.Deserialize<System.Collections.Generic.Dictionary<string, string>>(File.ReadAllText(Path.Combine(directory, "connection.json")));
            if (args.Length < 1 || args[0] != config["origin"] || !config["pipe"].StartsWith("latham-") || !MatchingBrowser(config["browser"])) return 2;
            using (var pipe = new NamedPipeClientStream(".", config["pipe"], PipeDirection.InOut, PipeOptions.Asynchronous, System.Security.Principal.TokenImpersonationLevel.Identification)) {
                pipe.Connect(3000);
                Write(pipe, Encoding.UTF8.GetBytes(Json.Serialize(new { type = "hello", protocol = 3, browser = config["browser"], token = config["token"], origin = args[0] })));
                var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
                var reader = new Thread(() => { try { while (true) Write(pipe, Read(input)); } catch { Environment.Exit(0); } }); reader.IsBackground = true; reader.Start();
                while (true) Write(output, Read(pipe));
            }
        } catch { return 1; }
    }
}
