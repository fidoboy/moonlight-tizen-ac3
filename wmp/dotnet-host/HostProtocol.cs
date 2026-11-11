using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using Tizen.Applications;
using Tizen.Applications.Messages;

namespace MoonlightWmpHost
{
    // Implements the existing moonlight-wmp/1 contract. The engine remains
    // the authority for running state and termination; this worker only
    // serializes lifecycle calls and forwards native events to the WebApp.
    internal static class HostProtocol
    {
        private const string Protocol = "moonlight-wmp/1";
        private const string WebAppId = "MoonLightS.MoonlightWasm";
        private const string ControlPortName = "MoonlightWmpControl";

        private static readonly object Gate = new object();
        private static MessagePort _port;
        private static EngineApi _engine;
        private static Thread _worker;
        private static bool _workerActive;
        private static bool _stopRequested;
        private static bool _ready;
        private static string _esplusState = "unknown";
        private static string _esplusFamily = "none";
        private static string _loadError;

        private sealed class StartRequest
        {
            internal string Host;
            internal string Rikey;
            internal string AppVersion;
            internal string GfeVersion;
            internal string RtspUrl;
            internal string VideoCodec;
            internal string AudioConfig;
            internal int Width;
            internal int Height;
            internal int Fps;
            internal int Bitrate;
            internal int RikeyId;
            internal int CodecMode;
            internal int Hdr;
            internal int FullRange;
            internal int OpticalOutputEnabled;
        }

        internal static void Start(EngineApi engine, string esplusState, string esplusFamily, string loadError)
        {
            _engine = engine;
            _esplusState = esplusState ?? "unknown";
            _esplusFamily = esplusFamily ?? "none";
            _loadError = loadError;

            _port = new MessagePort(ControlPortName, true);
            _port.MessageReceived += OnMessage;
            _port.Listen();
            _ready = true;
            Log.Info("Trusted WMP control port listening: " + ControlPortName);
        }

        internal static void Shutdown()
        {
            _ready = false;
            Thread worker;
            lock (Gate)
            {
                _stopRequested = true;
                worker = _worker;
            }

            if (worker != null && worker.IsAlive)
                worker.Join();

            try
            {
                if (_engine != null) _engine.Stop();
            }
            catch (Exception ex)
            {
                Log.Error("engine stop during host shutdown failed: " + ex);
            }

            if (_port != null)
            {
                _port = null;
            }
        }

        private static string Item(Bundle bundle, string key)
        {
            return bundle != null && bundle.Contains(key)
                ? bundle.GetItem<string>(key)
                : null;
        }

        private static string Arg(Bundle bundle, string name)
        {
            return Item(bundle, "arg_" + name);
        }

        private static bool TryInt(string value, out int result)
        {
            return Int32.TryParse(value, NumberStyles.Integer,
                CultureInfo.InvariantCulture, out result);
        }

        private static bool TryBool(string value, out int result)
        {
            if (value == "true" || value == "1") { result = 1; return true; }
            if (value == "false" || value == "0") { result = 0; return true; }
            result = 0;
            return false;
        }

        private static bool IsHexKey(string value)
        {
            if (value == null || value.Length != 32) return false;
            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                if (!((c >= '0' && c <= '9') ||
                      (c >= 'a' && c <= 'f') ||
                      (c >= 'A' && c <= 'F')))
                    return false;
            }
            return true;
        }

        private static bool ParseStart(Bundle bundle, out StartRequest request)
        {
            request = null;
            var value = new StartRequest();
            value.Host = Arg(bundle, "host");
            value.Rikey = Arg(bundle, "rikey");
            value.AppVersion = Arg(bundle, "appVer") ?? String.Empty;
            value.GfeVersion = Arg(bundle, "gfeVer") ?? String.Empty;
            value.RtspUrl = Arg(bundle, "rtspUrl");
            value.VideoCodec = Arg(bundle, "videoCodec");
            value.AudioConfig = Arg(bundle, "audioConfig");

            if (String.IsNullOrEmpty(value.Host) ||
                !IsHexKey(value.Rikey) ||
                String.IsNullOrEmpty(value.RtspUrl) ||
                String.IsNullOrEmpty(value.VideoCodec) ||
                String.IsNullOrEmpty(value.AudioConfig) ||
                !TryInt(Arg(bundle, "w"), out value.Width) ||
                !TryInt(Arg(bundle, "h"), out value.Height) ||
                !TryInt(Arg(bundle, "fps"), out value.Fps) ||
                !TryInt(Arg(bundle, "bitrate"), out value.Bitrate) ||
                !TryInt(Arg(bundle, "rikeyid"), out value.RikeyId) ||
                !TryInt(Arg(bundle, "codecMode"), out value.CodecMode) ||
                !TryBool(Arg(bundle, "hdr"), out value.Hdr) ||
                !TryBool(Arg(bundle, "fullRange"), out value.FullRange) ||
                !TryBool(Arg(bundle, "opticalOutputEnabled"), out value.OpticalOutputEnabled))
                return false;

            if (value.Width <= 0 || value.Height <= 0 || value.Fps <= 0 ||
                value.Bitrate <= 0 || value.RikeyId < 0 || value.CodecMode < 0 ||
                (value.VideoCodec != "H264" && value.VideoCodec != "HEVC" &&
                 value.VideoCodec != "AV1") ||
                (value.AudioConfig != "Stereo" && value.AudioConfig != "51Surround" &&
                 value.AudioConfig != "71Surround"))
                return false;

            request = value;
            return true;
        }

        private static string JsonQuote(string value)
        {
            if (value == null) return "null";
            return "\"" + value.Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n") + "\"";
        }

        private static void Send(Bundle message, string appId, string remotePort)
        {
            if (_port == null || String.IsNullOrEmpty(appId) ||
                String.IsNullOrEmpty(remotePort)) return;
            try { _port.Send(message, appId, remotePort); }
            catch (Exception ex) { Log.Error("trusted MessagePort send failed: " + ex.Message); }
        }

        private static void Respond(string appId, string remotePort, string id,
                                     string status, string payload)
        {
            var message = new Bundle();
            message.AddItem("protocol", Protocol);
            message.AddItem("id", id ?? String.Empty);
            message.AddItem("type", "response");
            message.AddItem("status", status ?? "error");
            message.AddItem("payload", payload ?? "{}");
            Send(message, appId, remotePort);
        }

        private static void Event(string appId, string remotePort, string name, string detail)
        {
            var message = new Bundle();
            message.AddItem("protocol", Protocol);
            message.AddItem("type", "event");
            message.AddItem("event", name);
            if (!String.IsNullOrEmpty(detail)) message.AddItem("detail", detail);
            Send(message, appId, remotePort);
        }

        private static void OnMessage(object sender, MessageReceivedEventArgs e)
        {
            try
            {
                if (e == null || e.Remote == null ||
                    e.Remote.AppId != WebAppId)
                {
                    Log.Error("rejected untrusted or unexpected WMP MessagePort sender");
                    return;
                }

                Bundle bundle = e.Message;
                string appId = e.Remote.AppId;
                string remotePort = e.Remote.PortName;
                string protocol = Item(bundle, "protocol");
                string id = Item(bundle, "id");
                string command = Item(bundle, "command");
                string payload = Item(bundle, "payload");

                if (protocol != Protocol)
                {
                    Respond(appId, remotePort, id, "error",
                        "{\"error\":\"unsupported_protocol\"}");
                    return;
                }
                if (String.IsNullOrEmpty(id) || String.IsNullOrEmpty(command))
                {
                    Respond(appId, remotePort, id, "error",
                        "{\"error\":\"invalid_request\"}");
                    return;
                }
                if (payload != null && payload.Length > 2048)
                {
                    Respond(appId, remotePort, id, "error",
                        "{\"error\":\"payload_too_large\"}");
                    return;
                }

                switch (command)
                {
                    case "ping":
                        Respond(appId, remotePort, id, "ok",
                            "{\"pong\":true,\"service\":\"ready\"}");
                        return;
                    case "get_status":
                    case "probe_esplus":
                        SendStatus(appId, remotePort, id);
                        return;
                    case "start_session":
                        StartSession(bundle, appId, remotePort, id);
                        return;
                    case "stop_session":
                        StopSession(appId, remotePort, id);
                        return;
                    default:
                        Respond(appId, remotePort, id, "error",
                            "{\"error\":\"unsupported_command\"}");
                        return;
                }
            }
            catch (Exception ex)
            {
                Log.Error("WMP MessagePort request failed: " + ex);
            }
        }

        private static void SendStatus(string appId, string remotePort, string id)
        {
            bool running = false;
            try { running = _engine != null && _engine.Running() != 0; }
            catch { }
            string payload = "{\"service\":\"" + (_ready ? "ready" : "stopping") +
                "\",\"engine\":\"" + (_engine != null ? "libmlengine" : "unavailable") +
                "\",\"running\":" + (running ? "true" : "false") +
                ",\"libraryLoaded\":" + (_engine != null ? "true" : "false") +
                ",\"esplus\":" + JsonQuote(_esplusState) +
                ",\"streamApi\":" + JsonQuote(_esplusFamily) +
                ",\"loadError\":" + JsonQuote(_loadError) + "}";
            Respond(appId, remotePort, id, "ok", payload);
        }

        private static void StartSession(Bundle bundle, string appId,
                                         string remotePort, string id)
        {
            if (!_ready)
            {
                Respond(appId, remotePort, id, "error",
                    "{\"error\":\"service_not_ready\"}");
                return;
            }
            if (_engine == null)
            {
                Respond(appId, remotePort, id, "error",
                    "{\"error\":\"engine_unavailable\",\"detail\":" + JsonQuote(_loadError) + "}");
                return;
            }
            if (_esplusState != "symbols_detected")
            {
                Respond(appId, remotePort, id, "error",
                    "{\"error\":\"esplus_unavailable\"}");
                return;
            }

            StartRequest request;
            if (!ParseStart(bundle, out request))
            {
                Respond(appId, remotePort, id, "error",
                    "{\"error\":\"invalid_start_arguments\"}");
                return;
            }

            Thread worker;
            lock (Gate)
            {
                if (_workerActive)
                {
                    Respond(appId, remotePort, id, "error",
                        "{\"error\":\"engine_busy\"}");
                    return;
                }

                _workerActive = true;
                _stopRequested = false;
                worker = new Thread(delegate() { RunSession(request, appId, remotePort); });
                worker.IsBackground = true;
                _worker = worker;
            }

            Respond(appId, remotePort, id, "ok", "{\"accepted\":true}");
            try { worker.Start(); }
            catch (Exception ex)
            {
                lock (Gate) { _workerActive = false; _worker = null; }
                Event(appId, remotePort, "streamTerminated: -1",
                    "WMP worker start failed: " + ex.Message);
            }
        }

        private static void StopSession(string appId, string remotePort, string id)
        {
            bool active;
            lock (Gate)
            {
                active = _workerActive;
                if (active) _stopRequested = true;
            }

            if (active)
            {
                Respond(appId, remotePort, id, "ok", "{\"stopQueued\":true}");
                return;
            }

            try { if (_engine != null) _engine.Stop(); }
            catch (Exception ex) { Log.Error("idempotent engine stop failed: " + ex.Message); }
            Respond(appId, remotePort, id, "ok", "{\"stopped\":true}");
            Event(appId, remotePort, "streamTerminated: 0", null);
        }

        private static bool StopWasRequested()
        {
            lock (Gate) return _stopRequested;
        }

        private static void RunSession(StartRequest request, string appId, string remotePort)
        {
            int result = -1;
            bool videoReady = false;
            int lastAudioCodec = -1;
            string diagnostic = null;
            int terminationCode = 0;

            try
            {
                _engine.SetDolbyPassthrough(request.OpticalOutputEnabled);
                result = _engine.StartSessionV2(
                    request.Host, request.Width, request.Height, request.Fps,
                    request.Bitrate, request.Rikey, request.RikeyId,
                    request.AppVersion, request.GfeVersion, request.RtspUrl,
                    request.CodecMode, request.VideoCodec, request.Hdr,
                    request.AudioConfig, request.FullRange);

                if (result != 0)
                {
                    _engine.Stop();
                    Event(appId, remotePort, "streamTerminated: -1",
                        "WMP engine start failed (code " + result.ToString(CultureInfo.InvariantCulture) + ")");
                    return;
                }

                if (StopWasRequested())
                {
                    _engine.Stop();
                    Event(appId, remotePort, "streamTerminated: 0", null);
                    return;
                }

                Event(appId, remotePort, "Connection Established", null);

                while (_engine.Running() != 0)
                {
                    if (StopWasRequested()) break;

                    int audioCodec = _engine.GetActiveAudioCodec();
                    if (audioCodec != lastAudioCodec)
                    {
                        string codec = audioCodec == 3 ? "E-AC-3" :
                            audioCodec == 2 ? "AC-3" :
                            audioCodec == 1 ? "OPUS" : "PENDING";
                        Event(appId, remotePort, "wmpAudioCodec: " + codec, null);
                        lastAudioCodec = audioCodec;
                    }

                    if (!videoReady)
                    {
                        EngineApi.Stats stats = new EngineApi.Stats();
                        stats.StructSize = Marshal.SizeOf(typeof(EngineApi.Stats));
                        if (_engine.GetStats(ref stats) == 0 && stats.Submitted > 0)
                        {
                            videoReady = true;
                            Event(appId, remotePort, "displayVideo", null);
                        }
                    }

                    Thread.Sleep(200);
                }

                terminationCode = _engine.ReadLastError(out diagnostic);
                _engine.Stop();
                Event(appId, remotePort, "streamTerminated: " +
                    terminationCode.ToString(CultureInfo.InvariantCulture), diagnostic);
            }
            catch (Exception ex)
            {
                try { _engine.Stop(); } catch { }
                Event(appId, remotePort, "streamTerminated: -1",
                    "WMP host session worker failed: " + ex.Message);
                Log.Error("session worker failed: " + ex);
            }
            finally
            {
                lock (Gate)
                {
                    _workerActive = false;
                    _worker = null;
                    _stopRequested = false;
                }
            }
        }
    }
}
