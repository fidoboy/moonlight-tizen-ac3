using System;
using System.Runtime.InteropServices;

namespace MoonlightWmpHost
{
    // Frozen managed view of the public C ABI in wmp/upstream/mlclient/mlengine.h.
    // All delegates must remain rooted for the lifetime of the loaded engine.
    internal sealed class EngineApi
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct Stats
        {
            public int StructSize;
            public int Running;
            public int DepthMs;
            public int AudioDepthMs;
            public uint PlayingMs;
            public uint Submitted;
            public uint DroppedLate;
            public uint DroppedFull;
            public uint FpsSubmitted;
            public uint Underruns;
            public uint Overruns;
            public uint Errors;
            public uint LastError;
            public uint Recoveries;
            public int RecoveryState;
        }

        // Layout mirrors wmp/service/src/wmp_esplus_abi.h. Function pointers are
        // opaque: managed code only asks the native probe to inspect them.
        [StructLayout(LayoutKind.Sequential)]
        internal struct EsplusApi
        {
            public IntPtr Library;
            public IntPtr Create;
            public IntPtr Open;
            public IntPtr Close;
            public IntPtr Destroy;
            public IntPtr PrepareAsync;
            public IntPtr Start;
            public IntPtr Stop;
            public IntPtr SubmitPacket;
            public IntPtr SubmitEosPacket;
            public IntPtr SetDisplayEcoreSubsurface;
            public IntPtr SetEcoreDisplay;
            public IntPtr SetDisplayMode;
            public IntPtr GetPlayingTime;
            public IntPtr SetVideoStreamInfo;
            public IntPtr SetAudioStreamInfo;
            public IntPtr AddVideoStreamInfo;
            public IntPtr AddAudioStreamInfo;
            public int SelectedFamily;
        }

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void StageCallbackFn(int stage, [MarshalAs(UnmanagedType.LPStr)] string name);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SetStageCallbackFn(StageCallbackFn callback);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void LogCallbackFn(IntPtr line);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SetLogCallbackFn(LogCallbackFn callback);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int RunningFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int VideoReadyFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int InputCapabilitiesFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void StopFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SendKeyFn(int keyCode, int keyAction, int modifiers);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SendMouseMoveFn(int deltaX, int deltaY);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SendMouseButtonFn(int button, int pressed);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SendMouseScrollFn(int amount);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int GamepadArrivalFn(int index, int activeMask, int type,
            uint supportedButtons, int capabilities);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int GamepadStateFn(int index, int activeMask, int buttons,
            int leftTrigger, int rightTrigger, int lsX, int lsY, int rsX, int rsY);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SetDolbyPassthroughFn(int enabled);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int ActiveAudioCodecFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int GetStatsFn(ref Stats stats);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int LastErrorFn([Out] byte[] buffer, int capacity);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal delegate int StartSessionV2Fn(
            string host, int width, int height, int fps, int bitrateKbps,
            string rikeyHex, int rikeyId, string appVersion, string gfeVersion,
            string rtspUrl, int codecMode, string videoCodec, int hdr,
            string audioConfig, int fullRange, int audioEnabled);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate int EsplusProbeFn(ref EsplusApi api, [Out] byte[] report, uint capacity);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate IntPtr EsplusNameFn(int value);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void EsplusCloseFn(ref EsplusApi api);

        private static readonly StageCallbackFn NativeStageCallback = HostProtocol.NativeStageStarting;
        private static readonly LogCallbackFn NativeLogCallback = HostProtocol.NativeLogLine;
        private readonly SetStageCallbackFn _setStageCallback;
        private readonly SetLogCallbackFn _setLogCallback;

        internal void EnableStageCallbacks()
        {
            _setStageCallback(NativeStageCallback);
            _setLogCallback(NativeLogCallback);
        }

        internal readonly RunningFn Running;
        internal readonly VideoReadyFn VideoReady;
        internal readonly InputCapabilitiesFn InputCapabilities;
        internal readonly StopFn Stop;
        internal readonly SendKeyFn SendKey;
        internal readonly SendMouseMoveFn SendMouseMove;
        internal readonly SendMouseButtonFn SendMouseButton;
        internal readonly SendMouseScrollFn SendMouseScroll;
        internal readonly GamepadArrivalFn GamepadArrival;
        internal readonly GamepadStateFn GamepadState;
        internal readonly SetDolbyPassthroughFn SetDolbyPassthrough;
        internal readonly ActiveAudioCodecFn GetActiveAudioCodec;
        internal readonly GetStatsFn GetStats;
        internal readonly LastErrorFn LastError;
        internal readonly StartSessionV2Fn StartSessionV2;

        private readonly EsplusProbeFn _esplusProbe;
        private readonly EsplusNameFn _esplusProbeResultName;
        private readonly EsplusNameFn _esplusFamilyName;
        private readonly EsplusCloseFn _esplusClose;
        private EsplusApi _esplusApi;
        private bool _esplusProbeCached;
        private int _esplusProbeResult;
        private string _esplusFamily = String.Empty;
        private string _esplusReport = String.Empty;

        // resolve must resolve symbols from the loaded libmlengine image, including
        // symbols in the manually mapped ELF image. No direct DllImport is used.
        internal EngineApi(Func<string, IntPtr> resolve)
        {
            if (resolve == null) throw new ArgumentNullException("resolve");

            _setStageCallback = Bind<SetStageCallbackFn>(resolve, "ml_engine_set_stage_cb");
            _setLogCallback = Bind<SetLogCallbackFn>(resolve, "ml_engine_set_log_cb");
            Running = Bind<RunningFn>(resolve, "ml_engine_running");
            VideoReady = Bind<VideoReadyFn>(resolve, "ml_engine_video_ready");
            InputCapabilities = Bind<InputCapabilitiesFn>(resolve, "ml_engine_input_capabilities");
            Stop = Bind<StopFn>(resolve, "ml_engine_stop");
            SendKey = Bind<SendKeyFn>(resolve, "ml_engine_send_key");
            SendMouseMove = Bind<SendMouseMoveFn>(resolve, "ml_engine_send_mouse_move");
            SendMouseButton = Bind<SendMouseButtonFn>(resolve, "ml_engine_send_mouse_button");
            SendMouseScroll = Bind<SendMouseScrollFn>(resolve, "ml_engine_send_mouse_scroll");
            GamepadArrival = Bind<GamepadArrivalFn>(resolve, "ml_engine_gamepad_arrival");
            GamepadState = Bind<GamepadStateFn>(resolve, "ml_engine_gamepad_state");
            SetDolbyPassthrough = Bind<SetDolbyPassthroughFn>(
                resolve, "ml_engine_set_dolby_passthrough_enabled");
            GetActiveAudioCodec = Bind<ActiveAudioCodecFn>(
                resolve, "ml_engine_get_active_audio_codec");
            GetStats = Bind<GetStatsFn>(resolve, "ml_engine_get_stats");
            LastError = Bind<LastErrorFn>(resolve, "ml_engine_last_error");
            StartSessionV2 = Bind<StartSessionV2Fn>(
                resolve, "ml_engine_start_session_v2");

            // ESPlus discovery is deliberately delegated to the existing native
            // implementation. C# never resolves or calls proprietary ESPlus APIs.
            _esplusProbe = Bind<EsplusProbeFn>(resolve, "wmp_esplus_probe");
            _esplusProbeResultName = Bind<EsplusNameFn>(
                resolve, "wmp_esplus_probe_result_name");
            _esplusFamilyName = Bind<EsplusNameFn>(
                resolve, "wmp_esplus_family_name");
            _esplusClose = Bind<EsplusCloseFn>(resolve, "wmp_esplus_close");
        }

        internal string ProbeEsplus(out string family, out string report)
        {
            // This probe is for service status only. The streaming engine
            // performs its own probe and owns a separate ESPlus handle during
            // playback, so release this temporary discovery handle immediately.
            if (!_esplusProbeCached)
            {
                var bytes = new byte[2048];
                try
                {
                    _esplusProbeResult = _esplusProbe(
                        ref _esplusApi, bytes, (uint)bytes.Length);
                    _esplusReport = ReadUtf8(bytes);
                    _esplusFamily = PtrString(
                        _esplusFamilyName(_esplusApi.SelectedFamily));
                }
                finally
                {
                    _esplusClose(ref _esplusApi);
                }
                _esplusProbeCached = true;
            }

            family = _esplusFamily;
            report = _esplusReport;
            return PtrString(_esplusProbeResultName(_esplusProbeResult));
        }

        internal int ReadLastError(out string diagnostic)
        {
            var bytes = new byte[2048];
            int code = LastError(bytes, bytes.Length);
            diagnostic = ReadUtf8(bytes);
            return code;
        }

        private static T Bind<T>(Func<string, IntPtr> resolve, string name)
            where T : class
        {
            IntPtr address = resolve(name);
            if (address == IntPtr.Zero)
                throw new EntryPointNotFoundException(name);
            return (T)(object)Marshal.GetDelegateForFunctionPointer(address, typeof(T));
        }

        private static string ReadUtf8(byte[] bytes)
        {
            int length = Array.IndexOf(bytes, (byte)0);
            if (length < 0) length = bytes.Length;
            return System.Text.Encoding.UTF8.GetString(bytes, 0, length);
        }

        private static string PtrString(IntPtr value)
        {
            return value == IntPtr.Zero ? String.Empty : Marshal.PtrToStringAnsi(value);
        }
    }
}
