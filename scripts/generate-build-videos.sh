#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${1:-generated-videos}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/launch-screen.mp4" "$OUTPUT_DIR/launch-screen-portrait.mp4"

python3 res/generate-launch-screen.py \
  --template res/launch-screen.svg \
  --dolby-logo wasm/static/res/ic_dolby_double_d.svg \
  --frames "$WORK_DIR/launch-frames-landscape" \
  --static-svg "$WORK_DIR/launch-screen-final.svg" \
  --orientation landscape \


python3 res/generate-launch-screen.py \
  --template res/launch-screen.svg \
  --dolby-logo wasm/static/res/ic_dolby_double_d.svg \
  --frames "$WORK_DIR/launch-frames-portrait" \
  --static-svg "$WORK_DIR/launch-screen-portrait-final.svg" \
  --orientation portrait

ffmpeg -hide_banner -loglevel error -framerate 30 \
  -i "$WORK_DIR/launch-frames-landscape/frame-%03d.png" \
  -i res/launch_screen.wav -frames:v 258 \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset veryslow -tune stillimage -crf 28 -pix_fmt yuv420p \
  -profile:v baseline -level 4.0 \
  -c:a aac -b:a 96k -ar 48000 -ac 2 -shortest -movflags +faststart \
  -y "$OUTPUT_DIR/launch-screen.mp4"

test -s "$OUTPUT_DIR/launch-screen.mp4"
test "$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/launch-screen.mp4")" = "aac"
test "$(stat -c %s "$OUTPUT_DIR/launch-screen.mp4")" -lt 2097152

ffmpeg -hide_banner -loglevel error -framerate 30 \
  -i "$WORK_DIR/launch-frames-portrait/frame-%03d.png" \
  -i res/launch_screen.wav -frames:v 258 \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset veryslow -tune stillimage -crf 28 -pix_fmt yuv420p \
  -profile:v baseline -level 4.0 \
  -c:a aac -b:a 96k -ar 48000 -ac 2 -shortest -movflags +faststart \
  -y "$OUTPUT_DIR/launch-screen-portrait.mp4"

test -s "$OUTPUT_DIR/launch-screen-portrait.mp4"
test "$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/launch-screen-portrait.mp4")" = "aac"
test "$(stat -c %s "$OUTPUT_DIR/launch-screen-portrait.mp4")" -lt 2097152

echo "Generated video assets:"
ls -lh "$OUTPUT_DIR"/{launch-screen.mp4,launch-screen-portrait.mp4}
