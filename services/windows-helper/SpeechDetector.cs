using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Speech.AudioFormat;
using System.Speech.Recognition;
using System.Threading;
using System.Web.Script.Serialization;

// Each process recognizes one fixed local phrase. It has no microphone or action API.
static class SpeechDetector {
    static readonly object Gate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static void Report(object value) { lock (Gate) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); } }
    sealed class Audio : Stream {
        readonly BlockingCollection<byte[]> queue = new BlockingCollection<byte[]>(32);
        byte[] current; int offset; long consumed; public long Consumed { get { return Interlocked.Read(ref consumed); } }
        public void Add(byte[] bytes) { if (!queue.TryAdd(bytes)) throw new IOException("audio_overrun"); }
        public void End() { queue.CompleteAdding(); }
        public override int Read(byte[] buffer, int start, int count) {
            // SAPI treats short reads as end-of-stream; satisfy each read until stdin closes.
            int copied = 0;
            while (copied < count) {
                if (current == null || offset == current.Length) { if (!queue.TryTake(out current, Timeout.Infinite)) break; offset = 0; }
                int length = Math.Min(count - copied, current.Length - offset); Buffer.BlockCopy(current, offset, buffer, start + copied, length); offset += length;
                copied += length; Interlocked.Add(ref consumed, length);
            }
            return copied;
        }
        public override bool CanRead { get { return true; } } public override bool CanSeek { get { return false; } } public override bool CanWrite { get { return false; } }
        public override long Length { get { return long.MaxValue; } } public override long Position { get { return Consumed; } set { throw new NotSupportedException(); } }
        public override void Flush() {} public override long Seek(long offset, SeekOrigin origin) { if (offset == 0 && origin == SeekOrigin.Current) return Consumed; throw new NotSupportedException(); }
        public override void SetLength(long length) { throw new NotSupportedException(); } public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }
    [MTAThread] static int Main(string[] args) {
        try {
            if (args.Length != 1 || (args[0] != "stop" && args[0] != "wake")) return 1;
            string role = args[0], phrase = role == "stop" ? "stop assistant" : "hey latham";
            RecognizerInfo info = null;
            foreach (var candidate in SpeechRecognitionEngine.InstalledRecognizers()) if (candidate.Culture.Name == "en-US") { info = candidate; break; }
            if (info == null) throw new Exception("recognizer_missing");
            using (var recognizer = new SpeechRecognitionEngine(info)) using (var audio = new Audio()) {
                var grammar = new GrammarBuilder(phrase); grammar.Culture = CultureInfo.GetCultureInfo("en-US");
                recognizer.LoadGrammar(new Grammar(grammar));
                recognizer.InitialSilenceTimeout = TimeSpan.Zero; recognizer.BabbleTimeout = TimeSpan.Zero;
                recognizer.EndSilenceTimeout = TimeSpan.FromMilliseconds(250); recognizer.EndSilenceTimeoutAmbiguous = TimeSpan.FromMilliseconds(400);
                recognizer.SpeechRecognized += (sender, e) => {
                    if (e.Result.Text == phrase && e.Result.Confidence >= (role == "stop" ? 0.55 : 0.75))
                        Report(new { kind = "match", role, confidence = e.Result.Confidence, audioEndMs = (e.Result.Audio.AudioPosition + e.Result.Audio.Duration).TotalMilliseconds });
                };
                recognizer.RecognizeCompleted += (sender, e) => { Report(new { kind = "failed", role }); Environment.Exit(1); };
                recognizer.SetInputToAudioStream(audio, new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
                recognizer.RecognizeAsync(RecognizeMode.Multiple);
                Report(new { kind = "ready", role, culture = "en-US" });
                using (var timer = new Timer(state => { try { Report(new { kind = "health", role, consumed = audio.Consumed, processedMs = recognizer.RecognizerAudioPosition.TotalMilliseconds }); } catch { Environment.Exit(1); } }, null, 500, 500)) {
                    var input = Console.OpenStandardInput(); var buffer = new byte[4096]; int count;
                    while ((count = input.Read(buffer, 0, buffer.Length)) > 0) { var bytes = new byte[count]; Buffer.BlockCopy(buffer, 0, bytes, 0, count); audio.Add(bytes); }
                    audio.End();
                }
            }
            return 0;
        } catch { Report(new { kind = "failed" }); return 1; }
    }
}
