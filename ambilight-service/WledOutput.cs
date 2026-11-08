using System;
using TizenAmbilight;

namespace MoonlightAmbilight
{
    internal static class WledOutput
    {
        public const int MaxLeds = 490;
        private const byte Drgb = 0x02;

        // WLED realtime DRGB: [protocol, timeout, R,G,B ...]
        public static byte[] BuildFrame(VideoPlaneResult frame, int ledCount)
        {
            byte[] packet = new byte[2 + ledCount * 3];
            packet[0] = Drgb;
            packet[1] = 1;

            int width = frame.W;
            int height = frame.H;
            int yStride = frame.YStride > 0 ? frame.YStride : width;
            int cStride = frame.CStride > 0 ? frame.CStride : width;

            for (int led = 0; led < ledCount; led++)
            {
                double t = ledCount <= 1 ? 0.0 : (double)led / ledCount;
                int x, y;
                PerimeterPoint(t, width, height, out x, out y);
                int yy = AverageY(frame.Y, x, y, width, height, yStride);
                int uvIndex = (y / 2) * cStride + (x & ~1);
                if (uvIndex < 0 || uvIndex + 1 >= frame.C.Length) uvIndex = 0;
                int u = frame.C[uvIndex];
                int v = frame.C[uvIndex + 1];
                byte r, g, b;
                YuvToRgb(yy, u, v, out r, out g, out b);
                int o = 2 + led * 3;
                packet[o] = r;
                packet[o + 1] = g;
                packet[o + 2] = b;
            }
            return packet;
        }

        private static void PerimeterPoint(double t, int w, int h, out int x, out int y)
        {
            double p = t * 2.0 * (w + h);
            if (p < w) { x = (int)p; y = 0; }
            else if ((p -= w) < h) { x = w - 1; y = (int)p; }
            else if ((p -= h) < w) { x = w - 1 - (int)p; y = h - 1; }
            else { p -= w; x = 0; y = h - 1 - (int)p; }
            if (x < 0) x = 0; if (x >= w) x = w - 1;
            if (y < 0) y = 0; if (y >= h) y = h - 1;
        }

        private static int AverageY(byte[] plane, int cx, int cy, int w, int h, int stride)
        {
            int sum = 0, count = 0;
            int left = Math.Max(0, cx - 5), right = Math.Min(w - 1, cx + 5);
            int top = Math.Max(0, cy - 5), bottom = Math.Min(h - 1, cy + 5);
            for (int y = top; y <= bottom; y += 2)
                for (int x = left; x <= right; x += 2)
                {
                    int i = y * stride + x;
                    if (i >= 0 && i < plane.Length) { sum += plane[i]; count++; }
                }
            return count == 0 ? 16 : sum / count;
        }

        private static void YuvToRgb(int y, int u, int v, out byte r, out byte g, out byte b)
        {
            int c = y - 16, d = u - 128, e = v - 128;
            int rr = (298 * c + 409 * e + 128) >> 8;
            int gg = (298 * c - 100 * d - 208 * e + 128) >> 8;
            int bb = (298 * c + 516 * d + 128) >> 8;
            r = Clamp(rr); g = Clamp(gg); b = Clamp(bb);
        }

        private static byte Clamp(int value)
        {
            if (value < 0) return 0;
            if (value > 255) return 255;
            return (byte)value;
        }
    }
}
