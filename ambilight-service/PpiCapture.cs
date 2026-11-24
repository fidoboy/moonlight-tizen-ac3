using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace TizenAmbilight
{
    /// <summary>
    /// Isolated access to Samsung's video-enhancement RGB measurement API.
    /// This class does not select a capture backend and is never called by the
    /// video-plane capture loop. Every native operation is serialized by Gate.
    /// </summary>
    public static class PpiCapture
    {
        public const string BackendName = "ppi";
        private const string LibraryPath = "/usr/lib/libvideoenhance.so";
        private const int BufferBytes = 256;
        private const int RtldLazy = 1;
        private const int MaxSlots = 16;
        private const int MinSettleMs = 1;
        private const int MaxSettleMs = 100;

        private static readonly object Gate = new object();
        private static readonly byte[] ZeroBuffer = new byte[BufferBytes];
        private static readonly string[] Families = { "ppi_ve", "ve", "cs_ve" };

        [DllImport("libdl.so.2", EntryPoint = "dlopen", CharSet = CharSet.Ansi)]
        private static extern IntPtr Dlopen(string filename, int flags);
        [DllImport("libdl.so.2", EntryPoint = "dlsym", CharSet = CharSet.Ansi)]
        private static extern IntPtr Dlsym(IntPtr handle, string symbol);
        [DllImport("libdl.so.2", EntryPoint = "dlerror")]
        private static extern IntPtr Dlerror();
        [DllImport("libdl.so.2", EntryPoint = "dlclose")]
        private static extern int Dlclose(IntPtr handle);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate int ConditionFn(IntPtr condition);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate int SetPositionFn(int slot, int x, int y);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        private delegate int GetPixelFn(int slot, IntPtr color);

        private static IntPtr _library = IntPtr.Zero;
        private static IntPtr _conditionBuffer = IntPtr.Zero;
        private static IntPtr _colorBuffer = IntPtr.Zero;
        private static ConditionFn _condition;
        private static SetPositionFn _setPosition;
        private static GetPixelFn _getPixel;

        public static string Family { get; private set; } = "";
        public static string LibraryError { get; private set; } = "";
        public static string InitError { get; private set; } = "";
        public static int ConditionRc { get; private set; } = Int32.MinValue;
        public static int Slots { get; private set; }
        public static int BlockWidth { get; private set; }
        public static int BlockHeight { get; private set; }
        public static int SettleMsReported { get; private set; }
        public static int SettleMs { get; private set; }
        public static int MeasureWidth { get; private set; }
        public static int MeasureHeight { get; private set; }
        public static bool Ready { get { lock (Gate) return _condition != null && _setPosition != null && _getPixel != null; } }

        public sealed class Pixel
        {
            public int Rc;
            public int PositionRc;
            public int Red10;
            public int Green10;
            public int Blue10;
            public int LowInputLag;
            public int Slot;
            public int X;
            public int Y;
            public double ElapsedMs;
        }

        /// <summary>Loads the library, resolves one complete symbol family and queries capabilities.
        /// It does not arm a measurement slot or alter the active video-plane backend.</summary>
        public static string Init()
        {
            lock (Gate)
            {
                if (_condition != null && _setPosition != null && _getPixel != null)
                    return null;

                ShutdownLocked();
                InitError = "";
                LibraryError = "";
                Family = "";

                try
                {
                    ClearDlError();
                    _library = Dlopen(LibraryPath, RtldLazy);
                    if (_library == IntPtr.Zero)
                    {
                        LibraryError = ReadDlError();
                        ClearDlError();
                        _library = Dlopen("libvideoenhance.so", RtldLazy);
                        if (_library == IntPtr.Zero)
                        {
                            string second = ReadDlError();
                            return Fail("dlopen libvideoenhance.so failed: " +
                                (String.IsNullOrEmpty(second) ? LibraryError : second));
                        }
                    }

                    IntPtr conditionPtr = IntPtr.Zero;
                    IntPtr positionPtr = IntPtr.Zero;
                    IntPtr pixelPtr = IntPtr.Zero;
                    string exports = "";
                    foreach (string family in Families)
                    {
                        ClearDlError();
                        IntPtr c = Dlsym(_library, family + "_get_rgb_measure_condition");
                        string ce = ReadDlError();
                        ClearDlError();
                        IntPtr p = Dlsym(_library, family + "_set_rgb_measure_position");
                        string pe = ReadDlError();
                        ClearDlError();
                        IntPtr x = Dlsym(_library, family + "_get_rgb_measure_pixel");
                        string xe = ReadDlError();

                        exports += family + "=" + (c != IntPtr.Zero) + "/" +
                                   (p != IntPtr.Zero) + "/" + (x != IntPtr.Zero) + " ";
                        if (c != IntPtr.Zero && p != IntPtr.Zero && x != IntPtr.Zero)
                        {
                            conditionPtr = c;
                            positionPtr = p;
                            pixelPtr = x;
                            Family = family;
                            break;
                        }
                        if (!String.IsNullOrEmpty(ce)) LibraryError = ce;
                        if (!String.IsNullOrEmpty(pe)) LibraryError = pe;
                        if (!String.IsNullOrEmpty(xe)) LibraryError = xe;
                    }

                    if (Family.Length == 0)
                        return Fail("no complete PPI symbol family found (" + exports.Trim() + ")" +
                            (String.IsNullOrEmpty(LibraryError) ? "" : "; " + LibraryError));

                    _conditionBuffer = Marshal.AllocHGlobal(BufferBytes);
                    _colorBuffer = Marshal.AllocHGlobal(BufferBytes);
                    if (_conditionBuffer == IntPtr.Zero || _colorBuffer == IntPtr.Zero)
                        return Fail("PPI output-buffer allocation failed");

                    Marshal.Copy(ZeroBuffer, 0, _conditionBuffer, BufferBytes);
                    Marshal.Copy(ZeroBuffer, 0, _colorBuffer, BufferBytes);

                    ConditionFn condition = (ConditionFn)Marshal.GetDelegateForFunctionPointer(
                        conditionPtr, typeof(ConditionFn));
                    SetPositionFn setPosition = (SetPositionFn)Marshal.GetDelegateForFunctionPointer(
                        positionPtr, typeof(SetPositionFn));
                    GetPixelFn getPixel = (GetPixelFn)Marshal.GetDelegateForFunctionPointer(
                        pixelPtr, typeof(GetPixelFn));

                    ConditionRc = condition(_conditionBuffer);
                    Slots = Marshal.ReadInt32(_conditionBuffer, 0);
                    BlockWidth = Marshal.ReadInt32(_conditionBuffer, 4);
                    BlockHeight = Marshal.ReadInt32(_conditionBuffer, 8);
                    SettleMsReported = Marshal.ReadInt32(_conditionBuffer, 12);
                    MeasureWidth = Marshal.ReadInt32(_conditionBuffer, 16);
                    MeasureHeight = Marshal.ReadInt32(_conditionBuffer, 20);

                    if (ConditionRc < 0)
                        return Fail(Family + "_get_rgb_measure_condition rc=" + ConditionRc);
                    if (Slots <= 0 || Slots > MaxSlots ||
                        BlockWidth <= 0 || BlockHeight <= 0 ||
                        MeasureWidth <= 0 || MeasureHeight <= 0 ||
                        SettleMsReported < 0)
                        return Fail("implausible PPI condition: slots=" + Slots +
                            " block=" + BlockWidth + "x" + BlockHeight +
                            " settle=" + SettleMsReported +
                            " measure=" + MeasureWidth + "x" + MeasureHeight);

                    SettleMs = Math.Max(MinSettleMs, Math.Min(MaxSettleMs, SettleMsReported));
                    _condition = condition;
                    _setPosition = setPosition;
                    _getPixel = getPixel;
                    InitError = "";
                    return null;
                }
                catch (Exception ex)
                {
                    return Fail(ex.GetType().Name + ": " + ex.Message);
                }
            }
        }

        /// <summary>Arms one TV-reported slot, waits the TV-reported settle interval, and reads
        /// its mean 10-bit RGB value. Calls are synchronous and serialized; callers must not
        /// invoke this from a render loop.</summary>
        public static Pixel Read(int slot, int x, int y)
        {
            lock (Gate)
            {
                Pixel result = new Pixel { Slot = slot, X = x, Y = y, Rc = -1 };
                if (_condition == null || _setPosition == null || _getPixel == null)
                {
                    result.Rc = -1000;
                    return result;
                }
                if (slot < 0 || slot >= Slots)
                {
                    result.Rc = -1001;
                    return result;
                }
                if (x < 0 || y < 0 || x >= MeasureWidth || y >= MeasureHeight)
                {
                    result.Rc = -1002;
                    return result;
                }

                var watch = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    result.PositionRc = _setPosition(slot, x, y);
                    if (result.PositionRc < 0)
                    {
                        result.Rc = result.PositionRc;
                        return result;
                    }

                    Thread.Sleep(SettleMs);
                    Marshal.Copy(ZeroBuffer, 0, _colorBuffer, BufferBytes);
                    result.Rc = _getPixel(slot, _colorBuffer);
                    if (result.Rc < 0) return result;

                    result.Red10 = Marshal.ReadInt32(_colorBuffer, 0);
                    result.Green10 = Marshal.ReadInt32(_colorBuffer, 4);
                    result.Blue10 = Marshal.ReadInt32(_colorBuffer, 8);
                    result.LowInputLag = Marshal.ReadInt32(_colorBuffer, 12);
                    if (result.Red10 < 0 || result.Red10 > 1023 ||
                        result.Green10 < 0 || result.Green10 > 1023 ||
                        result.Blue10 < 0 || result.Blue10 > 1023)
                        result.Rc = -1003;
                    return result;
                }
                catch
                {
                    result.Rc = -1004;
                    throw;
                }
                finally
                {
                    watch.Stop();
                    result.ElapsedMs = watch.Elapsed.TotalMilliseconds;
                }
            }
        }

        /// <summary>Arms up to Slots positions, waits once for the hardware settle interval,
        /// then reads every armed slot. This is the continuous sampler's efficient path.</summary>
        public static Pixel[] ReadBatch(int[] x, int[] y)
        {
            if (x == null || y == null || x.Length != y.Length || x.Length == 0 || x.Length > Slots)
                throw new ArgumentException("PPI batch must contain 1..Slots matching coordinates.");
            lock (Gate)
            {
                if (_condition == null || _setPosition == null || _getPixel == null)
                    throw new InvalidOperationException("PPI is not initialized.");
                Pixel[] result = new Pixel[x.Length];
                for (int i = 0; i < x.Length; i++)
                {
                    result[i] = new Pixel { Slot = i, X = x[i], Y = y[i], Rc = -1 };
                    if (x[i] < 0 || y[i] < 0 || x[i] >= MeasureWidth || y[i] >= MeasureHeight)
                    { result[i].Rc = -1002; return result; }
                    result[i].PositionRc = _setPosition(i, x[i], y[i]);
                    if (result[i].PositionRc < 0)
                    { result[i].Rc = result[i].PositionRc; return result; }
                }
                Thread.Sleep(SettleMs);
                for (int i = 0; i < x.Length; i++)
                {
                    var watch = System.Diagnostics.Stopwatch.StartNew();
                    try
                    {
                        Marshal.Copy(ZeroBuffer, 0, _colorBuffer, BufferBytes);
                        result[i].Rc = _getPixel(i, _colorBuffer);
                        if (result[i].Rc >= 0)
                        {
                            result[i].Red10 = Marshal.ReadInt32(_colorBuffer, 0);
                            result[i].Green10 = Marshal.ReadInt32(_colorBuffer, 4);
                            result[i].Blue10 = Marshal.ReadInt32(_colorBuffer, 8);
                            result[i].LowInputLag = Marshal.ReadInt32(_colorBuffer, 12);
                            if (result[i].Red10 < 0 || result[i].Red10 > 1023 ||
                                result[i].Green10 < 0 || result[i].Green10 > 1023 ||
                                result[i].Blue10 < 0 || result[i].Blue10 > 1023)
                                result[i].Rc = -1003;
                        }
                    }
                    finally { watch.Stop(); result[i].ElapsedMs = watch.Elapsed.TotalMilliseconds; }
                }
                return result;
            }
        }

        public static string Describe()
        {
            lock (Gate)
            {
                if (_condition == null)
                    return "ready=false error=" + (String.IsNullOrEmpty(InitError) ? "not initialized" : InitError);
                return "ready=true family=" + Family + " slots=" + Slots +
                    " block=" + BlockWidth + "x" + BlockHeight +
                    " settle=" + SettleMs + "ms (reported " + SettleMsReported + "ms)" +
                    " measure=" + MeasureWidth + "x" + MeasureHeight;
            }
        }

        public static void Shutdown()
        {
            lock (Gate) ShutdownLocked();
        }

        private static string Fail(string error)
        {
            InitError = error;
            ShutdownLocked();
            InitError = error;
            return error;
        }

        private static void ShutdownLocked()
        {
            _condition = null;
            _setPosition = null;
            _getPixel = null;
            foreach (IntPtr buffer in new[] { _conditionBuffer, _colorBuffer })
                if (buffer != IntPtr.Zero)
                {
                    try { Marshal.FreeHGlobal(buffer); } catch { }
                }
            _conditionBuffer = _colorBuffer = IntPtr.Zero;
            if (_library != IntPtr.Zero)
            {
                try { Dlclose(_library); } catch { }
                _library = IntPtr.Zero;
            }
            Family = "";
            Slots = BlockWidth = BlockHeight = SettleMs = SettleMsReported = 0;
            MeasureWidth = MeasureHeight = 0;
        }

        private static void ClearDlError() { try { Dlerror(); } catch { } }
        private static string ReadDlError()
        {
            try
            {
                IntPtr error = Dlerror();
                return error == IntPtr.Zero ? "" : Marshal.PtrToStringAnsi(error);
            }
            catch { return ""; }
        }
    }
}