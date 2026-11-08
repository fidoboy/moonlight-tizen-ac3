using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Tizen.Applications;

namespace MoonlightAmbilight
{
    internal sealed class AmbilightService : ServiceApplication
    {
        private volatile bool _stopping;
        private Thread _worker;

        protected override void OnCreate()
        {
            base.OnCreate();
            _stopping = false;
            _worker = new Thread(CaptureLoop);
            _worker.IsBackground = true;
            _worker.Start();
        }

        protected override void OnTerminate()
        {
            _stopping = true;
            if (_worker != null && _worker.IsAlive) _worker.Join(1000);
            VideoPlaneCapture.Shutdown();
            base.OnTerminate();
        }

        private void CaptureLoop()
        {
            string ip = ReadString("wledIp", "");
            int port = ReadInt("wledPort", 21324);
            int ledCount = ReadInt("ledCount", 73);
            if (ledCount < 1) ledCount = 1;
            if (ledCount > WledOutput.MaxLeds) ledCount = WledOutput.MaxLeds;

            if (String.IsNullOrEmpty(ip)) return;

            string error = VideoPlaneCapture.Init();
            if (error != null) return;

            using (UdpClient udp = new UdpClient())
            {
                IPEndPoint endpoint;
                if (!IPAddress.TryParse(ip, out IPAddress address)) return;
                endpoint = new IPEndPoint(address, port);

                while (!_stopping)
                {
                    VideoPlaneResult frame = VideoPlaneCapture.Capture();
                    if (frame != null && frame.HasFrame)
                    {
                        byte[] packet = WledOutput.BuildFrame(frame, ledCount);
                        try { udp.Send(packet, packet.Length, endpoint); }
                        catch { }
                    }
                    Thread.Sleep(40);
                }
            }
        }

        private static string ReadString(string key, string fallback)
        {
            try
            {
                if (Preference.Contains(key))
                {
                    string value = Preference.Get<string>(key);
                    if (!String.IsNullOrEmpty(value)) return value;
                }
            }
            catch { }
            return fallback;
        }

        private static int ReadInt(string key, int fallback)
        {
            try { if (Preference.Contains(key)) return Preference.Get<int>(key); }
            catch { }
            return fallback;
        }

        private static void Main(string[] args)
        {
            new AmbilightService().Run(args);
        }
    }
}
