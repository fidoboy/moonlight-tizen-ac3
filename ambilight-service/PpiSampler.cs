using System;
using System.Diagnostics;
using System.Threading;
using TizenAmbilight;

namespace MoonlightAmbilight
{
    /// <summary>
    /// Dedicated PPI measurement thread. Native PPI calls are made only here after initialization;
    /// the WLED/render loop consumes immutable snapshots and never waits for hardware sampling.
    /// </summary>
    internal sealed class PpiSampler
    {
        private readonly object _sync = new object();
        private readonly int _spotCount;
        private readonly int[] _x;
        private readonly int[] _y;
        private readonly byte[] _rgb;
        private readonly bool[] _valid;
        private readonly long[] _updated;
        private Thread _thread;
        private volatile bool _stop;
        private int _nextBatch;
        private long _samples;
        private long _failures;
        private double _lastBatchMs;

        public int SpotCount { get { return _spotCount; } }
        public long Samples { get { lock (_sync) return _samples; } }
        public long Failures { get { lock (_sync) return _failures; } }
        public double LastBatchMs { get { lock (_sync) return _lastBatchMs; } }

        public PpiSampler(int spotCount)
        {
            if (spotCount < 4) spotCount = 4;
            if (spotCount > 48) spotCount = 48;
            _spotCount = spotCount;
            _x = new int[spotCount];
            _y = new int[spotCount];
            _rgb = new byte[spotCount * 3];
            _valid = new bool[spotCount];
            _updated = new long[spotCount];
            BuildPositions();
        }

        private void BuildPositions()
        {
            int width = PpiCapture.MeasureWidth;
            int height = PpiCapture.MeasureHeight;
            int maxX = Math.Max(0, width - PpiCapture.BlockWidth);
            int maxY = Math.Max(0, height - PpiCapture.BlockHeight);
            double perimeter = 2.0 * (width + height);
            for (int i = 0; i < _spotCount; i++)
            {
                double p = perimeter * i / _spotCount;
                double px, py;
                if (p < width) { px = p; py = 0; }
                else if ((p -= width) < height) { px = width - 1; py = p; }
                else if ((p -= height) < width) { px = width - 1 - p; py = height - 1; }
                else { p -= width; px = 0; py = height - 1 - p; }
                _x[i] = Math.Max(0, Math.Min(maxX, (int)Math.Round(px - PpiCapture.BlockWidth * 0.5)));
                _y[i] = Math.Max(0, Math.Min(maxY, (int)Math.Round(py - PpiCapture.BlockHeight * 0.5)));
            }
        }

        public void Start()
        {
            if (!PpiCapture.Ready) throw new InvalidOperationException("PPI must be initialized before starting its sampler.");
            lock (_sync)
            {
                if (_thread != null && _thread.IsAlive) return;
                _stop = false;
                _thread = new Thread(Run) { IsBackground = true, Name = "Ambilight PPI sampler" };
                _thread.Start();
            }
        }

        private void Run()
        {
            while (!_stop)
            {
                int count = Math.Min(PpiCapture.Slots, _spotCount);
                int[] bx = new int[count];
                int[] by = new int[count];
                int[] indexes = new int[count];
                for (int j = 0; j < count; j++)
                {
                    int index = (_nextBatch + j) % _spotCount;
                    indexes[j] = index;
                    bx[j] = _x[index];
                    by[j] = _y[index];
                }

                Stopwatch watch = Stopwatch.StartNew();
                try
                {
                    PpiCapture.Pixel[] pixels = PpiCapture.ReadBatch(bx, by);
                    lock (_sync)
                    {
                        for (int j = 0; j < pixels.Length; j++)
                        {
                            PpiCapture.Pixel pixel = pixels[j];
                            if (pixel.Rc < 0) { _failures++; continue; }
                            int index = indexes[j] * 3;
                            _rgb[index] = (byte)((pixel.Red10 * 255 + 511) / 1023);
                            _rgb[index + 1] = (byte)((pixel.Green10 * 255 + 511) / 1023);
                            _rgb[index + 2] = (byte)((pixel.Blue10 * 255 + 511) / 1023);
                            _valid[indexes[j]] = true;
                            _updated[indexes[j]] = Stopwatch.GetTimestamp();
                            _samples++;
                        }
                    }
                }
                catch
                {
                    lock (_sync) _failures += count;
                    Thread.Sleep(Math.Max(100, PpiCapture.SettleMs));
                }
                finally
                {
                    watch.Stop();
                    lock (_sync) _lastBatchMs = watch.Elapsed.TotalMilliseconds;
                }
                _nextBatch = (_nextBatch + count) % _spotCount;
                if (_stop) break;
                // Do not spin if native calls fail immediately; successful batches are naturally paced by settle.
                if (watch.ElapsedMilliseconds < 1) Thread.Sleep(5);
            }
        }

        /// <summary>Returns the latest spot colours and validity flags. No native calls or waits.</summary>
        public bool TrySnapshot(out byte[] rgb, out bool[] valid, out long[] updated)
        {
            lock (_sync)
            {
                rgb = (byte[])_rgb.Clone();
                valid = (bool[])_valid.Clone();
                updated = (long[])_updated.Clone();
                for (int i = 0; i < valid.Length; i++)
                    if (valid[i] && Stopwatch.GetElapsedTime(updated[i]).TotalSeconds > 2.0)
                        valid[i] = false;
                for (int i = 0; i < valid.Length; i++) if (valid[i]) return true;
                return false;
            }
        }

        public void Stop()
        {
            Thread thread;
            lock (_sync) { _stop = true; thread = _thread; _thread = null; }
            if (thread != null && thread.IsAlive && thread != Thread.CurrentThread)
                thread.Join(3000);
        }
    }
}