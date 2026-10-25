#!/usr/bin/env python3
"""Render Moonlight's native Samsung TV splash: animation plus static hold.

Eight sectors fade in sequentially. The logo then makes a clear, controlled
bounce while the gray disc and app name fade in. The starfield continues to
decelerate for two seconds after the logo settles. One second after the app
title is fully visible, the existing Dolby Double-D SVG fades in below it.
Total video duration remains unchanged, with the static hold shortened to
compensate.
"""
import argparse
import math
import random
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

FPS = 30
SECTOR_INTERVAL_FRAMES = 9  # 300 ms at 30 fps
SECTOR_FADE_FRAMES = 9      # 300 ms fade-in for each sector
SECTOR_PHASE_FRAMES = 8 * SECTOR_INTERVAL_FRAMES
SETTLE_FRAMES = 36          # 1.2 s for the bounce and accompanying fade
LOGO_ANIMATION_FRAME_COUNT = SECTOR_PHASE_FRAMES + SETTLE_FRAMES
STAR_DECELERATION_AFTER_LOGO_FRAMES = 2 * FPS  # Continue for 2 s after the logo settles.
DOLBY_LOGO_DELAY_AFTER_TITLE_FRAMES = FPS // 2  # Start 0.5 s after Moonlight becomes fully visible.
DOLBY_LOGO_FADE_IN_FRAMES = FPS // 2  # Fade in over 0.5 s.
DOLBY_LOGO_FADE_START_FRAME = LOGO_ANIMATION_FRAME_COUNT + DOLBY_LOGO_DELAY_AFTER_TITLE_FRAMES
DOLBY_LOGO_SCALE = 2.2  # Approximately the cap-height of the Moonlight title.
ANIMATED_FRAME_COUNT = LOGO_ANIMATION_FRAME_COUNT + STAR_DECELERATION_AFTER_LOGO_FRAMES
TOTAL_FRAMES = LOGO_ANIMATION_FRAME_COUNT + 5 * FPS  # Preserve the original total duration.
STATIC_HOLD_FRAMES = TOTAL_FRAMES - ANIMATED_FRAME_COUNT

FINAL_LOGO_SCALE = 0.78
OVERSIZED_LOGO_SCALE = FINAL_LOGO_SCALE * 1.15
BOUNCE_LOW_SCALE = FINAL_LOGO_SCALE * 0.93
BOUNCE_HIGH_SCALE = FINAL_LOGO_SCALE * 1.06
LOGO_CENTER_X = 639.84
LOGO_CENTER_Y = 274.84

# Starfield warp parameters.
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
STAR_COUNT = 2000
STAR_SPEED = 25.0
STAR_SPEED_PEAK = 30.0
STAR_ACCELERATION_FRAMES = 8  # Briefly ramp from 25 to 30, then start the logarithmic decay.
STAR_DECEL_LOG_STRENGTH = 2.5  # Smaller values preserve more speed in the long tail.
STAR_TRAIL_MAX_LENGTH = 30.0
STAR_TRAIL_RADIAL_FRACTION = 0.075
STAR_TRAIL_MAX_OPACITY = 0.22
STAR_TRAIL_MIN_SPEED = 0.35
MAX_STAR_DEPTH = 1500.0
STAR_COLOR = "#FFFFFF"
STAR_MIN_OPACITY = 0.15
STAR_DEPTH_OPACITY_POWER = 1.3
STARFIELD_SEED = 0x4D4F4F4E  # Keep the generated splash reproducible between builds.


def find_by_id(root, target_id):
    for element in root.iter():
        if element.get("id") == target_id:
            return element
    raise RuntimeError(f"Missing expected SVG element id={target_id!r}")


def inject_dolby_logo(root, logo_svg_path):
    """Copy the existing Dolby Double-D path into the splash SVG placeholder."""
    placeholder = find_by_id(root, "dolby-logo")
    icon_root = ET.parse(logo_svg_path).getroot()
    source_path = next(
        (element for element in icon_root.iter()
         if element.tag == f"{{{SVG_NS}}}path"),
        None,
    )
    if source_path is None:
        raise RuntimeError(f"No path found in Dolby logo SVG: {logo_svg_path}")

    ET.SubElement(placeholder, source_path.tag, dict(source_path.attrib))


def smoothstep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def interpolate(start, end, progress):
    return start + (end - start) * smoothstep(progress)


def star_speed_for_frame(frame_number):
    """Ramp into a strong warp, then follow a logarithmic curve with a long, gentle tail."""
    if frame_number <= STAR_ACCELERATION_FRAMES:
        progress = frame_number / STAR_ACCELERATION_FRAMES
        return STAR_SPEED + (STAR_SPEED_PEAK - STAR_SPEED) * smoothstep(progress)

    progress = (frame_number - STAR_ACCELERATION_FRAMES) / (
        ANIMATED_FRAME_COUNT - 1 - STAR_ACCELERATION_FRAMES
    )
    progress = max(0.0, min(1.0, progress))
    if progress >= 1.0:
        return 0.0

    # Logarithmic decay slows progressively as it approaches zero. At three
    # seconds the velocity is already low, so the final segment has a much
    # gentler absolute slope and does not look like a last-second brake.
    normalized_decay = math.log1p(STAR_DECEL_LOG_STRENGTH * progress) / math.log1p(
        STAR_DECEL_LOG_STRENGTH
    )
    return STAR_SPEED_PEAK * (1.0 - normalized_decay)


class Star:
    def __init__(self, rng):
        self.rng = rng
        self.z = self.rng.random() * MAX_STAR_DEPTH
        self.x = 0.0
        self.y = 0.0
        self.size = 0.5
        self.color = STAR_COLOR
        self.randomize_position()

    def randomize_position(self):
        angle = self.rng.random() * 2.0 * math.pi
        distance_ratio = math.sqrt(self.rng.random())
        if FRAME_HEIGHT == 720:
            # Keep the established landscape star distribution unchanged.
            distance = distance_ratio * (FRAME_WIDTH / 2.0)
            self.x = math.cos(angle) * distance
            self.y = math.sin(angle) * distance
        else:
            # In portrait, distribute stars over the full 9:16 canvas.
            self.x = math.cos(angle) * distance_ratio * (FRAME_WIDTH / 2.0)
            self.y = math.sin(angle) * distance_ratio * (FRAME_HEIGHT / 2.0)
        self.size = (1.0 - distance_ratio) * 0.1 + 0.5
        self.color = STAR_COLOR

    def reset(self):
        self.z = MAX_STAR_DEPTH
        self.randomize_position()

    def update(self, speed):
        self.z -= speed * (2.0 - self.z / MAX_STAR_DEPTH)
        if self.z <= 0.0:
            self.reset()

    def projected(self):
        if self.z <= 0.0:
            return None

        # Rays must converge on the logo's own center, not the canvas center.
        x = ((self.x / self.z) * FRAME_WIDTH) / 2.0 + LOGO_CENTER_X
        y = ((self.y / self.z) * FRAME_HEIGHT) / 2.0 + LOGO_CENTER_Y
        radius = (1.0 - self.z / MAX_STAR_DEPTH) * self.size * 3.0

        # Canvas drawing clips anything outside the screen; skip those nodes here.
        if radius <= 0.02 or x + radius < 0 or x - radius > FRAME_WIDTH:
            return None
        if y + radius < 0 or y - radius > FRAME_HEIGHT:
            return None
        return x, y, radius


class StarField:
    def __init__(self):
        rng = random.Random(STARFIELD_SEED)
        self.stars = [Star(rng) for _ in range(STAR_COUNT)]

    def update(self, speed):
        for star in self.stars:
            star.update(speed)

    def append_to_svg(self, root, speed=0.0):
        group = ET.Element(f"{{{SVG_NS}}}g", {"id": "starfield"})
        trails = ET.SubElement(group, f"{{{SVG_NS}}}g", {"id": "starfield-trails"})
        points = ET.SubElement(group, f"{{{SVG_NS}}}g", {"id": "starfield-points"})

        speed_ratio = min(1.0, max(0.0, speed / STAR_SPEED_PEAK))
        if speed >= STAR_TRAIL_MIN_SPEED:
            trail_opacity = STAR_TRAIL_MAX_OPACITY * speed_ratio ** 1.25
            stroke_width = 0.60 + 0.35 * speed_ratio

        for star in self.stars:
            point = star.projected()
            if point is None:
                continue
            x, y, radius = point
            depth_ratio = 1.0 - star.z / MAX_STAR_DEPTH
            star_opacity = STAR_MIN_OPACITY + (1.0 - STAR_MIN_OPACITY) * (
                depth_ratio ** STAR_DEPTH_OPACITY_POWER
            )

            # Draw each faint trail inward from the bright star, so every
            # streak points back toward the logo-centered vanishing point.
            if speed >= STAR_TRAIL_MIN_SPEED:
                dx = x - LOGO_CENTER_X
                dy = y - LOGO_CENTER_Y
                radial_distance = math.hypot(dx, dy)
                trail_length = min(
                    STAR_TRAIL_MAX_LENGTH,
                    radial_distance * STAR_TRAIL_RADIAL_FRACTION,
                ) * speed_ratio
                if radial_distance > 1.0 and trail_length >= 0.65:
                    tail_x = x - (dx / radial_distance) * trail_length
                    tail_y = y - (dy / radial_distance) * trail_length
                    ET.SubElement(
                        trails,
                        f"{{{SVG_NS}}}line",
                        {
                            "x1": f"{tail_x:.2f}",
                            "y1": f"{tail_y:.2f}",
                            "x2": f"{x:.2f}",
                            "y2": f"{y:.2f}",
                            "stroke": star.color,
                            "stroke-width": f"{stroke_width:.2f}",
                            "stroke-linecap": "round",
                            "opacity": f"{trail_opacity * star_opacity:.4f}",
                        },
                    )

            # The sharp point is drawn above all trails for a crisp starfield
            # as the camera's forward motion slows down.
            ET.SubElement(
                points,
                f"{{{SVG_NS}}}circle",
                {
                    "cx": f"{x:.2f}",
                    "cy": f"{y:.2f}",
                    "r": f"{radius:.2f}",
                    "fill": star.color,
                    "fill-opacity": f"{star_opacity:.4f}",
                },
            )

        # The first template child is the black full-canvas background. Insert
        # the trails and sharp star points below the unchanged logo/text layers.
        root.insert(1, group)


class PeriodicStarField:
    """A loopable starfield whose complete state repeats after total_frames."""

    # Every period divides 240 frames, so the state closes exactly at 8 seconds.
    PERIODS = (30, 40, 48, 60, 80, 120, 240)

    def __init__(self, total_frames, speed_multiplier=1.0):
        rng = random.Random(STARFIELD_SEED)
        self.stars = [Star(rng) for _ in range(STAR_COUNT)]
        target_period = (MAX_STAR_DEPTH * math.log(2.0)) / (
            STAR_SPEED * speed_multiplier
        )
        ranked_periods = sorted(self.PERIODS, key=lambda period: abs(period - target_period))
        # Keep the normal-speed motion close to the original warp speed, while
        # allowing the CLI speed multiplier to select a suitable loop period.
        candidate_periods = ranked_periods[:2]
        self.stars_data = []

        for star in self.stars:
            period = rng.choice(candidate_periods)
            cycle_count = total_frames // period
            phase_frame = rng.randrange(period)
            cycle_index = rng.randrange(cycle_count)

            # Precompute a different ray for every pass through the camera.
            # The sequence of rays itself repeats only at the full video loop.
            positions = []
            for _ in range(cycle_count):
                positions.append((star.x, star.y, star.size))
                star.randomize_position()

            star.x, star.y, star.size = positions[cycle_index]
            self.stars_data.append({
                "star": star,
                "period": period,
                "phase_frame": phase_frame,
                "cycle_index": cycle_index,
                "positions": positions,
            })
            self._update_depth(self.stars_data[-1])

    @staticmethod
    def _update_depth(data):
        # Exponential depth progression approximates constant forward motion:
        # z moves from MAX_STAR_DEPTH to zero over each star's period.
        phase = data["phase_frame"] / data["period"]
        data["star"].z = MAX_STAR_DEPTH * (2.0 - 2.0 ** phase)

    def update(self, speed):
        for data in self.stars_data:
            data["phase_frame"] += 1
            if data["phase_frame"] >= data["period"]:
                data["phase_frame"] = 0
                data["cycle_index"] = (
                    data["cycle_index"] + 1
                ) % len(data["positions"])
                star = data["star"]
                star.x, star.y, star.size = data["positions"][data["cycle_index"]]
            self._update_depth(data)

    def append_to_svg(self, root, speed=0.0):
        # Reuse the established renderer without changing StarField or the
        # presentation-screen animation. Only the transition video uses this.
        renderer = object.__new__(StarField)
        renderer.stars = self.stars
        renderer.append_to_svg(root, speed=speed)


def settling_scale(progress):
    """Bounce clearly below the final size, rebound above it, then settle."""
    if progress <= 0.42:
        return interpolate(OVERSIZED_LOGO_SCALE, BOUNCE_LOW_SCALE, progress / 0.42)
    if progress <= 0.72:
        return interpolate(BOUNCE_LOW_SCALE, BOUNCE_HIGH_SCALE, (progress - 0.42) / 0.30)
    return interpolate(BOUNCE_HIGH_SCALE, FINAL_LOGO_SCALE, (progress - 0.72) / 0.28)


def configure_orientation(root, orientation):
    """Adapt the SVG coordinate system and logo layout to the target orientation."""
    if orientation == "portrait":
        canvas_width, canvas_height = 720, 1280
        app_name_x, app_name_y, app_name_size = 360, 755, 48
    else:
        canvas_width, canvas_height = 1280, 720
        app_name_x, app_name_y, app_name_size = 640, 485, 54

    root.set("width", str(canvas_width))
    root.set("height", str(canvas_height))
    root.set("viewBox", f"0 0 {canvas_width} {canvas_height}")

    canvas_background = next(
        element for element in root
        if element.tag == f"{{{SVG_NS}}}rect"
    )
    canvas_background.set("width", str(canvas_width))
    canvas_background.set("height", str(canvas_height))

    logo_group = find_by_id(root, "logo-group")
    logo_group.set(
        "transform",
        f"translate({LOGO_CENTER_X} {LOGO_CENTER_Y}) "
        f"scale({FINAL_LOGO_SCALE:.5f}) translate(-128 -128)",
    )
    app_name = find_by_id(root, "app-name")
    app_name.set("x", str(app_name_x))
    app_name.set("y", str(app_name_y))
    app_name.set("font-size", str(app_name_size))
    app_name.set("text-anchor", "middle")

    # The Dolby symbol uses the same source SVG as the streaming configuration UI.
    # Keep it centered under Moonlight and close to the title's visual letter height.
    dolby_logo = find_by_id(root, "dolby-logo")
    dolby_center_y = 810 if orientation == "portrait" else 540
    dolby_logo.set(
        "transform",
        f"translate({app_name_x} {dolby_center_y}) "
        f"scale({DOLBY_LOGO_SCALE:.5f}) translate(-12 -12)",
    )


def configure_frame(root, frame_number):
    logo_group = find_by_id(root, "logo-group")
    background = find_by_id(root, "background-circle")
    app_name = find_by_id(root, "app-name")
    dolby_logo = find_by_id(root, "dolby-logo")
    sectors = [find_by_id(root, f"sector-{i}") for i in range(8)]

    if frame_number < SECTOR_PHASE_FRAMES:
        scale = OVERSIZED_LOGO_SCALE
        fade = 0.0
    else:
        settle_frame = frame_number - SECTOR_PHASE_FRAMES
        progress = min(1.0, (settle_frame + 1) / SETTLE_FRAMES)
        scale = settling_scale(progress)
        fade = progress

    # Keep the logo centered while its scale changes. At 0.78 this transform
    # is geometrically identical to the original translate(540 175) scale(0.78).
    logo_group.set(
        "transform",
        f"translate({LOGO_CENTER_X} {LOGO_CENTER_Y}) "
        f"scale({scale:.5f}) translate(-128 -128)",
    )
    background.set("fill-opacity", f"{fade:.4f}")
    app_name.set("opacity", f"{fade:.4f}")

    if frame_number < DOLBY_LOGO_FADE_START_FRAME:
        dolby_opacity = 0.0
    else:
        fade_progress = min(
            1.0,
            (frame_number - DOLBY_LOGO_FADE_START_FRAME + 1) / DOLBY_LOGO_FADE_IN_FRAMES,
        )
        dolby_opacity = smoothstep(fade_progress)
    dolby_logo.set("opacity", f"{dolby_opacity:.4f}")

    for index, sector in enumerate(sectors):
        start_frame = index * SECTOR_INTERVAL_FRAMES
        if frame_number < start_frame:
            opacity = 0.0
        else:
            opacity = min(1.0, (frame_number - start_frame + 1) / SECTOR_FADE_FRAMES)
        sector.set("opacity", f"{opacity:.4f}")


def render_svg(
    template_path, output_path, dolby_logo_path, frame_number=None, starfield=None,
    star_speed=0.0, orientation="landscape"
):
    root = ET.parse(template_path).getroot()
    inject_dolby_logo(root, dolby_logo_path)
    configure_orientation(root, orientation)
    if frame_number is not None:
        configure_frame(root, frame_number)
    else:
        # Static PNG fallback uses the completed splash state.
        find_by_id(root, "dolby-logo").set("opacity", "1")
    if starfield is not None:
        if frame_number is not None:
            starfield.update(star_speed)
        starfield.append_to_svg(root, speed=star_speed)
    output_path.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))


def generate_starfield_only_frames(output_dir, speed_multiplier=1.0):
    """Render an 8-second, constant-speed starfield-only sequence for UI transitions."""
    output_dir.mkdir(parents=True, exist_ok=True)
    speed = STAR_SPEED * speed_multiplier
    total_frames = 8 * FPS
    starfield = PeriodicStarField(total_frames, speed_multiplier)
    svg_path = output_dir / "frame.svg"
    for frame_number in range(total_frames):
        root = ET.Element(
            f"{{{SVG_NS}}}svg",
            {
                "width": str(FRAME_WIDTH),
                "height": str(FRAME_HEIGHT),
                "viewBox": f"0 0 {FRAME_WIDTH} {FRAME_HEIGHT}",
            },
        )
        ET.SubElement(
            root, f"{{{SVG_NS}}}rect",
            {"width": str(FRAME_WIDTH), "height": str(FRAME_HEIGHT), "fill": "#000000"},
        )
        starfield.update(speed)
        starfield.append_to_svg(root, speed=speed)
        svg_path.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))
        frame_png = output_dir / f"frame-{frame_number:03d}.png"
        subprocess.run(
            [
                "rsvg-convert", "-w", "1920", "-h", "1080",
                "--format", "png", "-o", str(frame_png), str(svg_path),
            ],
            check=True,
        )
    svg_path.unlink(missing_ok=True)
    print(
        f"Generated starfield-only background: {total_frames} frames, 1920x1080 at "
        f"{FPS} fps, 8.0 s, no logo, constant speed multiplier {speed_multiplier:g} "
        f"(star velocity {speed:g})."
    )


def main():
    global FRAME_WIDTH, FRAME_HEIGHT, LOGO_CENTER_X, LOGO_CENTER_Y

    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--dolby-logo", required=True, type=Path)
    parser.add_argument("--frames", type=Path)
    parser.add_argument(
        "--static-only", action="store_true",
        help="Generate only the static fallback SVG without rendering animation frames",
    )
    parser.add_argument("--static-svg", required=True, type=Path)
    parser.add_argument(
        "--orientation", choices=("landscape", "portrait"), default="landscape"
    )
    parser.add_argument("--starfield-only-frames", type=Path)
    parser.add_argument("--starfield-speed", type=float, default=1.0)
    args = parser.parse_args()

    if args.orientation == "portrait":
        FRAME_WIDTH, FRAME_HEIGHT = 720, 1280
        LOGO_CENTER_X, LOGO_CENTER_Y = 360.0, 545.0
        output_width, output_height = 1080, 1920
    else:
        FRAME_WIDTH, FRAME_HEIGHT = 1280, 720
        LOGO_CENTER_X, LOGO_CENTER_Y = 639.84, 274.84
        output_width, output_height = 1920, 1080

    if not args.template.is_file():
        raise SystemExit(f"SVG template not found: {args.template}")
    if not args.dolby_logo.is_file():
        raise SystemExit(f"Dolby logo SVG not found: {args.dolby_logo}")
    args.static_svg.parent.mkdir(parents=True, exist_ok=True)

    if args.static_only:
        if args.starfield_only_frames:
            raise SystemExit("--static-only cannot be combined with --starfield-only-frames")
        starfield = StarField()
        for frame_number in range(ANIMATED_FRAME_COUNT):
            starfield.update(star_speed_for_frame(frame_number))
        render_svg(
            args.template, args.static_svg, args.dolby_logo,
            starfield=starfield, orientation=args.orientation,
        )
        print(f"Generated static splash SVG only ({args.orientation}); animation frames were skipped.")
        return

    if args.frames is None:
        raise SystemExit("--frames is required unless --static-only is specified")
    args.frames.mkdir(parents=True, exist_ok=True)
    starfield = StarField()

    for frame_number in range(ANIMATED_FRAME_COUNT):
        frame_svg = args.frames / "frame.svg"
        frame_png = args.frames / f"frame-{frame_number:03d}.png"
        render_svg(
            args.template,
            frame_svg,
            args.dolby_logo,
            frame_number,
            starfield=starfield,
            star_speed=star_speed_for_frame(frame_number),
            orientation=args.orientation,
        )
        subprocess.run(
            [
                "rsvg-convert", "-w", str(output_width), "-h", str(output_height),
                "--format", "png", "-o", str(frame_png), str(frame_svg),
            ],
            check=True,
        )

    # The static fallback uses the final frozen star positions and the unchanged
    # assembled logo/text from the SVG template.
    render_svg(
        args.template, args.static_svg, args.dolby_logo, starfield=starfield,
        orientation=args.orientation,
    )

    # Repeat the completed frame instead of re-rendering identical PNGs.
    final_frame = args.frames / f"frame-{ANIMATED_FRAME_COUNT - 1:03d}.png"
    for frame_number in range(ANIMATED_FRAME_COUNT, TOTAL_FRAMES):
        (args.frames / f"frame-{frame_number:03d}.png").write_bytes(final_frame.read_bytes())

    (args.frames / "frame.svg").unlink(missing_ok=True)
    print(
        f"Generated {ANIMATED_FRAME_COUNT} animated frames plus "
        f"{STATIC_HOLD_FRAMES} static frames: {TOTAL_FRAMES} frames total at "
        f"{output_width}x{output_height} at {FPS} fps "
        f"({LOGO_ANIMATION_FRAME_COUNT / FPS:.1f} s logo animation + "
        f"{STAR_DECELERATION_AFTER_LOGO_FRAMES / FPS:.1f} s continued starfield deceleration + "
        f"{STATIC_HOLD_FRAMES / FPS:.1f} s static hold = {TOTAL_FRAMES / FPS:.1f} s; "
        f"Dolby logo fade starts {DOLBY_LOGO_DELAY_AFTER_TITLE_FRAMES / FPS:.1f} s after title and lasts "
        f"{DOLBY_LOGO_FADE_IN_FRAMES / FPS:.1f} s)."
    )

    if args.starfield_only_frames:
        if args.orientation != "landscape":
            raise SystemExit("--starfield-only-frames can only be used with landscape orientation")
        if args.starfield_speed <= 0:
            raise SystemExit("--starfield-speed must be greater than zero")
        # The background vanishing point is the center of the 16:9 canvas.
        LOGO_CENTER_X, LOGO_CENTER_Y = FRAME_WIDTH / 2.0, FRAME_HEIGHT / 2.0
        generate_starfield_only_frames(args.starfield_only_frames, args.starfield_speed)


if __name__ == "__main__":
    main()
