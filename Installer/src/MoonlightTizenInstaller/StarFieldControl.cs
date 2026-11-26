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
    private const double MinimumSpawnRadius = 0.22;

    private static readonly Color[] StarColors =
    [
        Colors.White,
        Color.Parse("#FFDDC1"),
        Color.Parse("#FFC0CB"),
        Color.Parse("#ADD8E6"),
        Color.Parse("#B0E0E6")
    ];

    private readonly Random _random = new();
    private readonly Star[] _stars = Enumerable.Range(0, StarCount).Select(_ => new Star()).ToArray();
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
                    ResetStar(star, width, height);
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
        var radiusLimit = Math.Min(width, height) / 2.0;

        foreach (var star in _stars)
        {
            SetStarPosition(star, radiusLimit);
            star.Z = _random.NextDouble() * MaxDepth;
            star.ColorIndex = _random.Next(StarColors.Length);
        }

    }

    private void ResetStar(Star star, double width, double height)
    {
        star.Z = MaxDepth;
        SetStarPosition(star, Math.Min(width, height) / 2.0);
        star.ColorIndex = _random.Next(StarColors.Length);
    }

    private void SetStarPosition(Star star, double radiusLimit)
    {
        var angle = _random.NextDouble() * Math.PI * 2.0;
        var radialPosition = MinimumSpawnRadius +
            (1.0 - MinimumSpawnRadius) * Math.Sqrt(_random.NextDouble());
        var distance = radialPosition * radiusLimit;
        star.X = Math.Cos(angle) * distance;
        star.Y = Math.Sin(angle) * distance;

        // Keep stars consistently small rather than letting them become large discs.
        star.Size = 0.20 + (1.0 - radialPosition) * 0.12;
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

            // Use one shared scale on both axes so the perspective field remains circular
            // even when the header itself is a wide, shallow rectangle.
            var projectionScale = Math.Min(width, height) / 2.0;
            var x = (star.X / star.Z) * projectionScale + width / 2.0;
            var y = (star.Y / star.Z) * projectionScale + height / 2.0;
            var radius = (1.0 - star.Z / MaxDepth) * star.Size * 1.6;
            var dx = x - width / 2.0;
            var dy = y - height / 2.0;
            var centerDistance = Math.Sqrt(dx * dx + dy * dy) /
                (Math.Min(width, height) * 0.5);

            // Stars close to the vanishing point should be tiny and almost invisible.
            var fade = Math.Clamp((centerDistance - 0.08) / 0.55, 0.0, 1.0);
            fade = fade * fade * (3.0 - 2.0 * fade);
            radius *= 0.18 + 0.82 * fade;

            if (x < -radius || x > width + radius ||
                y < -radius || y > height + radius || fade <= 0.01)
                continue;

            using (context.PushOpacity(0.04 + 0.96 * fade))
            {
                context.DrawEllipse(_brushes[star.ColorIndex], null,
                    new Point(x, y), radius, radius);
            }
        }
    }
}
