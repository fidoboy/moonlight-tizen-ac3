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
        internal delegate int RunningFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void StopFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate void SetDolbyPassthroughFn(int enabled);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int ActiveAudioCodecFn();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int GetStatsFn(ref Stats stats);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int LastErrorFn(byte[] buffer, int capacity);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal delegate int StartSessionV2Fn(
            string host, int width, int height, int fps, int bitrateKbps,
            string rikeyHex, int rikeyId, string appVersion, string gfeVersion,
            string rtspUrl, int codecMode, string videoCodec, int hdr,
            string audioConfig, int fullRange);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate int EsplusProbeFn(ref EsplusApi api, byte[] report, uint capacity);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate IntPtr EsplusNameFn(int value);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate void EsplusCloseFn(ref EsplusApi api);

        internal readonly RunningFn Running;
        internal readonly StopFn Stop;
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
        private bool _esplusProbed;
        private int _esplusProbeResult;
        private string _esplusFamily = String.Empty;
        private string _esplusReport = String.Empty;

        // resolve must resolve symbols from the loaded libmlengine image, including
        // symbols in the manually mapped ELF image. No direct DllImport is used.
        internal EngineApi(Func<string, IntPtr> resolve)
        {
            if (resolve == null) throw new ArgumentNullException("resolve");

            Running = Bind<RunningFn>(resolve, "ml_engine_running");
            Stop = Bind<StopFn>(resolve, "ml_engine_stop");
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
            // Keep the dlopen handle alive for the entire host process. The
            // engine's ESPlus adapter resolves and calls these exports during
            // playback; closing the handle immediately after probing would
            // invalidate the native player's function pointers.
            if (!_esplusProbed)
            {
                var bytes = new byte[2048];
                _esplusProbeResult = _esplusProbe(
                    ref _esplusApi, bytes, (uint)bytes.Length);
                _esplusReport = ReadUtf8(bytes);
                _esplusFamily = PtrString(
                    _esplusFamilyName(_esplusApi.SelectedFamily));
                _esplusProbed = true;
            }

            family = _esplusFamily;
            report = _esplusReport;
            return PtrString(_esplusProbeResultName(_esplusProbeResult));
        }

        internal void CloseEsplus()
        {
            if (!_esplusProbed)
                return;

            // Called only after ml_engine_stop() has completed.
            _esplusClose(ref _esplusApi);
            _esplusProbed = false;
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
