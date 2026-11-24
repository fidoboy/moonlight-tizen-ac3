using System;
using TizenAmbilight;

namespace MoonlightAmbilight
{
    internal static class WledOutput
    {
        public const int MaxLeds = 490;
        private const byte Drgb = 0x02;
        private const double ZoneDepth = 0.08;
        private const double TemporalAlpha = 0.38;

        private static byte[] _previous;
        private static int _previousLedCount;

        public static void Reset()
        {
            _previous = null;
            _previousLedCount = 0;
        }

        // Compatibility overload: SDR Rec.709 limited range.
        public static byte[] BuildFrame(VideoPlaneResult frame, int ledCount)
        {
            return BuildFrame(frame, ledCount, false, 1, false);
        }

        public static byte[] BuildFrame(VideoPlaneResult frame, int ledCount,
                                        bool hdr, int colorSpace, bool fullRange)
        {
            if (frame == null || !frame.HasFrame || frame.W < 1 || frame.H < 1 ||
                frame.Y == null || frame.C == null)
                return new byte[2];

            if (ledCount < 1) ledCount = 1;
            if (ledCount > MaxLeds) ledCount = MaxLeds;

            int width = frame.W;
            int height = frame.H;
            int yStride = frame.YStride > 0 ? frame.YStride : width;
            int cStride = frame.CStride > 0 ? frame.CStride : width;
            int left, top, right, bottom;
            DetectActiveArea(frame.Y, width, height, yStride, fullRange,
                             out left, out top, out right, out bottom);

            byte[] packet = new byte[2 + ledCount * 3];
            packet[0] = Drgb;
            packet[1] = 1;

            if (_previous == null || _previousLedCount != ledCount)
            {
                _previous = new byte[ledCount * 3];
                _previousLedCount = ledCount;
            }

            for (int led = 0; led < ledCount; led++)
            {
                double t = (double)led / ledCount;
                int x, y;
                PerimeterPoint(t, left, top, right, bottom, out x, out y);

                int yMean, uMean, vMean;
                SampleZone(frame, x, y, left, top, right, bottom,
                           yStride, cStride, out yMean, out uMean, out vMean);

                byte r, g, b;
                VideoPlaneCapture.YuvToRgb(
                    yMean, uMean, vMean,
                    1.0, 1.0, 1.0, 1.0,
                    hdr, hdr && colorSpace == 2, fullRange, colorSpace,
                    out r, out g, out b);

                int o = led * 3;
                if (_previousLedCount == ledCount && _previous[o] + _previous[o + 1] + _previous[o + 2] != 0)
                {
                    r = Blend(_previous[o], r);
                    g = Blend(_previous[o + 1], g);
                    b = Blend(_previous[o + 2], b);
                }
                _previous[o] = r;
                _previous[o + 1] = g;
                _previous[o + 2] = b;

                int p = 2 + o;
                packet[p] = r;
                packet[p + 1] = g;
                packet[p + 2] = b;
            }
            return packet;
        }

        private static byte Blend(byte previous, byte current)
        {
            return (byte)Math.Max(0, Math.Min(255,
                (int)Math.Round(previous * (1.0 - TemporalAlpha) + current * TemporalAlpha)));
        }

        private static void PerimeterPoint(double t, int left, int top, int right, int bottom,
                                           out int x, out int y)
        {
            int w = Math.Max(1, right - left);
            int h = Math.Max(1, bottom - top);
            double p = t * 2.0 * (w + h);
            if (p < w) { x = left + (int)p; y = top; }
            else if ((p -= w) < h) { x = right - 1; y = top + (int)p; }
            else if ((p -= h) < w) { x = right - 1 - (int)p; y = bottom - 1; }
            else { p -= w; x = left; y = bottom - 1 - (int)p; }
            x = Math.Max(left, Math.Min(right - 1, x));
            y = Math.Max(top, Math.Min(bottom - 1, y));
        }

        private static void SampleZone(VideoPlaneResult frame, int cx, int cy,
                                       int left, int top, int right, int bottom,
                                       int yStride, int cStride,
                                       out int yMean, out int uMean, out int vMean)
        {
            int w = right - left, h = bottom - top;
            int along = Math.Max(3, (int)Math.Round(2.0 * (w + h) / Math.Max(1, _previousLedCount) * 0.46));
            int depthX = Math.Max(3, (int)Math.Round(w * ZoneDepth));
            int depthY = Math.Max(3, (int)Math.Round(h * ZoneDepth));

            int x0, x1, y0, y1;
            if (cy == top)
            {
                x0 = Math.Max(left, cx - along); x1 = Math.Min(right - 1, cx + along);
                y0 = top; y1 = Math.Min(bottom - 1, top + depthY);
            }
            else if (cy == bottom - 1)
            {
                x0 = Math.Max(left, cx - along); x1 = Math.Min(right - 1, cx + along);
                y0 = Math.Max(top, bottom - 1 - depthY); y1 = bottom - 1;
            }
            else if (cx == right - 1)
            {
                x0 = Math.Max(left, right - 1 - depthX); x1 = right - 1;
                y0 = Math.Max(top, cy - along); y1 = Math.Min(bottom - 1, cy + along);
            }
            else
            {
                x0 = left; x1 = Math.Min(right - 1, left + depthX);
                y0 = Math.Max(top, cy - along); y1 = Math.Min(bottom - 1, cy + along);
            }

            long sy = 0, su = 0, sv = 0;
            int ny = 0, nc = 0;
            for (int py = y0; py <= y1; py += 2)
            {
                int yBase = py * yStride;
                int cBase = (py >> 1) * cStride;
                for (int px = x0; px <= x1; px += 2)
                {
                    int yi = yBase + px;
                    if (yi >= 0 && yi < frame.Y.Length) { sy += frame.Y[yi]; ny++; }

                    // NV12: one interleaved U/V pair per 2x2 luma block. Both components
                    // are accumulated over the same zone rather than taking one arbitrary pixel.
                    int ci = cBase + (px & ~1);
                    if (ci >= 0 && ci + 1 < frame.C.Length)
                    {
                        su += frame.C[ci];
                        sv += frame.C[ci + 1];
                        nc++;
                    }
                }
            }

            yMean = ny == 0 ? (fullRangeBlackFallback()) : (int)(sy / ny);
            uMean = nc == 0 ? 128 : (int)(su / nc);
            vMean = nc == 0 ? 128 : (int)(sv / nc);
        }

        private static int fullRangeBlackFallback() { return 16; }

        private static void DetectActiveArea(byte[] y, int w, int h, int stride, bool fullRange,
                                             out int left, out int top, out int right, out int bottom)
        {
            left = 0; top = 0; right = w; bottom = h;
            int threshold = fullRange ? 8 : 24;
            int step = 8, maxX = w / 4, maxY = h / 4;

            int n = 0;
            while (n < maxY && RowIsUniformBlack(y, n, w, stride, step, threshold)) n++;
            if (n >= 12 && n < maxY) top = n;
            n = 0;
            while (n < maxY && RowIsUniformBlack(y, h - 1 - n, w, stride, step, threshold)) n++;
            if (n >= 12 && n < maxY) bottom = h - n;

            n = 0;
            while (n < maxX && ColumnIsUniformBlack(y, n, h, stride, step, threshold)) n++;
            if (n >= 12 && n < maxX) left = n;
            n = 0;
            while (n < maxX && ColumnIsUniformBlack(y, w - 1 - n, h, stride, step, threshold)) n++;
            if (n >= 12 && n < maxX) right = w - n;

            if (right - left < w / 3 || bottom - top < h / 3)
            {
                left = 0; top = 0; right = w; bottom = h;
            }
        }

        private static bool RowIsUniformBlack(byte[] y, int row, int w, int stride, int step, int threshold)
        {
            int b = row * stride;
            if (b < 0 || b + w > y.Length) return false;
            for (int x = 0; x < w; x += step)
                if (y[b + x] >= threshold) return false;
            return true;
        }

        private static bool ColumnIsUniformBlack(byte[] y, int col, int h, int stride, int step, int threshold)
        {
            for (int row = 0; row < h; row += step)
            {
                int i = row * stride + col;
                if (i < 0 || i >= y.Length || y[i] >= threshold) return false;
            }
            return true;
        }
    }
}
