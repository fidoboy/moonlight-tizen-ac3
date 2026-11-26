using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;

namespace MoonlightTizenInstaller;

/// <summary>
/// Subtle animated star field used as a decorative background in the installer header.
/// </summary>
public sealed class StarFieldControl : Control
{
    private sealed class Star
    {
        public double X { get; init; }
        public double Y { get; init; }
        public double Radius { get; init; }
        public double Phase { get; set; }
        public double Speed { get; init; }
        public byte BaseAlpha { get; init; }
    }

    private readonly Star[] _stars;
    private readonly DispatcherTimer _timer;

    public StarFieldControl()
    {
        var random = new Random(20261126);
        _stars = Enumerable.Range(0, 76).Select(_ => new Star
        {
            X = random.NextDouble(),
            Y = random.NextDouble(),
            Radius = 0.45 + random.NextDouble() * 1.25,
            Phase = random.NextDouble() * Math.PI * 2,
            Speed = 0.45 + random.NextDouble() * 1.1,
            BaseAlpha = (byte)(85 + random.Next(0, 130))
        }).ToArray();

        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(55) };
        _timer.Tick += (_, _) =>
        {
            foreach (var star in _stars)
                star.Phase += 0.045 * star.Speed;
            InvalidateVisual();
        };
        AttachedToVisualTree += (_, _) => _timer.Start();
        DetachedFromVisualTree += (_, _) => _timer.Stop();
        IsHitTestVisible = false;
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var width = Bounds.Width;
        var height = Bounds.Height;
        if (width <= 0 || height <= 0)
            return;

        foreach (var star in _stars)
        {
            var twinkle = 0.38 + (Math.Sin(star.Phase) + 1) * 0.31;
            var alpha = (byte)Math.Clamp(star.BaseAlpha * twinkle, 18, 210);
            var brush = new SolidColorBrush(Color.FromArgb(alpha, 205, 224, 255));
            context.DrawEllipse(brush, null,
                new Point(star.X * width, star.Y * height),
                star.Radius, star.Radius);
        }
    }
}
