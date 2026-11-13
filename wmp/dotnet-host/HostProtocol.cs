using System;
using System.Globalization;
using System.Collections.Generic;
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
        private static bool _statsEnabled;
        private static bool _ready;
        private static string _esplusState = "unknown";
        private static string _esplusFamily = "none";
        private static string _loadError;
        private static readonly Queue<string> StageMessages = new Queue<string>();
        private static readonly Queue<string> DiagnosticLogs = new Queue<string>();
        private const int DiagnosticLogCapacity = 256;
        private const int DiagnosticLogLineLimit = 384;
        private static readonly Queue<string> NativeDiagnosticLogs = new Queue<string>();
        private const int NativeDiagnosticLogCapacity = 100;
        private const int NativeDiagnosticLogLineLimit = 512;
        private static long _nativeDiagnosticLogSequence;
        private static long _nativeDiagnosticLogSentSequence;
        private static bool _stageDispatchScheduled;
        private static string _stageAppId;
        private static string _stageRemotePort;

        private sealed class StartRequest
        {
            internal string Host;
            internal string Rikey;
            internal string AppVersion;
            internal string GfeVersion;
            internal string RtspUrl;
            internal string VideoCodec;
            internal string AudioConfig;
            internal int AudioEnabled;
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

        internal static void Start()
        {
            _ready = false;
            _port = new MessagePort(ControlPortName, true);
            _port.MessageReceived += OnMessage;
            _port.Listen();
            Log.Info("Trusted WMP control port listening: " + ControlPortName);
        }

        internal static void UpdateEngine(
            EngineApi engine, string esplusState, string esplusFamily, string loadError)
        {
            lock (Gate)
            {
                _engine = engine;
                _esplusState = esplusState ?? "unknown";
                _esplusFamily = esplusFamily ?? "none";
                _loadError = loadError;
                _ready = true;
            }
            Log.Info("WMP engine status published: " +
                (engine != null ? "loaded" : "unavailable") +
                ", ESPlus=" + _esplusState + ", family=" + _esplusFamily);
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
                try { _port.StopListening(); }
                catch (Exception ex) { Log.Error("control port stop failed: " + ex.Message); }
                try { _port.Dispose(); }
                catch (Exception ex) { Log.Error("control port dispose failed: " + ex.Message); }
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

        private static bool TryUInt(string value, out uint result)
        {
            return UInt32.TryParse(value, NumberStyles.Integer,
                CultureInfo.InvariantCulture, out result);
        }

        private static void HandleInputCommand(string command, Bundle bundle)
        {
            if (_engine == null || _engine.Running() == 0) return;
            int a, b, c, d, e, f, g, h, i;
            uint buttons;
            if (command == "input_key")
            {
                if (TryInt(Arg(bundle, "keyCode"), out a) &&
                    TryInt(Arg(bundle, "keyAction"), out b) &&
                    TryInt(Arg(bundle, "modifiers"), out c))
                    _engine.SendKey(a, b, c);
                return;
            }
            if (command == "gamepad_arrival")
            {
                if (TryInt(Arg(bundle, "index"), out a) &&
                    TryInt(Arg(bundle, "activeMask"), out b) &&
                    TryInt(Arg(bundle, "type"), out c) &&
                    TryUInt(Arg(bundle, "supportedButtons"), out buttons) &&
                    TryInt(Arg(bundle, "capabilities"), out d))
                    _engine.GamepadArrival(a, b, c, buttons, d);
                return;
            }
            if (command == "gamepad_state")
            {
                if (TryInt(Arg(bundle, "index"), out a) &&
                    TryInt(Arg(bundle, "activeMask"), out b) &&
                    TryInt(Arg(bundle, "buttons"), out c) &&
                    TryInt(Arg(bundle, "leftTrigger"), out d) &&
                    TryInt(Arg(bundle, "rightTrigger"), out e) &&
                    TryInt(Arg(bundle, "lsX"), out f) &&
                    TryInt(Arg(bundle, "lsY"), out g) &&
                    TryInt(Arg(bundle, "rsX"), out h) &&
                    TryInt(Arg(bundle, "rsY"), out i))
                    _engine.GamepadState(a, b, c, d, e, f, g, h, i);
            }
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

        private static bool ParseStart(Bundle bundle, out StartRequest request, out string invalidField)
        {
            request = null;
            invalidField = null;
            var value = new StartRequest();
            value.Host = Arg(bundle, "host");
            value.Rikey = Arg(bundle, "rikey");
            value.AppVersion = Arg(bundle, "appVer") ?? String.Empty;
            value.GfeVersion = Arg(bundle, "gfeVer") ?? String.Empty;
            value.RtspUrl = Arg(bundle, "rtspUrl");
            value.VideoCodec = Arg(bundle, "videoCodec");
            value.AudioConfig = Arg(bundle, "audioConfig");

            if (!TryBool(Arg(bundle, "audioEnabled"), out value.AudioEnabled))
                invalidField = "audioEnabled";
            else if (String.IsNullOrEmpty(value.Host)) invalidField = "host";
            else if (!IsHexKey(value.Rikey)) invalidField = "rikey";
            else if (String.IsNullOrEmpty(value.RtspUrl)) invalidField = "rtspUrl";
            else if (String.IsNullOrEmpty(value.VideoCodec)) invalidField = "videoCodec";
            else if (String.IsNullOrEmpty(value.AudioConfig)) invalidField = "audioConfig";
            else if (!TryInt(Arg(bundle, "w"), out value.Width)) invalidField = "w";
            else if (!TryInt(Arg(bundle, "h"), out value.Height)) invalidField = "h";
            else if (!TryInt(Arg(bundle, "fps"), out value.Fps)) invalidField = "fps";
            else if (!TryInt(Arg(bundle, "bitrate"), out value.Bitrate)) invalidField = "bitrate";
            else if (!TryInt(Arg(bundle, "rikeyid"), out value.RikeyId)) invalidField = "rikeyid";
            else if (!TryInt(Arg(bundle, "codecMode"), out value.CodecMode)) invalidField = "codecMode";
            else if (!TryBool(Arg(bundle, "hdr"), out value.Hdr)) invalidField = "hdr";
            else if (!TryBool(Arg(bundle, "fullRange"), out value.FullRange)) invalidField = "fullRange";
            else if (!TryBool(Arg(bundle, "opticalOutputEnabled"), out value.OpticalOutputEnabled))
                invalidField = "opticalOutputEnabled";
            else if (value.Width <= 0) invalidField = "w";
            else if (value.Height <= 0) invalidField = "h";
            else if (value.Fps <= 0) invalidField = "fps";
            else if (value.Bitrate <= 0) invalidField = "bitrate";
            else if (value.CodecMode < 0) invalidField = "codecMode";
            else if (value.VideoCodec != "H264" && value.VideoCodec != "HEVC" &&
                     value.VideoCodec != "AV1") invalidField = "videoCodec";
            else if (value.AudioConfig != "Stereo" && value.AudioConfig != "51Surround" &&
                     value.AudioConfig != "71Surround") invalidField = "audioConfig";

            if (invalidField != null) return false;
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
            try { _port.Send(message, appId, remotePort, true); }
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

        // Native MLT_TRACE lines are copied into a bounded in-memory ring.
        // No file I/O or MessagePort send occurs on the native callback thread.
        internal static void NativeLogLine(IntPtr line)
        {
            try
            {
                if (line == IntPtr.Zero) return;
                RecordNativeDiagnostic(Marshal.PtrToStringAnsi(line));
            }
            catch (Exception ex)
            {
                // Never allow managed exceptions to cross the native callback ABI.
                Log.Error("WMP native log callback failed: " + ex.Message);
            }
        }

        private static void RecordDiagnostic(string value)
        {
            if (String.IsNullOrEmpty(value)) return;
            if (value.Length > DiagnosticLogLineLimit)
                value = value.Substring(0, DiagnosticLogLineLimit) + " [truncated]";
            lock (Gate)
            {
                while (DiagnosticLogs.Count >= DiagnosticLogCapacity)
                    DiagnosticLogs.Dequeue();
                DiagnosticLogs.Enqueue(DateTime.UtcNow.ToString("HH:mm:ss.fff",
                    CultureInfo.InvariantCulture) + " " + value);
            }
        }

        private static void RecordNativeDiagnostic(string value)
        {
            if (String.IsNullOrEmpty(value)) return;
            if (value.Length > NativeDiagnosticLogLineLimit)
                value = value.Substring(0, NativeDiagnosticLogLineLimit) + " [truncated]";
            lock (Gate)
            {
                while (NativeDiagnosticLogs.Count >= NativeDiagnosticLogCapacity)
                    NativeDiagnosticLogs.Dequeue();
                NativeDiagnosticLogs.Enqueue(DateTime.UtcNow.ToString("HH:mm:ss.fff",
                    CultureInfo.InvariantCulture) + " " + value);
                _nativeDiagnosticLogSequence++;
            }
        }

        private static void SendDiagnosticLogs(string appId, string remotePort, string id)
        {
            string[] nativeSnapshot;
            string[] hostSnapshot;
            lock (Gate)
            {
                nativeSnapshot = NativeDiagnosticLogs.ToArray();
                hostSnapshot = DiagnosticLogs.ToArray();
                _nativeDiagnosticLogSentSequence = _nativeDiagnosticLogSequence;
            }

            int nativeStart = Math.Max(0, nativeSnapshot.Length - NativeDiagnosticLogCapacity);
            int hostStart = Math.Max(0, hostSnapshot.Length - 64);
            for (int i = nativeStart; i < nativeSnapshot.Length; i++)
                Event(appId, remotePort, "wmpNativeLog", nativeSnapshot[i]);
            for (int i = hostStart; i < hostSnapshot.Length; i++)
                Event(appId, remotePort, "wmpHostDiagnostic", hostSnapshot[i]);

            Respond(appId, remotePort, id, "ok",
                "{\"count\":" + (nativeSnapshot.Length - nativeStart).ToString(CultureInfo.InvariantCulture) +
                ",\"hostCount\":" + (hostSnapshot.Length - hostStart).ToString(CultureInfo.InvariantCulture) + "}");
        }

        // Called from Moonlight Common C's native connection callback. Keep this
        // callback short: queue the UI notification and let one managed worker send
        // ordered MessagePort events outside the native networking thread.
        private static void SendNewNativeDiagnosticLogs(string appId, string remotePort)
        {
            string[] snapshot;
            int start;
            lock (Gate)
            {
                snapshot = NativeDiagnosticLogs.ToArray();
                long oldestSequence = _nativeDiagnosticLogSequence - snapshot.Length + 1;
                long firstSequence = Math.Max(_nativeDiagnosticLogSentSequence + 1, oldestSequence);
                start = (int)Math.Max(0, firstSequence - oldestSequence);
                _nativeDiagnosticLogSentSequence = _nativeDiagnosticLogSequence;
            }

            for (int i = start; i < snapshot.Length; i++)
                Event(appId, remotePort, "wmpNativeLog", snapshot[i]);
        }

        internal static void NativeStageStarting(int stage, string name)
        {
            try
            {
                if (String.IsNullOrEmpty(name)) return;
                lock (Gate)
                {
                    if (!_workerActive || _stopRequested ||
                        String.IsNullOrEmpty(_stageAppId) || String.IsNullOrEmpty(_stageRemotePort))
                        return;

                    StageMessages.Enqueue("ProgressMsg: Starting " + name + "...");
                    if (!_stageDispatchScheduled)
                    {
                        _stageDispatchScheduled = true;
                        if (!ThreadPool.QueueUserWorkItem(DrainStageMessages))
                            _stageDispatchScheduled = false;
                    }
                }
            }
            catch (Exception ex)
            {
                // Never allow a managed exception to cross the native callback ABI.
                Log.Error("WMP stage callback failed: " + ex.Message);
            }
        }

        private static void DrainStageMessages(object state)
        {
            while (true)
            {
                string message;
                string appId;
                string remotePort;
                lock (Gate)
                {
                    if (StageMessages.Count == 0)
                    {
                        _stageDispatchScheduled = false;
                        return;
                    }
                    message = StageMessages.Dequeue();
                    appId = _stageAppId;
                    remotePort = _stageRemotePort;
                }
                if (!String.IsNullOrEmpty(appId) && !String.IsNullOrEmpty(remotePort))
                    Event(appId, remotePort, message, null);
            }
        }

        private static void OnMessage(object sender, MessageReceivedEventArgs e)
        {
            try
            {
                if (e == null || e.Remote == null ||
                    e.Remote.Trusted != true || e.Remote.AppId != WebAppId)
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
                if (String.IsNullOrEmpty(command))
                {
                    Respond(appId, remotePort, id, "error",
                        "{\"error\":\"invalid_request\"}");
                    return;
                }
                bool inputCommand = command == "input_key" ||
                    command == "gamepad_arrival" || command == "gamepad_state";
                if (String.IsNullOrEmpty(id) && !inputCommand)
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
                    case "input_key":
                    case "gamepad_arrival":
                    case "gamepad_state":
                        HandleInputCommand(command, bundle);
                        return;
                    case "ping":
                        Respond(appId, remotePort, id, "ok",
                            "{\"pong\":true,\"service\":" +
                            JsonQuote(_ready ? "ready" : "initializing") + "}");
                        return;
                    case "get_status":
                    case "probe_esplus":
                        SendStatus(appId, remotePort, id);
                        return;
                    case "get_logs":
                        SendDiagnosticLogs(appId, remotePort, id);
                        return;
                    case "toggle_stats":
                        ToggleStats(appId, remotePort, id);
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

        private static void ToggleStats(string appId, string remotePort, string id)
        {
            bool enabled;
            lock (Gate)
            {
                _statsEnabled = !_statsEnabled;
                enabled = _statsEnabled;
            }
            Respond(appId, remotePort, id, "ok",
                "{\"enabled\":" + (enabled ? "true" : "false") + "}");
            Event(appId, remotePort, enabled ? "StatMsg: " : "NoStatMsg: ", null);
        }

        private static bool StatsAreEnabled()
        {
            lock (Gate) return _statsEnabled;
        }

        private static string FormatStats(StartRequest request, EngineApi.Stats stats)
        {
            var text = new System.Text.StringBuilder(512);
            text.Append("Video stream: ")
                .Append(request.Width.ToString(CultureInfo.InvariantCulture)).Append('x')
                .Append(request.Height.ToString(CultureInfo.InvariantCulture))
                .Append(" (Codec: ").Append(request.VideoCodec).Append(")\n");
            text.Append("Target frame rate: ")
                .Append(request.Fps.ToString(CultureInfo.InvariantCulture)).Append(" FPS\n");
            text.Append("Audio stream: ")
                .Append(request.AudioEnabled != 0 ? "enabled\n" : "disabled\n");
            text.Append("Native player: ")
                .Append(stats.FpsSubmitted.ToString(CultureInfo.InvariantCulture))
                .Append(" FPS submitted · queue depth: ")
                .Append(stats.DepthMs.ToString(CultureInfo.InvariantCulture)).Append(" ms\n");
            text.Append("Frames submitted: ")
                .Append(stats.Submitted.ToString(CultureInfo.InvariantCulture))
                .Append(" · late drops: ").Append(stats.DroppedLate.ToString(CultureInfo.InvariantCulture))
                .Append(" · queue drops: ").Append(stats.DroppedFull.ToString(CultureInfo.InvariantCulture)).Append("\n");
            text.Append("Playback time: ")
                .Append(stats.PlayingMs.ToString(CultureInfo.InvariantCulture)).Append(" ms\n");
            text.Append("Player errors: ").Append(stats.Errors.ToString(CultureInfo.InvariantCulture))
                .Append(" (last: 0x").Append(stats.LastError.ToString("X", CultureInfo.InvariantCulture))
                .Append(") · underruns: ").Append(stats.Underruns.ToString(CultureInfo.InvariantCulture))
                .Append(" · overruns: ").Append(stats.Overruns.ToString(CultureInfo.InvariantCulture));
            return text.ToString();
        }

        private static void SendStatus(string appId, string remotePort, string id)
        {
            bool running = false;
            bool workerActive;
            lock (Gate) workerActive = _workerActive;
            int statsResult = -1;
            int lastErrorCode = 0;
            var stats = new EngineApi.Stats();
            stats.StructSize = Marshal.SizeOf(typeof(EngineApi.Stats));
            string lastErrorDiagnostic;
            try
            {
                if (_engine != null)
                {
                    running = _engine.Running() != 0;
                    statsResult = _engine.GetStats(ref stats);
                    lastErrorCode = _engine.ReadLastError(out lastErrorDiagnostic);
                }
            }
            catch (Exception ex)
            {
                Log.Error("WMP status snapshot failed: " + ex.Message);
            }

            string payload = "{\"service\":" + JsonQuote(_ready ? "ready" : "stopping") +
                ",\"engine\":" + JsonQuote(_engine != null ? "libmlengine" : "unavailable") +
                ",\"sessionState\":" + JsonQuote(running ? "running" : workerActive ? "connecting" : "idle") +
                ",\"running\":" + (running ? "true" : "false") +
                ",\"libraryLoaded\":" + (_engine != null ? "true" : "false") +
                ",\"esplus\":" + JsonQuote(_esplusState) +
                ",\"streamApi\":" + JsonQuote(_esplusFamily) +
                ",\"loadError\":" + JsonQuote(_loadError) +
                ",\"statsAvailable\":" + (statsResult == 0 ? "true" : "false") +
                ",\"submitted\":" + (statsResult == 0 ? stats.Submitted.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"fpsSubmitted\":" + (statsResult == 0 ? stats.FpsSubmitted.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"depthMs\":" + (statsResult == 0 ? stats.DepthMs.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"playingMs\":" + (statsResult == 0 ? stats.PlayingMs.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"playerErrors\":" + (statsResult == 0 ? stats.Errors.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"lastPlayerError\":" + (statsResult == 0 ? stats.LastError.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"underruns\":" + (statsResult == 0 ? stats.Underruns.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"overruns\":" + (statsResult == 0 ? stats.Overruns.ToString(CultureInfo.InvariantCulture) : "0") +
                ",\"lastErrorCode\":" + lastErrorCode.ToString(CultureInfo.InvariantCulture) + "}";
            Respond(appId, remotePort, id, "ok", payload);
        }

        private static string DiagnosticArgument(Bundle bundle, string name, bool sensitive)
        {
            string value = Arg(bundle, name);
            if (value == null) return "<missing>";
            if (sensitive) return "<redacted>";
            return value.Replace("\r", "\\r").Replace("\n", "\\n");
        }

        private static void LogStartArguments(Bundle bundle)
        {
            int debugMode;
            if (!TryBool(Arg(bundle, "debugMode"), out debugMode) || debugMode == 0)
                return;

            // DEBUG_MODE diagnostics deliberately redact host addresses and session secrets.
            Log.Info("WMP start_session arguments (DEBUG_MODE): " +
                "host=" + DiagnosticArgument(bundle, "host", true) +
                ", w=" + DiagnosticArgument(bundle, "w", false) +
                ", h=" + DiagnosticArgument(bundle, "h", false) +
                ", fps=" + DiagnosticArgument(bundle, "fps", false) +
                ", bitrate=" + DiagnosticArgument(bundle, "bitrate", false) +
                ", rikey=" + DiagnosticArgument(bundle, "rikey", true) +
                ", rikeyid=" + DiagnosticArgument(bundle, "rikeyid", false) +
                ", appVer=" + DiagnosticArgument(bundle, "appVer", false) +
                ", gfeVer=" + DiagnosticArgument(bundle, "gfeVer", false) +
                ", rtspUrl=" + DiagnosticArgument(bundle, "rtspUrl", true) +
                ", videoCodec=" + DiagnosticArgument(bundle, "videoCodec", false) +
                ", audioConfig=" + DiagnosticArgument(bundle, "audioConfig", false) +
                ", audioEnabled=" + DiagnosticArgument(bundle, "audioEnabled", false) +
                ", codecMode=" + DiagnosticArgument(bundle, "codecMode", false) +
                ", hdr=" + DiagnosticArgument(bundle, "hdr", false) +
                ", fullRange=" + DiagnosticArgument(bundle, "fullRange", false) +
                ", opticalOutputEnabled=" + DiagnosticArgument(bundle, "opticalOutputEnabled", false) +
                ", debugMode=" + DiagnosticArgument(bundle, "debugMode", false));
        }

        private static void StartSession(Bundle bundle, string appId,
                                         string remotePort, string id)
        {
            LogStartArguments(bundle);

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
            string invalidField;
            if (!ParseStart(bundle, out request, out invalidField))
            {
                // Log only the rejected field name; never expose session secrets.
                Log.Error("invalid_start_arguments: " + invalidField);
                Respond(appId, remotePort, id, "error",
                    "{\"error\":\"invalid_start_arguments\",\"field\":" +
                    JsonQuote(invalidField) + "}");
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
                _statsEnabled = false;
                _stageAppId = appId;
                _stageRemotePort = remotePort;
                StageMessages.Clear();
                DiagnosticLogs.Clear();
                worker = new Thread(delegate() { RunSession(request, appId, remotePort); });
                worker.IsBackground = true;
                _worker = worker;
            }

            Respond(appId, remotePort, id, "ok", "{\"accepted\":true}");
            try { worker.Start(); }
            catch (Exception ex)
            {
                lock (Gate)
                {
                    _workerActive = false; _worker = null;
                    _stageAppId = null; _stageRemotePort = null;
                    StageMessages.Clear();
                }
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
            DateTime nextDiagnosticLog = DateTime.UtcNow.AddSeconds(5);
            DateTime nextStatsMessage = DateTime.UtcNow;
            uint lastReportedPlayerErrors = 0;

            try
            {
                RecordDiagnostic("host session starting: video=" + request.VideoCodec + " " +
                    request.Width.ToString(CultureInfo.InvariantCulture) + "x" +
                    request.Height.ToString(CultureInfo.InvariantCulture) + "@" +
                    request.Fps.ToString(CultureInfo.InvariantCulture) +
                    "; bitrateKbps=" + request.Bitrate.ToString(CultureInfo.InvariantCulture));
                Log.Info("WMP session starting: video=" + request.VideoCodec + " " +
                    request.Width.ToString(CultureInfo.InvariantCulture) + "x" +
                    request.Height.ToString(CultureInfo.InvariantCulture) + "@" +
                    request.Fps.ToString(CultureInfo.InvariantCulture) +
                    "; audio=" + (request.AudioEnabled != 0 ? "enabled" : "disabled"));
                _engine.SetDolbyPassthrough(request.AudioEnabled != 0 && request.OpticalOutputEnabled != 0 ? 1 : 0);
                result = _engine.StartSessionV2(
                    request.Host, request.Width, request.Height, request.Fps,
                    request.Bitrate, request.Rikey, request.RikeyId,
                    request.AppVersion, request.GfeVersion, request.RtspUrl,
                    request.CodecMode, request.VideoCodec, request.Hdr,
                    request.AudioConfig, request.FullRange, request.AudioEnabled);

                RecordDiagnostic("host StartSessionV2 returned " + result.ToString(CultureInfo.InvariantCulture));
                Log.Info("WMP native StartSessionV2 returned " +
                    result.ToString(CultureInfo.InvariantCulture));
                // The Debug Mode WebApp can now retrieve the native startup trace,
                // including ESPlus window/display and prepare diagnostics.
                Event(appId, remotePort, "wmpDiagnosticReady", null);
                if (result != 0)
                {
                    int nativeCode = _engine.ReadLastError(out diagnostic);
                    if (nativeCode == 0) nativeCode = result;
                    RecordDiagnostic("native startup failure: code=" +
                        nativeCode.ToString(CultureInfo.InvariantCulture) +
                        (String.IsNullOrEmpty(diagnostic) ? String.Empty : ", diagnostic=" + diagnostic));
                    _engine.Stop();
                    Event(appId, remotePort, "streamTerminated: " +
                        nativeCode.ToString(CultureInfo.InvariantCulture),
                        String.IsNullOrEmpty(diagnostic)
                            ? "WMP engine start failed (code " + nativeCode.ToString(CultureInfo.InvariantCulture) + ")"
                            : diagnostic);
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

                    EngineApi.Stats stats = new EngineApi.Stats();
                    stats.StructSize = Marshal.SizeOf(typeof(EngineApi.Stats));
                    int statsResult = _engine.GetStats(ref stats);
                    if (!videoReady && _engine.VideoReady() != 0)
                    {
                        videoReady = true;
                        Log.Info("WMP ESPlus playback started after accepting video; submitted=" +
                            (statsResult == 0 ? stats.Submitted.ToString(CultureInfo.InvariantCulture) : "unknown"));
                        Event(appId, remotePort, "displayVideo", null);
                    }
                    if (statsResult == 0 && stats.Errors > lastReportedPlayerErrors)
                    {
                        lastReportedPlayerErrors = stats.Errors;
                        string playerError = "ESPlus player error 0x" +
                            stats.LastError.ToString("X", CultureInfo.InvariantCulture);
                        RecordDiagnostic("player error callback observed: " + playerError +
                            ", total=" + stats.Errors.ToString(CultureInfo.InvariantCulture));
                        Event(appId, remotePort, "wmpPlayerError: " +
                            stats.LastError.ToString(CultureInfo.InvariantCulture), playerError);
                        // Match the reference WMP player lifecycle: a player error callback
                        // is diagnostic, not a session-termination decision. In particular,
                        // prepare_async_done may still arrive with ok=0, after which the native
                        // ESPlus path makes its one permitted start() attempt. Common C remains
                        // authoritative for session state and termination.
                    }
                    if (StatsAreEnabled() && DateTime.UtcNow >= nextStatsMessage)
                    {
                        if (statsResult == 0)
                            Event(appId, remotePort, "StatMsg: " + FormatStats(request, stats), null);
                        nextStatsMessage = DateTime.UtcNow.AddSeconds(1);
                    }

                    if (DateTime.UtcNow >= nextDiagnosticLog)
                    {
                        string streamStatsDiagnostic = "stats_rc=" + statsResult.ToString(CultureInfo.InvariantCulture) +
                            ", running=" + (statsResult == 0 ? stats.Running.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", submitted=" + (statsResult == 0 ? stats.Submitted.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", video_ready=" + (_engine.VideoReady() != 0 ? "1" : "0") +
                            ", playing_ms=" + (statsResult == 0 ? stats.PlayingMs.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", fps=" + (statsResult == 0 ? stats.FpsSubmitted.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", player_errors=" + (statsResult == 0 ? stats.Errors.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", last_player_error=" + (statsResult == 0 ? stats.LastError.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", underruns=" + (statsResult == 0 ? stats.Underruns.ToString(CultureInfo.InvariantCulture) : "unknown") +
                            ", overruns=" + (statsResult == 0 ? stats.Overruns.ToString(CultureInfo.InvariantCulture) : "unknown");
                        RecordDiagnostic("host stream stats: " + streamStatsDiagnostic);
                        Log.Info("WMP stream diagnostic: " + streamStatsDiagnostic);
                        Event(appId, remotePort, "wmpDiagnostic", streamStatsDiagnostic);
                        // Refresh the native ring buffer after each lifecycle snapshot so
                        // callbacks emitted after startup (prepare_async_done/start) are visible.
                        SendNewNativeDiagnosticLogs(appId, remotePort);
                        nextDiagnosticLog = DateTime.UtcNow.AddSeconds(5);
                    }

                    Thread.Sleep(200);
                }

                terminationCode = _engine.ReadLastError(out diagnostic);
                RecordDiagnostic("host session ended: code=" + terminationCode.ToString(CultureInfo.InvariantCulture) +
                    (String.IsNullOrEmpty(diagnostic) ? String.Empty : ", diagnostic=" + diagnostic));
                _engine.Stop();
                Event(appId, remotePort, "streamTerminated: " +
                    terminationCode.ToString(CultureInfo.InvariantCulture), diagnostic);
            }
            catch (Exception ex)
            {
                try { _engine.Stop(); } catch { }
                RecordDiagnostic("host worker exception: " + ex.GetType().Name + ": " + ex.Message);
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
                    _statsEnabled = false;
                    _stageAppId = null;
                    _stageRemotePort = null;
                    StageMessages.Clear();
                }
                Event(appId, remotePort, "wmpDiagnosticReady", null);
            }
        }
    }
}
