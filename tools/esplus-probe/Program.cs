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
        // Probe both known API naming families. Finding a symbol is only
        // an export-level observation; it does not validate its ABI/signature.
        private static readonly string[] CandidateSymbols = {
            // Common lifecycle / packet path
            "esplusplayer_create",
            "esplusplayer_open",
            "esplusplayer_close",
            "esplusplayer_destroy",
            "esplusplayer_prepare_async",
            "esplusplayer_start",
            "esplusplayer_stop",
            "esplusplayer_pause",
            "esplusplayer_resume",
            "esplusplayer_submit_packet",
            "esplusplayer_submit_eos_packet",
            "esplusplayer_set_ecore_display",
            "esplusplayer_get_state",
            "esplusplayer_get_playing_time",

            // Legacy stream configuration (WMP Tizen 5.0 header)
            "esplusplayer_add_video_stream_info",
            "esplusplayer_add_audio_stream_info",

            // Later public API naming
            "esplusplayer_set_video_stream_info",
            "esplusplayer_set_audio_stream_info",

            // Display / application configuration
            "esplusplayer_set_display",
            "esplusplayer_set_display_mode",
            "esplusplayer_set_display_visible",
            "esplusplayer_set_app_info",

            // Callbacks
            "esplusplayer_set_error_cb",
            "esplusplayer_set_buffer_status_cb",
            "esplusplayer_set_resource_conflicted_cb",
            "esplusplayer_set_eos_cb",
            "esplusplayer_set_ready_to_prepare_cb",
            "esplusplayer_set_prepare_async_done_cb",
            "esplusplayer_set_ready_to_seek_cb",
            "esplusplayer_set_seek_done_cb",

            // Optional controls / diagnostics
            "esplusplayer_seek",
            "esplusplayer_set_playback_rate",
            "esplusplayer_set_audio_mute",
            "esplusplayer_get_error_string"
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
            Log("Los exports son candidatos: dlsym no valida firmas ni estructuras.");
            int found = 0;
            bool addVideo = false;
            bool addAudio = false;
            bool setVideo = false;
            bool setAudio = false;
            bool create = false;
            bool open = false;
            bool close = false;
            bool prepare = false;
            bool startPlayer = false;
            bool stop = false;
            bool submit = false;
            bool display = false;

            foreach (string symbol in CandidateSymbols)
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
                    Log("SYMBOL MISSING " + symbol);
                }

                switch (symbol)
                {
                    case "esplusplayer_create": create = address != IntPtr.Zero; break;
                    case "esplusplayer_open": open = address != IntPtr.Zero; break;
                    case "esplusplayer_close": close = address != IntPtr.Zero; break;
                    case "esplusplayer_prepare_async": prepare = address != IntPtr.Zero; break;
                    case "esplusplayer_start": startPlayer = address != IntPtr.Zero; break;
                    case "esplusplayer_stop": stop = address != IntPtr.Zero; break;
                    case "esplusplayer_submit_packet": submit = address != IntPtr.Zero; break;
                    case "esplusplayer_set_ecore_display": display = address != IntPtr.Zero; break;
                    case "esplusplayer_add_video_stream_info": addVideo = address != IntPtr.Zero; break;
                    case "esplusplayer_add_audio_stream_info": addAudio = address != IntPtr.Zero; break;
                    case "esplusplayer_set_video_stream_info": setVideo = address != IntPtr.Zero; break;
                    case "esplusplayer_set_audio_stream_info": setAudio = address != IntPtr.Zero; break;
                }
            }

            Log("SYMBOL SUMMARY: " + found + "/" + CandidateSymbols.Length + " candidate exports found");
            Log("CORE SYMBOLS: " +
                ((create && open && close && prepare && startPlayer && stop && submit && display)
                    ? "COMPLETE" : "INCOMPLETE"));
            Log("LEGACY add_* STREAM API: " +
                ((addVideo && addAudio) ? "BOTH EXPORTS FOUND" :
                 (addVideo || addAudio) ? "PARTIAL" : "NOT FOUND"));
            Log("LATER set_* STREAM API: " +
                ((setVideo && setAudio) ? "BOTH EXPORTS FOUND" :
                 (setVideo || setAudio) ? "PARTIAL" : "NOT FOUND"));

            if (addVideo && addAudio && !(setVideo || setAudio))
                Log("ABI HINT: LEGACY_ADD family (export names only; ABI still unverified)");
            else if (setVideo && setAudio && !(addVideo || addAudio))
                Log("ABI HINT: SET_STREAM family (export names only; ABI still unverified)");
            else if (addVideo && addAudio && setVideo && setAudio)
                Log("ABI HINT: BOTH naming families exported; do not choose without ABI validation");
            else
                Log("ABI HINT: INCOMPLETE/UNKNOWN stream configuration exports");

            Log("RESULT: SYMBOL INVENTORY COMPLETE; NO PLAYER FUNCTIONS WERE CALLED");
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
