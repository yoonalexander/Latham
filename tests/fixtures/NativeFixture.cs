using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

sealed class NativeFixture : Form {
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
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
                    else if (kind == "focus") { Activate(); draft.Focus(); }
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
    TextBox MakeDraft() {
        var field = new TextBox { Name = "Draft", AccessibleName = "Draft", Multiline = false, Left = 30, Top = 50, Width = 600, Text = "" };
        field.TextChanged += (s, e) => {
            Report("changed");
            if (blockAfterEdit > 0) { int delay = blockAfterEdit; blockAfterEdit = 0; Thread.Sleep(delay); }
            if (reactive) { reactive = false; var timer = new System.Windows.Forms.Timer { Interval = 50 }; timer.Tick += (a, b) => { timer.Stop(); field.Text = "PAGE_CHANGED_LATER"; timer.Dispose(); }; timer.Start(); }
        }; return field;
    }
    void Report(string kind) { using (var graphics = CreateGraphics()) lock (json) { Console.WriteLine(json.Serialize(new { kind, hwnd = Handle.ToInt64(), foreground = GetForegroundWindow().ToInt64(), text = draft.Text, dpi = graphics.DpiX, screens = Screen.AllScreens.Length, x = Left, y = Top })); Console.Out.Flush(); } }
    [STAThread] static void Main() { Application.EnableVisualStyles(); Application.Run(new NativeFixture()); }
}
