using System;
using System.Collections.Generic;
using System.Linq;
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
        private volatile bool _stopping;
        private Thread _worker;
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
            if (String.Equals(command, "start", StringComparison.OrdinalIgnoreCase))
            {
                string ip = GetExtra(control, "wledIp");
                int port = ParseInt(GetExtra(control, "wledPort"), 21324);
                int leds = ParseInt(GetExtra(control, "ledCount"), 73);
                StartCapture(ip, port, leds);
            }
            else if (String.Equals(command, "stop", StringComparison.OrdinalIgnoreCase))
            {
                StopCapture();
            }

            if (control.IsReplyRequest)
            {
                try { control.ReplyToLaunchRequest(new AppControl(), AppControlReplyResult.Succeeded); }
                catch { }
            }
        }

        private void StartCapture(string ip, int port, int ledCount)
        {
            IPAddress address;
            if (!IPAddress.TryParse(ip, out address) || address.AddressFamily != AddressFamily.InterNetwork)
                return;
            if (port < 1 || port > 65535) port = 21324;
            if (ledCount < 1) ledCount = 1;
            if (ledCount > WledOutput.MaxLeds) ledCount = WledOutput.MaxLeds;

            lock (_sync)
            {
                StopCaptureLocked();
                _ip = address.ToString();
                _port = port;
                _ledCount = ledCount;
                _stopping = false;
                _worker = new Thread(CaptureLoop) { IsBackground = true };
                _worker.Start();
            }
        }

        private void StopCapture()
        {
            lock (_sync) StopCaptureLocked();
        }

        private void StopCaptureLocked()
        {
            _stopping = true;
            Thread worker = _worker;
            _worker = null;
            if (worker != null && worker.IsAlive && worker != Thread.CurrentThread)
                worker.Join(1500);
            VideoPlaneCapture.Shutdown();
        }

        private void CaptureLoop()
        {
            string error = VideoPlaneCapture.Init();
            if (error != null) return;

            IPAddress address;
            if (!IPAddress.TryParse(_ip, out address)) return;
            IPEndPoint endpoint = new IPEndPoint(address, _port);

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
