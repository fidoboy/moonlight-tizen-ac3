using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace MoonlightTizenInstaller;

public partial class ResultStatusIcon : UserControl
{
    public static readonly StyledProperty<bool> IsSuccessProperty =
        AvaloniaProperty.Register<ResultStatusIcon, bool>(nameof(IsSuccess), true);

    public bool IsSuccess
    {
        get => GetValue(IsSuccessProperty);
        set => SetValue(IsSuccessProperty, value);
    }

    public ResultStatusIcon()
    {
        InitializeComponent();
        UpdateAppearance(IsSuccess);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == IsSuccessProperty)
            UpdateAppearance(change.GetNewValue<bool>());
    }

    private void UpdateAppearance(bool success)
    {
        if (this.FindControl<Border>("Circle") is not { } circle ||
            this.FindControl<Avalonia.Controls.Shapes.Path>("Mark") is not { } mark)
            return;

        var color = Color.Parse(success ? "#35C978" : "#FF5B62");
        circle.Background = new SolidColorBrush(Color.Parse(success ? "#173F2B" : "#4A2025"));
        circle.BorderBrush = new SolidColorBrush(color);
        mark.Data = Geometry.Parse(success
            ? "M 3,12 L 9,18 L 21,6"
            : "M 6,6 L 18,18 M 18,6 L 6,18");
        mark.Stroke = new SolidColorBrush(color);
    }
}
