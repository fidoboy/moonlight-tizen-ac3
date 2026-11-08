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
                    exitAfterReply = !_supported;
                }
                else if (String.Equals(command, "start", StringComparison.OrdinalIgnoreCase))
                {
                    string ip = GetExtra(control, "wledIp");
                    int port = ParseInt(GetExtra(control, "wledPort"), 21324);
                    int leds = ParseInt(GetExtra(control, "ledCount"), 73);
                    error = StartCapture(ip, port, leds);
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

            Reply(control, ok, supported, error);

            // Reply first so the Web/WASM caller receives the result before this service exits.
            if (exitAfterReply)
                Exit();
        }

        private string StartCapture(string ip, int port, int ledCount)
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
                if (!_supported)
                    return "Ambilight capture is not supported on this TV.";

                string initError = VideoPlaneCapture.Init();
                if (initError != null)
                {
                    _supported = false;
                    VideoPlaneCapture.Shutdown();
                    return initError;
                }

                _ip = address.ToString();
                _port = port;
                _ledCount = ledCount;
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

            VideoPlaneCapture.Shutdown();
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
                        VideoPlaneResult frame = VideoPlaneCapture.Capture();
                        if (frame != null && frame.HasFrame)
                        {
                            byte[] packet = WledOutput.BuildFrame(frame, _ledCount);
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

        private static void Reply(ReceivedAppControl control, bool ok, bool? supported, string error)
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
