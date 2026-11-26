using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;

namespace MoonlightTizenInstaller;

/// <summary>
/// Perspective star field matching the website's canvas animation:
/// stars travel from the centre towards the edges, growing as they approach.
/// </summary>
public sealed class StarFieldControl : Control
{
    private const int StarCount = 1000;
    private const double MaxDepth = 1500.0;
    private const double Speed = 1.0;

    private static readonly Color[] StarColors =
    [
        Colors.White,
        Color.Parse("#FFDDC1"),
        Color.Parse("#FFC0CB"),
        Color.Parse("#ADD8E6"),
        Color.Parse("#B0E0E6")
    ];

    private readonly Random _random = new();
    private readonly Star[] _stars = new Star[StarCount];
    private readonly IBrush[] _brushes = StarColors
        .Select(color => (IBrush)new SolidColorBrush(color))
        .ToArray();
    private readonly DispatcherTimer _timer;
    private double _initializedWidth;
    private double _initializedHeight;

    private sealed class Star
    {
        public double X;
        public double Y;
        public double Z;
        public double Size;
        public int ColorIndex;
    }

    public StarFieldControl()
    {
        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
        _timer.Tick += (_, _) =>
        {
            var width = Bounds.Width;
            var height = Bounds.Height;
            if (width <= 0 || height <= 0)
                return;

            EnsureStarsInitialized(width, height);
            foreach (var star in _stars)
            {
                star.Z -= Speed * (2.0 - star.Z / MaxDepth);
                if (star.Z <= 0)
                    ResetStar(star, width);
            }

            InvalidateVisual();
        };

        AttachedToVisualTree += (_, _) => _timer.Start();
        DetachedFromVisualTree += (_, _) => _timer.Stop();
        IsHitTestVisible = false;
    }

    private void EnsureStarsInitialized(double width, double height)
    {
        if (Math.Abs(width - _initializedWidth) < 0.5 &&
            Math.Abs(height - _initializedHeight) < 0.5)
            return;

        _initializedWidth = width;
        _initializedHeight = height;
        var radiusLimit = width / 2.0;

        foreach (var star in _stars)
        {
            var angle = _random.NextDouble() * Math.PI * 2.0;
            var distance = Math.Sqrt(_random.NextDouble()) * radiusLimit;
            star.X = Math.Cos(angle) * distance;
            star.Y = Math.Sin(angle) * distance;
            star.Z = _random.NextDouble() * MaxDepth;
            star.Size = (1.0 - distance / radiusLimit) * 0.1 + 0.5;
            star.ColorIndex = _random.Next(StarColors.Length);
        }

        InvalidateVisual();
    }

    private void ResetStar(Star star, double width)
    {
        star.Z = MaxDepth;
        var angle = _random.NextDouble() * Math.PI * 2.0;
        var distance = Math.Sqrt(_random.NextDouble()) * (width / 2.0);
        star.X = Math.Cos(angle) * distance;
        star.Y = Math.Sin(angle) * distance;
        star.Size = (1.0 - distance / (width / 2.0)) * 0.1 + 0.5;
        star.ColorIndex = _random.Next(StarColors.Length);
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        var width = Bounds.Width;
        var height = Bounds.Height;
        if (width <= 0 || height <= 0)
            return;

        EnsureStarsInitialized(width, height);

        foreach (var star in _stars)
        {
            if (star.Z <= 0)
                continue;

            var x = (star.X / star.Z) * width / 2.0 + width / 2.0;
            var y = (star.Y / star.Z) * height / 2.0 + height / 2.0;
            var radius = (1.0 - star.Z / MaxDepth) * star.Size * 3.0;

            if (x < -radius || x > width + radius ||
                y < -radius || y > height + radius)
                continue;

            context.DrawEllipse(_brushes[star.ColorIndex], null,
                new Point(x, y), radius, radius);
        }
    }
}
