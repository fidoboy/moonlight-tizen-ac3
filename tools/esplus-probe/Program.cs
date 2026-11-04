using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Tizen.Applications;
using Tizen.NUI;
using Tizen.NUI.BaseComponents;

namespace MoonlightEsplusProbe
{
    internal static class Native
    {
        internal const int RTLD_NOW = 2;
        internal const int O_RDONLY = 0;
        internal const int O_NONBLOCK = 0x800;

        [DllImport("libdl.so.2", EntryPoint = "dlopen", CharSet = CharSet.Ansi)]
        internal static extern IntPtr Dlopen(string fileName, int flags);

        [DllImport("libdl.so.2", EntryPoint = "dlsym", CharSet = CharSet.Ansi)]
        internal static extern IntPtr Dlsym(IntPtr handle, string symbol);

        [DllImport("libdl.so.2", EntryPoint = "dlerror")]
        internal static extern IntPtr Dlerror();

        [DllImport("libc", EntryPoint = "open", CharSet = CharSet.Ansi, SetLastError = true)]
        internal static extern int Open(string path, int flags);

        [DllImport("libc", EntryPoint = "close", SetLastError = true)]
        internal static extern int Close(int fd);
    }

    internal sealed class ProbeApp : NUIApplication
    {
        private static readonly string[] RequiredSymbols = {
            "esplusplayer_create",
            "esplusplayer_open",
            "esplusplayer_close",
            "esplusplayer_prepare_async",
            "esplusplayer_start",
            "esplusplayer_stop",
            "esplusplayer_add_video_stream_info",
            "esplusplayer_add_audio_stream_info",
            "esplusplayer_submit_packet",
            "esplusplayer_set_ecore_display"
        };

        private static readonly object OutputLock = new object();
        private static readonly StringBuilder Output = new StringBuilder();
        private static SynchronizationContext UiContext;
        private static TextLabel OutputLabel;
        private const int MaxOutputCharacters = 30000;

        private static void Log(string message)
        {
            string line = "[MLPROBE] " + message;
            try { Tizen.Log.Info("MLPROBE", message); } catch { }
            try { Console.WriteLine(line); } catch { }

            string snapshot;
            lock (OutputLock)
            {
                Output.AppendLine(message);
                if (Output.Length > MaxOutputCharacters)
                {
                    Output.Remove(0, Output.Length - MaxOutputCharacters);
                    int firstNewline = Output.ToString().IndexOf('\n');
                    if (firstNewline >= 0) Output.Remove(0, firstNewline + 1);
                }
                snapshot = Output.ToString();
            }

            // NUI views must only be changed on the application thread.
            SynchronizationContext context = UiContext;
            if (context != null)
            {
                context.Post(delegate
                {
                    TextLabel label = OutputLabel;
                    if (label != null) label.Text = snapshot;
                }, null);
            }
        }

        private static string TakeDlError()
        {
            IntPtr error = Native.Dlerror();
            return error == IntPtr.Zero ? "(dlerror returned null)" : Marshal.PtrToStringAnsi(error);
        }

        private static IntPtr TryDlopen(string name, out string error)
        {
            Native.Dlerror();
            IntPtr handle = Native.Dlopen(name, Native.RTLD_NOW);
            error = handle != IntPtr.Zero ? null : TakeDlError();
            return handle;
        }

        private static void CheckLibrary()
        {
            Log("=== libesplusplayer load test ===");
            string[] candidates = {
                "libesplusplayer.so",
                "/usr/lib/libesplusplayer.so",
                "/lib/libesplusplayer.so"
            };

            IntPtr handle = IntPtr.Zero;
            string lastError = null;
            string loadedFrom = null;
            foreach (string candidate in candidates)
            {
                string error;
                handle = TryDlopen(candidate, out error);
                if (handle != IntPtr.Zero)
                {
                    loadedFrom = candidate;
                    break;
                }
                lastError = error;
                Log("dlopen(" + candidate + ") FAILED: " + error);
            }

            if (handle == IntPtr.Zero)
            {
                Log("RESULT: LIBRARY_LOAD_FAILED");
                Log("Last loader error: " + (lastError ?? "unknown"));
                return;
            }

            Log("dlopen SUCCESS: " + loadedFrom + " handle=0x" + handle.ToInt64().ToString("x"));
            Log("Nota: los nombres de simbolos siguientes son candidatos, no una ABI confirmada.");
            int found = 0;
            foreach (string symbol in RequiredSymbols)
            {
                Native.Dlerror();
                IntPtr address = Native.Dlsym(handle, symbol);
                string error = address == IntPtr.Zero ? TakeDlError() : null;
                if (address != IntPtr.Zero)
                {
                    found++;
                    Log("SYMBOL OK " + symbol + " @0x" + address.ToInt64().ToString("x"));
                }
                else
                {
                    Log("SYMBOL MISSING " + symbol + ": " + error);
                }
            }

            Log("SYMBOL SUMMARY: " + found + "/" + RequiredSymbols.Length + " candidate exports found");
            Log(found == RequiredSymbols.Length
                ? "RESULT: LIBRARY_LOADED_SYMBOLS_OK"
                : "RESULT: LIBRARY_LOADED_SYMBOLS_INCOMPLETE");
            // This first probe deliberately does not initialize the player.
        }

        private static void CheckDevicePattern(string directory, string pattern)
        {
            string[] paths;
            try { paths = Directory.GetFiles(directory, pattern); }
            catch (Exception ex)
            {
                Log("DEVICE SCAN " + directory + "/" + pattern + " FAILED: " + ex.GetType().Name + ": " + ex.Message);
                return;
            }

            if (paths.Length == 0)
            {
                Log("DEVICE NONE " + directory + "/" + pattern);
                return;
            }

            foreach (string path in paths)
            {
                int fd = Native.Open(path, Native.O_RDONLY | Native.O_NONBLOCK);
                if (fd >= 0)
                {
                    Native.Close(fd);
                    Log("DEVICE OPEN OK " + path);
                }
                else
                {
                    Log("DEVICE OPEN FAILED " + path + " errno=" + Marshal.GetLastWin32Error());
                }
            }
        }

        private static void CheckDevices()
        {
            Log("=== device access test (read-only, non-blocking) ===");
            CheckDevicePattern("/dev", "video*");
            CheckDevicePattern("/dev", "sdp*");
            CheckDevicePattern("/dev/input", "event*");
        }

        private static void LogPlatform()
        {
            Log("=== runtime ===");
            Log("OS: " + Environment.OSVersion);
            Log("Process bitness: " + (IntPtr.Size * 8));
            Log("CLR: " + typeof(object).Assembly.ImageRuntimeVersion);
            string[] releaseFiles = { "/etc/tizen-release", "/etc/tizen-version", "/etc/os-release" };
            foreach (string path in releaseFiles)
            {
                try
                {
                    if (File.Exists(path))
                    {
                        string value = File.ReadAllText(path).Replace("\r", " ").Replace("\n", " ");
                        if (value.Length > 400) value = value.Substring(0, 400);
                        Log(path + ": " + value);
                    }
                }
                catch (Exception ex) { Log(path + " read failed: " + ex.Message); }
            }
        }

        private static void RunProbe()
        {
            Log("Moonlight ESPlus preliminary probe worker started");
            try
            {
                LogPlatform();
                CheckLibrary();
                CheckDevices();
                Log("=== PROBE COMPLETE ===");
                Log("Fin del diagnostico. Desplacese por el texto para consultar todos los resultados.");
            }
            catch (Exception ex)
            {
                Log("FATAL: " + ex);
            }
        }

        protected override void OnCreate()
        {
            base.OnCreate();
            // Capture the UI synchronization context before starting any work.
            UiContext = SynchronizationContext.Current;

            Log("Moonlight ESPlus probe application created");

            // Keep the full diagnostic output on the TV. ScrollView lets the
            // user inspect it with the remote instead of relying on DevTools.
            ScrollView scroll = new ScrollView();
            scroll.WidthResizePolicy = ResizePolicyType.FillToParent;
            scroll.HeightResizePolicy = ResizePolicyType.FillToParent;

            OutputLabel = new TextLabel("Moonlight ESPlus probe\n\nDiagnostico iniciado...") ;
            OutputLabel.HorizontalAlignment = HorizontalAlignment.Begin;
            OutputLabel.VerticalAlignment = VerticalAlignment.Top;
            OutputLabel.TextColor = Color.White;
            OutputLabel.PointSize = 18.0f;
            OutputLabel.MultiLine = true;
            OutputLabel.LineWrapMode = LineWrapMode.Word;
            OutputLabel.Ellipsis = false;
            OutputLabel.WidthResizePolicy = ResizePolicyType.FillToParent;
            OutputLabel.HeightResizePolicy = ResizePolicyType.UseNaturalSize;
            scroll.Add(OutputLabel);

            Window.Instance.GetDefaultLayer().Add(scroll);

            // Native library loading and device enumeration must not block
            // the NUI lifecycle/event thread.
            Thread worker = new Thread(RunProbe);
            worker.IsBackground = true;
            worker.Name = "MLPROBE-worker";
            worker.Start();
            Log("Moonlight ESPlus probe startup complete");
        }

        private static void Main(string[] args)
        {
            new ProbeApp().Run(args);
        }
    }
}
