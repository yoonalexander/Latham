using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// A framing relay only. It has no shell, UI automation, browser, or provider-key APIs.
internal static class NativeHost {
    const int Limit = 65536;
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
            if (args.Length < 1 || args[0] != config["origin"] || !config["pipe"].StartsWith("latham-")) return 2;
            using (var pipe = new NamedPipeClientStream(".", config["pipe"], PipeDirection.InOut, PipeOptions.Asynchronous, System.Security.Principal.TokenImpersonationLevel.Identification)) {
                pipe.Connect(3000);
                Write(pipe, Encoding.UTF8.GetBytes(Json.Serialize(new { type = "hello", token = config["token"], origin = args[0] })));
                var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
                var reader = new Thread(() => { try { while (true) Write(pipe, Read(input)); } catch { Environment.Exit(0); } }); reader.IsBackground = true; reader.Start();
                while (true) Write(output, Read(pipe));
            }
        } catch { return 1; }
    }
}
