using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using Tizen.Applications;
using TizenAmbilight;

namespace MoonlightAmbilight
{
    internal sealed class AmbilightService : ServiceApplication
    {
        private readonly object _sync = new object();
        private volatile bool _stopping = true;
        private Thread _worker;
        private bool _supported;
        private string _ip;
        private int _port = 21324;
        private int _ledCount = 73;
        private bool _hdr;
        private int _colorSpace = 1;
        private bool _fullRange;

        protected override void OnCreate()
        {
            base.OnCreate();
        }

        protected override void OnAppControlReceived(AppControlReceivedEventArgs e)
        {
            base.OnAppControlReceived(e);
            ReceivedAppControl control = e.ReceivedAppControl;
            if (control == null) return;

            string command = GetExtra(control, "command");
            bool ok = true;
            bool exitAfterReply = false;
            bool? supported = null;
            string error = null;
            string diagnostic = null;

            try
            {
                if (String.Equals(command, "initialize", StringComparison.OrdinalIgnoreCase))
                {
                    StopCapture();
                    error = VideoPlaneCapture.Init();
                    _supported = error == null;
                    supported = _supported;
                    VideoPlaneCapture.Shutdown();
                    ok = true; // Unsupported is a capability result, not an AppControl transport failure.
                    // Capability checks are short-lived; no idle Ambilight process should remain.
                    exitAfterReply = true;
                }
                else if (String.Equals(command, "ppi-probe", StringComparison.OrdinalIgnoreCase))
                {
                    // Explicit diagnostic only. PPI is never selected by the capture loop.
                    error = PpiCapture.Init();
                    if (error == null)
                    {
                        int x = PpiCapture.MeasureWidth / 2;
                        int y = PpiCapture.MeasureHeight / 2;
                        PpiCapture.Pixel sample = PpiCapture.Read(0, x, y);
                        diagnostic = PpiCapture.Describe() +
                            " sampleRc=" + sample.Rc +
                            " rgb10=" + sample.Red10 + "," + sample.Green10 + "," + sample.Blue10 +
                            " sampleMs=" + sample.ElapsedMs.ToString("0.0");
                        if (sample.Rc < 0)
                            error = "PPI initialized but the diagnostic sample failed: " + diagnostic;
                    }
                    else
                    {
                        diagnostic = PpiCapture.Describe();
                    }
                    ok = error == null;
                    supported = ok;
                    PpiCapture.Shutdown();
                    exitAfterReply = true;
                }
                else if (String.Equals(command, "start", StringComparison.OrdinalIgnoreCase))
                {
                    string ip = GetExtra(control, "wledIp");
                    int port = ParseInt(GetExtra(control, "wledPort"), 21324);
                    int leds = ParseInt(GetExtra(control, "ledCount"), 73);
                    bool hdr = ParseBool(GetExtra(control, "hdr"), false);
                    int colorSpace = ParseInt(GetExtra(control, "colorSpace"), hdr ? 2 : 1);
                    bool fullRange = ParseBool(GetExtra(control, "fullRange"), false);
                    error = StartCapture(ip, port, leds, hdr, colorSpace, fullRange);
                    ok = error == null;
                    supported = _supported;
                    exitAfterReply = !_supported;
                }
                else if (String.Equals(command, "stop", StringComparison.OrdinalIgnoreCase))
                {
                    StopCapture();
                    ok = true;
                    supported = _supported;
                }
                else if (String.Equals(command, "shutdown", StringComparison.OrdinalIgnoreCase))
                {
                    StopCapture();
                    ok = true;
                    supported = _supported;
                    exitAfterReply = true;
                }
                else
                {
                    ok = false;
                    error = "Unknown Ambilight command.";
                }
            }
            catch (Exception ex)
            {
                ok = false;
                error = ex.GetType().Name + ": " + ex.Message;
                if (String.Equals(command, "initialize", StringComparison.OrdinalIgnoreCase))
                {
                    _supported = false;
                    supported = false;
                    exitAfterReply = true;
                    VideoPlaneCapture.Shutdown();
                }
            }

            Reply(control, ok, supported, error, diagnostic);

            // Reply first so the Web/WASM caller receives the result before this service exits.
            if (exitAfterReply)
                Exit();
        }

        private string StartCapture(string ip, int port, int ledCount, bool hdr, int colorSpace, bool fullRange)
        {
            IPAddress address;
            if (!IPAddress.TryParse(ip, out address) || address.AddressFamily != AddressFamily.InterNetwork)
                return "A valid WLED IPv4 address is required.";
            if (port < 1 || port > 65535) port = 21324;
            if (ledCount < 1) ledCount = 1;
            if (ledCount > WledOutput.MaxLeds) ledCount = WledOutput.MaxLeds;

            lock (_sync)
            {
                StopCaptureLocked();

                // Backend selection is explicit; PPI is opt-in, never a DRM fallback.
                string selected = String.IsNullOrEmpty(backend) ? VideoPlaneCapture.BackendName : backend;
                string initError;
                if (String.Equals(selected, PpiCapture.BackendName, StringComparison.OrdinalIgnoreCase))
                {
                    initError = PpiCapture.Init();
                    if (initError == null)
                    {
                        _ppiSampler = new PpiSampler(Math.Min(24, Math.Max(8, ledCount)));
                        try { _ppiSampler.Start(); }
                        catch (Exception ex) { initError = ex.GetType().Name + ": " + ex.Message; }
                    }
                    if (initError != null)
                    {
                        if (_ppiSampler != null) { _ppiSampler.Stop(); _ppiSampler = null; }
                        PpiCapture.Shutdown();
                        return initError;
                    }
                }
                else if (String.Equals(selected, VideoPlaneCapture.BackendName, StringComparison.OrdinalIgnoreCase))
                {
                    initError = VideoPlaneCapture.Init();
                    if (initError != null) { VideoPlaneCapture.Shutdown(); return initError; }
                }
                else return "Unknown capture backend. Use video_plane or ppi.";

                _captureBackend = selected;
                _supported = true;

                _ip = address.ToString();
                _port = port;
                _ledCount = ledCount;
                _hdr = hdr;
                _colorSpace = colorSpace >= 0 && colorSpace <= 2 ? colorSpace : (hdr ? 2 : 1);
                _fullRange = fullRange;
                WledOutput.Reset();
                _stopping = false;
                _worker = new Thread(CaptureLoop) { IsBackground = true };
                _worker.Start();
                return null;
            }
        }

        private void StopCapture()
        {
            lock (_sync)
                StopCaptureLocked();
        }

        private void StopCaptureLocked()
        {
            _stopping = true;
            Thread worker = _worker;
            _worker = null;
            if (worker != null && worker.IsAlive && worker != Thread.CurrentThread)
                worker.Join();

            if (_ppiSampler != null)
            {
                _ppiSampler.Stop();
                _ppiSampler = null;
            }
            PpiCapture.Shutdown();
            VideoPlaneCapture.Shutdown();
            _captureBackend = VideoPlaneCapture.BackendName;
        }

        private void CaptureLoop()
        {
            IPAddress address;
            if (!IPAddress.TryParse(_ip, out address))
                return;

            IPEndPoint endpoint = new IPEndPoint(address, _port);
            try
            {
                using (UdpClient udp = new UdpClient())
                {
                    while (!_stopping)
                    {
                        byte[] packet = null;
                        if (String.Equals(_captureBackend, PpiCapture.BackendName, StringComparison.OrdinalIgnoreCase))
                        {
                            PpiSampler sampler = _ppiSampler;
                            byte[] rgb; bool[] valid; long[] updated;
                            if (sampler != null && sampler.TrySnapshot(out rgb, out valid, out updated))
                                packet = WledOutput.BuildPpiFrame(rgb, valid, _ledCount);
                        }
                        else
                        {
                            VideoPlaneResult frame = VideoPlaneCapture.Capture();
                            if (frame != null && frame.HasFrame)
                                packet = WledOutput.BuildFrame(frame, _ledCount, _hdr, _colorSpace, _fullRange);
                        }
                        if (packet != null)
                        {
                            try { udp.Send(packet, packet.Length, endpoint); }
                            catch { }
                        }
                        Thread.Sleep(40);
                    }
                }
            }
            catch
            {
                // Capture failure is isolated to Ambilight. Moonlight streaming remains independent.
                _stopping = true;
            }
        }

        private static void Reply(ReceivedAppControl control, bool ok, bool? supported, string error,
                                  string diagnostic = null)
        {
            if (control == null || !control.IsReplyRequest) return;

            try
            {
                AppControl reply = new AppControl();
                reply.ExtraData.Add("ok", ok ? "true" : "false");
                if (supported.HasValue)
                    reply.ExtraData.Add("supported", supported.Value ? "true" : "false");
                if (!String.IsNullOrEmpty(error))
                    reply.ExtraData.Add("error", error);
                if (!String.IsNullOrEmpty(diagnostic))
                    reply.ExtraData.Add("diagnostic", diagnostic);
                control.ReplyToLaunchRequest(reply, AppControlReplyResult.Succeeded);
            }
            catch
            {
                try { control.ReplyToLaunchRequest(new AppControl(), AppControlReplyResult.Failed); }
                catch { }
            }
        }

        private static string GetExtra(ReceivedAppControl control, string key)
        {
            try { return control.ExtraData.Get<string>(key); }
            catch { return null; }
        }

        private static int ParseInt(string value, int fallback)
        {
            int parsed;
            return Int32.TryParse(value, out parsed) ? parsed : fallback;
        }

        private static bool ParseBool(string value, bool fallback)
        {
            if (String.Equals(value, "true", StringComparison.OrdinalIgnoreCase) || value == "1") return true;
            if (String.Equals(value, "false", StringComparison.OrdinalIgnoreCase) || value == "0") return false;
            return fallback;
        }

        protected override void OnTerminate()
        {
            StopCapture();
            base.OnTerminate();
        }

        private static void Main(string[] args)
        {
            new AmbilightService().Run(args);
        }
    }
}
