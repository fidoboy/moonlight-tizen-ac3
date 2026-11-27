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
            ? "M 3,14 L 9,20 L 21,8"
            : "M 4,4 L 20,20 M 20,4 L 4,20");
        mark.Stroke = new SolidColorBrush(color);
    }
}
