using System.Diagnostics;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text;
using Avalonia;
using Avalonia.OpenGL;
using Avalonia.OpenGL.Controls;
using Avalonia.Controls;

namespace MoonlightTizenInstaller;

/// <summary>
/// GPU-rendered perspective star field. All per-star projection, depth movement,
/// sizing and fading are evaluated by the vertex/fragment shaders.
/// </summary>
public sealed class StarFieldControl : OpenGlControlBase
{
    private const int StarCount = 400;
    private const float MaxDepth = 1500f;
    private const float SpeedPixelsPerSecond = 58f;

    private const uint VertexShaderType = 0x8B31;
    private const uint FragmentShaderType = 0x8B30;
    private const uint CompileStatus = 0x8B81;
    private const uint LinkStatus = 0x8B82;
    private const uint ArrayBuffer = 0x8892;
    private const uint StaticDraw = 0x88E4;
    private const uint FloatType = 0x1406;
    private const uint Points = 0x0000;
    private const uint Blend = 0x0BE2;
    private const uint SrcAlpha = 0x0302;
    private const uint OneMinusSrcAlpha = 0x0303;
    private const uint ColorBufferBit = 0x00004000;
    private const uint ProgramPointSize = 0x8642;

    private static readonly Vector3[] StarColors =
    [
        new(1.00f, 1.00f, 1.00f),
        new(1.00f, 0.87f, 0.76f),
        new(1.00f, 0.75f, 0.80f),
        new(0.68f, 0.85f, 1.00f),
        new(0.69f, 0.88f, 0.90f)
    ];

    private const string VertexShaderDesktopSource = """
        #version 120
        attribute vec3 a_position;
        attribute float a_size;
        attribute vec3 a_color;
        uniform float u_width;
        uniform float u_height;
        uniform float u_scale;
        uniform float u_time;
        varying vec3 v_color;
        varying float v_alpha;

        void main()
        {
            float z = mod(a_position.z - u_time, 1500.0);
            z = max(z, 1.0);

            // The same width-based scale on both axes keeps the field circular
            // even though the header is a wide, shallow rectangle.
            float xProjection = u_width / (2.0 * z);
            float yProjection = (u_width * u_width) / (2.0 * u_height * z);
            gl_Position = vec4(a_position.x * xProjection,
                               -a_position.y * yProjection, 0.0, 1.0);

            float radialDistance = length(a_position.xy) * u_width / (2.0 * z);
            float fade = smoothstep(0.08, 0.63, radialDistance);
            v_alpha = fade;
            v_color = a_color;

            float radius = (1.0 - z / 1500.0) * a_size * 3.2;
            gl_PointSize = max(1.0, radius * u_scale);
        }
        """;

    private const string FragmentShaderDesktopSource = """
        #version 120
        varying vec3 v_color;
        varying float v_alpha;

        void main()
        {
            float distanceFromCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
            float edge = 1.0 - smoothstep(0.55, 1.0, distanceFromCenter);
            float alpha = v_alpha * edge * 0.95;
            if (alpha < 0.01)
                discard;
            gl_FragColor = vec4(v_color, alpha);
        }
        """;

    private readonly Random _random = new();
    private readonly float[] _vertices;
    private GlFunctions? _gl;
    private uint _program;
    private uint _vertexBuffer;
    private uint _vertexArray;
    private int _widthUniform;
    private int _heightUniform;
    private int _scaleUniform;
    private int _timeUniform;
    private bool _isOpenGles;
    private long _startTimestamp;

    public StarFieldControl()
    {
        _vertices = CreateStarVertices();
        IsHitTestVisible = false;
        ClipToBounds = true;
    }

    private float[] CreateStarVertices()
    {
        // Interleaved attributes: normalized X/Y, initial depth, size, RGB.
        var data = new float[StarCount * 7];
        for (var i = 0; i < StarCount; i++)
        {
            var angle = _random.NextDouble() * Math.PI * 2.0;
            var radialPosition = 0.22 + 0.78 * Math.Sqrt(_random.NextDouble());
            var offset = i * 7;

            data[offset] = (float)(Math.Cos(angle) * radialPosition);
            data[offset + 1] = (float)(Math.Sin(angle) * radialPosition);
            data[offset + 2] = (float)(_random.NextDouble() * MaxDepth);
            data[offset + 3] = 0.20f + (float)(1.0 - radialPosition) * 0.12f;

            var color = StarColors[_random.Next(StarColors.Length)];
            data[offset + 4] = color.X;
            data[offset + 5] = color.Y;
            data[offset + 6] = color.Z;
        }

        return data;
    }

    protected override void OnOpenGlInit(GlInterface gl)
    {
        _gl = new GlFunctions(gl);
        var (vertexSource, fragmentSource) = GetShaderSources(GlVersion);
        _isOpenGles = GlVersion.Type == GlProfileType.OpenGLES;
        _program = CreateProgram(_gl, vertexSource, fragmentSource);

        if ((GlVersion.Type == GlProfileType.OpenGL && GlVersion.Major >= 3 && !GlVersion.IsCompatibilityProfile) ||
            (GlVersion.Type == GlProfileType.OpenGLES && GlVersion.Major >= 3))
        {
            _gl.GenVertexArrays(1, out _vertexArray);
            _gl.BindVertexArray(_vertexArray);
        }
        _widthUniform = _gl.GetUniformLocation(_program, "u_width");
        _heightUniform = _gl.GetUniformLocation(_program, "u_height");
        _scaleUniform = _gl.GetUniformLocation(_program, "u_scale");
        _timeUniform = _gl.GetUniformLocation(_program, "u_time");

        _gl.GenBuffers(1, out _vertexBuffer);
        _gl.BindBuffer(ArrayBuffer, _vertexBuffer);

        var handle = GCHandle.Alloc(_vertices, GCHandleType.Pinned);
        try
        {
            _gl.BufferData(ArrayBuffer, new IntPtr(_vertices.Length * sizeof(float)),
                handle.AddrOfPinnedObject(), StaticDraw);
        }
        finally
        {
            handle.Free();
        }

        _startTimestamp = Stopwatch.GetTimestamp();
    }

    protected override void OnOpenGlRender(GlInterface gl, int fb)
    {
        if (_gl is null || _program == 0 || Bounds.Width <= 0 || Bounds.Height <= 0)
            return;

        var scale = TopLevel.GetTopLevel(this)?.RenderScaling ?? 1.0;
        var pixelWidth = Math.Max(1, (int)Math.Ceiling(Bounds.Width * scale));
        var pixelHeight = Math.Max(1, (int)Math.Ceiling(Bounds.Height * scale));

        _gl.Viewport(0, 0, pixelWidth, pixelHeight);
        _gl.ClearColor(0f, 0f, 0f, 0f);
        _gl.Clear(ColorBufferBit);
        if (!_isOpenGles)
            _gl.Enable(ProgramPointSize);
        _gl.Enable(Blend);
        _gl.BlendFunc(SrcAlpha, OneMinusSrcAlpha);

        _gl.UseProgram(_program);
        _gl.Uniform1f(_widthUniform, pixelWidth);
        _gl.Uniform1f(_heightUniform, pixelHeight);
        _gl.Uniform1f(_scaleUniform, (float)scale);

        var elapsedSeconds = (Stopwatch.GetTimestamp() - _startTimestamp) /
            (double)Stopwatch.Frequency;
        _gl.Uniform1f(_timeUniform, (float)(elapsedSeconds * SpeedPixelsPerSecond));

        _gl.BindBuffer(ArrayBuffer, _vertexBuffer);
        if (_vertexArray != 0)
            _gl.BindVertexArray(_vertexArray);

        var stride = 7 * sizeof(float);
        var position = _gl.GetAttribLocation(_program, "a_position");
        var size = _gl.GetAttribLocation(_program, "a_size");
        var color = _gl.GetAttribLocation(_program, "a_color");

        _gl.EnableVertexAttribArray((uint)position);
        _gl.VertexAttribPointer((uint)position, 3, FloatType, false, stride, IntPtr.Zero);
        _gl.EnableVertexAttribArray((uint)size);
        _gl.VertexAttribPointer((uint)size, 1, FloatType, false, stride,
            new IntPtr(3 * sizeof(float)));
        _gl.EnableVertexAttribArray((uint)color);
        _gl.VertexAttribPointer((uint)color, 3, FloatType, false, stride,
            new IntPtr(4 * sizeof(float)));

        _gl.DrawArrays(Points, 0, StarCount);

        _gl.DisableVertexAttribArray((uint)position);
        _gl.DisableVertexAttribArray((uint)size);
        _gl.DisableVertexAttribArray((uint)color);

        // Keep the animation running only while the control is attached and rendered.
        RequestNextFrameRendering();
    }

    protected override void OnOpenGlDeinit(GlInterface gl)
    {
        if (_gl is not { } functions)
            return;

        if (_vertexBuffer != 0)
            functions.DeleteBuffers(1, ref _vertexBuffer);
        if (_vertexArray != 0)
            functions.DeleteVertexArrays(1, ref _vertexArray);
        if (_program != 0)
            functions.DeleteProgram(_program);

        _vertexBuffer = 0;
        _vertexArray = 0;
        _program = 0;
        _gl = null;
    }

    protected override void OnOpenGlLost()
    {
        _vertexBuffer = 0;
        _program = 0;
        _gl = null;
    }

    private static (string Vertex, string Fragment) GetShaderSources(GlVersion version)
    {
        if (version.Type == GlProfileType.OpenGLES && version.Major >= 3)
        {
            return (VertexShaderDesktopSource.Replace("#version 120", "#version 300 es")
                        .Replace("attribute ", "in ").Replace("varying ", "out ")
                        .Replace("#version 300 es", "        #version 300 es\n        precision highp float;"),
                    FragmentShaderDesktopSource.Replace("#version 120", "#version 300 es")
                        .Replace("varying ", "in ")
                        .Replace("#version 300 es", "        #version 300 es\n        precision mediump float;")
                        .Replace("void main()", "out vec4 fragmentColor;\n        void main()")
                        .Replace("gl_FragColor", "fragmentColor"));
        }

        if (version.Type == GlProfileType.OpenGLES)
        {
            return (VertexShaderDesktopSource.Replace("#version 120", "#version 100")
                        .Replace("#version 100", "        #version 100\n        precision highp float;"),
                    FragmentShaderDesktopSource.Replace("#version 120", "#version 100")
                        .Replace("#version 100", "        #version 100\n        precision mediump float;"));
        }

        if (version.Major >= 3 && !version.IsCompatibilityProfile)
        {
            return (VertexShaderDesktopSource.Replace("#version 120", "#version 130")
                        .Replace("attribute ", "in ").Replace("varying ", "out "),
                    FragmentShaderDesktopSource.Replace("#version 120", "#version 130")
                        .Replace("varying ", "in ")
                        .Replace("void main()", "out vec4 fragmentColor;\n        void main()")
                        .Replace("gl_FragColor", "fragmentColor"));
        }

        return (VertexShaderDesktopSource, FragmentShaderDesktopSource);
    }

    private static uint CreateProgram(GlFunctions gl, string vertexSource, string fragmentSource)
    {
        var vertexShader = CompileShader(gl, VertexShaderType, vertexSource);
        var fragmentShader = CompileShader(gl, FragmentShaderType, fragmentSource);
        var program = gl.CreateProgram();

        gl.AttachShader(program, vertexShader);
        gl.AttachShader(program, fragmentShader);
        gl.LinkProgram(program);
        gl.GetProgramiv(program, LinkStatus, out var linked);

        gl.DeleteShader(vertexShader);
        gl.DeleteShader(fragmentShader);

        if (linked == 0)
        {
            var log = gl.GetProgramInfoLog(program);
            gl.DeleteProgram(program);
            throw new InvalidOperationException($"Unable to link star-field shaders: {log}");
        }

        return program;
    }

    private static uint CompileShader(GlFunctions gl, uint type, string source)
    {
        var shader = gl.CreateShader(type);
        var sourcePointer = Marshal.StringToCoTaskMemUTF8(source);
        var sourceArray = Marshal.AllocHGlobal(IntPtr.Size);

        try
        {
            Marshal.WriteIntPtr(sourceArray, sourcePointer);
            gl.ShaderSource(shader, 1, sourceArray, IntPtr.Zero);
            gl.CompileShader(shader);
            gl.GetShaderiv(shader, CompileStatus, out var compiled);

            if (compiled == 0)
            {
                var log = gl.GetShaderInfoLog(shader);
                gl.DeleteShader(shader);
                throw new InvalidOperationException($"Unable to compile star-field shader: {log}");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(sourceArray);
            Marshal.FreeCoTaskMem(sourcePointer);
        }

        return shader;
    }

    private sealed class GlFunctions
    {
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate uint CreateShaderDelegate(uint type);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ShaderSourceDelegate(uint shader, int count, IntPtr strings, IntPtr lengths);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ShaderDelegate(uint shader);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GetShaderivDelegate(uint shader, uint name, out int value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GetShaderInfoLogDelegate(uint shader, int capacity, out int length, StringBuilder log);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate uint CreateProgramDelegate();
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void AttachShaderDelegate(uint program, uint shader);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ProgramDelegate(uint program);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GetProgramivDelegate(uint program, uint name, out int value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GetProgramInfoLogDelegate(uint program, int capacity, out int length, StringBuilder log);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate int GetLocationDelegate(uint program, [MarshalAs(UnmanagedType.LPStr)] string name);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GenBuffersDelegate(int count, out uint buffer);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void GenVertexArraysDelegate(int count, out uint array);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void BindVertexArrayDelegate(uint array);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void DeleteVertexArraysDelegate(int count, ref uint array);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void DeleteBuffersDelegate(int count, ref uint buffer);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void BindBufferDelegate(uint target, uint buffer);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void BufferDataDelegate(uint target, IntPtr size, IntPtr data, uint usage);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void EnableVertexAttribArrayDelegate(uint index);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void VertexAttribPointerDelegate(uint index, int size, uint type, [MarshalAs(UnmanagedType.I1)] bool normalized, int stride, IntPtr pointer);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void Uniform1fDelegate(int location, float value);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ViewportDelegate(int x, int y, int width, int height);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ClearColorDelegate(float red, float green, float blue, float alpha);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void ClearDelegate(uint mask);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void EnableDelegate(uint capability);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void BlendFuncDelegate(uint source, uint destination);
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] private delegate void DrawArraysDelegate(uint mode, int first, int count);

        private readonly CreateShaderDelegate _createShader;
        private readonly ShaderSourceDelegate _shaderSource;
        private readonly ShaderDelegate _compileShader;
        private readonly GetShaderivDelegate _getShaderiv;
        private readonly GetShaderInfoLogDelegate _getShaderInfoLog;
        private readonly ShaderDelegate _deleteShader;
        private readonly CreateProgramDelegate _createProgram;
        private readonly AttachShaderDelegate _attachShader;
        private readonly ProgramDelegate _linkProgram;
        private readonly GetProgramivDelegate _getProgramiv;
        private readonly GetProgramInfoLogDelegate _getProgramInfoLog;
        private readonly ProgramDelegate _deleteProgram;
        private readonly ProgramDelegate _useProgram;
        private readonly GetLocationDelegate _getUniformLocation;
        private readonly GetLocationDelegate _getAttribLocation;
        private readonly GenBuffersDelegate _genBuffers;
        private readonly GenVertexArraysDelegate? _genVertexArrays;
        private readonly BindVertexArrayDelegate? _bindVertexArray;
        private readonly DeleteVertexArraysDelegate? _deleteVertexArrays;
        private readonly DeleteBuffersDelegate _deleteBuffers;
        private readonly BindBufferDelegate _bindBuffer;
        private readonly BufferDataDelegate _bufferData;
        private readonly EnableVertexAttribArrayDelegate _enableVertexAttribArray;
        private readonly EnableVertexAttribArrayDelegate _disableVertexAttribArray;
        private readonly VertexAttribPointerDelegate _vertexAttribPointer;
        private readonly Uniform1fDelegate _uniform1f;
        private readonly ViewportDelegate _viewport;
        private readonly ClearColorDelegate _clearColor;
        private readonly ClearDelegate _clear;
        private readonly EnableDelegate _enable;
        private readonly BlendFuncDelegate _blendFunc;
        private readonly DrawArraysDelegate _drawArrays;

        public GlFunctions(GlInterface gl)
        {
            _createShader = Load<CreateShaderDelegate>(gl, "glCreateShader");
            _shaderSource = Load<ShaderSourceDelegate>(gl, "glShaderSource");
            _compileShader = Load<ShaderDelegate>(gl, "glCompileShader");
            _getShaderiv = Load<GetShaderivDelegate>(gl, "glGetShaderiv");
            _getShaderInfoLog = Load<GetShaderInfoLogDelegate>(gl, "glGetShaderInfoLog");
            _deleteShader = Load<ShaderDelegate>(gl, "glDeleteShader");
            _createProgram = Load<CreateProgramDelegate>(gl, "glCreateProgram");
            _attachShader = Load<AttachShaderDelegate>(gl, "glAttachShader");
            _linkProgram = Load<ProgramDelegate>(gl, "glLinkProgram");
            _getProgramiv = Load<GetProgramivDelegate>(gl, "glGetProgramiv");
            _getProgramInfoLog = Load<GetProgramInfoLogDelegate>(gl, "glGetProgramInfoLog");
            _deleteProgram = Load<ProgramDelegate>(gl, "glDeleteProgram");
            _useProgram = Load<ProgramDelegate>(gl, "glUseProgram");
            _getUniformLocation = Load<GetLocationDelegate>(gl, "glGetUniformLocation");
            _getAttribLocation = Load<GetLocationDelegate>(gl, "glGetAttribLocation");
            _genBuffers = Load<GenBuffersDelegate>(gl, "glGenBuffers");
            _genVertexArrays = TryLoad<GenVertexArraysDelegate>(gl, "glGenVertexArrays");
            _bindVertexArray = TryLoad<BindVertexArrayDelegate>(gl, "glBindVertexArray");
            _deleteVertexArrays = TryLoad<DeleteVertexArraysDelegate>(gl, "glDeleteVertexArrays");
            _deleteBuffers = Load<DeleteBuffersDelegate>(gl, "glDeleteBuffers");
            _bindBuffer = Load<BindBufferDelegate>(gl, "glBindBuffer");
            _bufferData = Load<BufferDataDelegate>(gl, "glBufferData");
            _enableVertexAttribArray = Load<EnableVertexAttribArrayDelegate>(gl, "glEnableVertexAttribArray");
            _disableVertexAttribArray = Load<EnableVertexAttribArrayDelegate>(gl, "glDisableVertexAttribArray");
            _vertexAttribPointer = Load<VertexAttribPointerDelegate>(gl, "glVertexAttribPointer");
            _uniform1f = Load<Uniform1fDelegate>(gl, "glUniform1f");
            _viewport = Load<ViewportDelegate>(gl, "glViewport");
            _clearColor = Load<ClearColorDelegate>(gl, "glClearColor");
            _clear = Load<ClearDelegate>(gl, "glClear");
            _enable = Load<EnableDelegate>(gl, "glEnable");
            _blendFunc = Load<BlendFuncDelegate>(gl, "glBlendFunc");
            _drawArrays = Load<DrawArraysDelegate>(gl, "glDrawArrays");
        }

        private static T? TryLoad<T>(GlInterface gl, string name) where T : Delegate
        {
            var address = gl.GetProcAddress(name);
            return address == IntPtr.Zero ? null : Marshal.GetDelegateForFunctionPointer<T>(address);
        }

        private static T Load<T>(GlInterface gl, string name) where T : Delegate
        {
            var address = gl.GetProcAddress(name);
            if (address == IntPtr.Zero)
                throw new NotSupportedException($"OpenGL function {name} is unavailable.");
            return Marshal.GetDelegateForFunctionPointer<T>(address);
        }

        public uint CreateShader(uint type) => _createShader(type);
        public void ShaderSource(uint shader, int count, IntPtr strings, IntPtr lengths) => _shaderSource(shader, count, strings, lengths);
        public void CompileShader(uint shader) => _compileShader(shader);
        public void GetShaderiv(uint shader, uint name, out int value) => _getShaderiv(shader, name, out value);
        public string GetShaderInfoLog(uint shader) { var b = new StringBuilder(2048); _getShaderInfoLog(shader, b.Capacity, out _, b); return b.ToString(); }
        public void DeleteShader(uint shader) => _deleteShader(shader);
        public uint CreateProgram() => _createProgram();
        public void AttachShader(uint program, uint shader) => _attachShader(program, shader);
        public void LinkProgram(uint program) => _linkProgram(program);
        public void GetProgramiv(uint program, uint name, out int value) => _getProgramiv(program, name, out value);
        public string GetProgramInfoLog(uint program) { var b = new StringBuilder(2048); _getProgramInfoLog(program, b.Capacity, out _, b); return b.ToString(); }
        public void DeleteProgram(uint program) => _deleteProgram(program);
        public void UseProgram(uint program) => _useProgram(program);
        public int GetUniformLocation(uint program, string name) => _getUniformLocation(program, name);
        public int GetAttribLocation(uint program, string name) => _getAttribLocation(program, name);
        public void GenBuffers(int count, out uint buffer) => _genBuffers(count, out buffer);
        public void GenVertexArrays(int count, out uint array)
        {
            if (_genVertexArrays is null)
                throw new NotSupportedException("Vertex array objects are unavailable.");
            _genVertexArrays(count, out array);
        }
        public void BindVertexArray(uint array) => _bindVertexArray?.Invoke(array);
        public void DeleteVertexArrays(int count, ref uint array) => _deleteVertexArrays?.Invoke(count, ref array);
        public void DeleteBuffers(int count, ref uint buffer) => _deleteBuffers(count, ref buffer);
        public void BindBuffer(uint target, uint buffer) => _bindBuffer(target, buffer);
        public void BufferData(uint target, IntPtr size, IntPtr data, uint usage) => _bufferData(target, size, data, usage);
        public void EnableVertexAttribArray(uint index) => _enableVertexAttribArray(index);
        public void DisableVertexAttribArray(uint index) => _disableVertexAttribArray(index);
        public void VertexAttribPointer(uint index, int size, uint type, bool normalized, int stride, IntPtr pointer) => _vertexAttribPointer(index, size, type, normalized, stride, pointer);
        public void Uniform1f(int location, float value) => _uniform1f(location, value);
        public void Viewport(int x, int y, int width, int height) => _viewport(x, y, width, height);
        public void ClearColor(float red, float green, float blue, float alpha) => _clearColor(red, green, blue, alpha);
        public void Clear(uint mask) => _clear(mask);
        public void Enable(uint capability) => _enable(capability);
        public void BlendFunc(uint source, uint destination) => _blendFunc(source, destination);
        public void DrawArrays(uint mode, int first, int count) => _drawArrays(mode, first, count);
    }
}
