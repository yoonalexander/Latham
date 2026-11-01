using System;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

// One bounded image per disposable process; no screen, file path or network API.
static class ImageOcr {
    [MTAThread] static int Main() {
        try { Run(); return 0; }
        catch { Console.WriteLine("{\"error\":\"local_ocr_unavailable\"}"); return 1; }
    }
    static T Result<T>(Windows.Foundation.IAsyncOperation<T> operation) {
        while (operation.Status == Windows.Foundation.AsyncStatus.Started) Thread.Sleep(10);
        return operation.GetResults();
    }
    static void Run() {
        var input = new byte[12289]; int count = 0, read;
        while ((read = Console.OpenStandardInput().Read(input, count, input.Length - count)) > 0) { count += read; if (count == input.Length) throw new Exception(); }
        if (count < 100) throw new Exception();
        var bytes = new byte[count]; System.Buffer.BlockCopy(input, 0, bytes, 0, count);
        using (var stream = new InMemoryRandomAccessStream()) {
            var writer = new DataWriter(stream); writer.WriteBytes(bytes); Result<uint>(writer.StoreAsync()); writer.DetachStream(); writer.Dispose(); stream.Seek(0);
            var decoder = Result<BitmapDecoder>(BitmapDecoder.CreateAsync(stream));
            if (decoder.PixelWidth > 512 || decoder.PixelHeight > 512 || decoder.PixelWidth < 16 || decoder.PixelHeight < 16) throw new Exception();
            var transform = new BitmapTransform { ScaledWidth = decoder.PixelWidth * 2, ScaledHeight = decoder.PixelHeight * 2 };
            using (var bitmap = Result<SoftwareBitmap>(decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, transform, ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage))) {
                var engine = OcrEngine.TryCreateFromLanguage(new Language("en-US")); if (engine == null) throw new Exception();
                var result = Result<OcrResult>(engine.RecognizeAsync(bitmap)); string text = result.Text; if (text.Length > 2000) text = text.Substring(0, 2000);
                Console.WriteLine(new JavaScriptSerializer().Serialize(new { text }));
            }
        }
    }
}
