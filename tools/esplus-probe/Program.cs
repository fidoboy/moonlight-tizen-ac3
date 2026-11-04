using System;
using System.IO;
using System.Runtime.InteropServices;
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

        private static void Log(string message)
        {
            string line = "[MLPROBE] " + message;
            try { Tizen.Log.Info("MLPROBE", message); } catch { }
            try { Console.WriteLine(line); } catch { }
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

            Log("SYMBOL SUMMARY: " + found + "/" + RequiredSymbols.Length + " required exports found");
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
            }
            catch (Exception ex)
            {
                Log("FATAL: " + ex);
            }
        }

        protected override void OnCreate()
        {
            base.OnCreate();
            // Do not perform native loading or device enumeration on the
            // application lifecycle thread: either operation may block on TV
            // firmware and prevent the launcher/debugger from completing startup.
            Log("Moonlight ESPlus probe application created");

            // A visible NUI application must create a window surface. Without
            // one, the TV launcher can remain on its "Loading" screen.
            TextLabel status = new TextLabel("Moonlight ESPlus probe\n\nDiagnostico iniciado.\nConsulte el log MLPROBE desde Apps2Samsung.");
            status.HorizontalAlignment = HorizontalAlignment.Center;
            status.VerticalAlignment = VerticalAlignment.Center;
            status.TextColor = Color.White;
            status.PointSize = 24.0f;
            status.WidthResizePolicy = ResizePolicyType.FillToParent;
            status.HeightResizePolicy = ResizePolicyType.FillToParent;
            Window.Instance.GetDefaultLayer().Add(status);

            // Native library loading and device enumeration must not block
            // the NUI lifecycle/event thread.
            System.Threading.Thread worker = new System.Threading.Thread(RunProbe);
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
