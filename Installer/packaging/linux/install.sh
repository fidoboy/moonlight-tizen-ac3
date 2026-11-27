#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-"$HOME/.local/share"}"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$DATA_HOME/moonlight-tizen-installer"
APPLICATIONS_DIR="$DATA_HOME/applications"
ICON_DIR="$DATA_HOME/icons/hicolor/512x512/apps"

mkdir -p "$APP_DIR" "$BIN_DIR" "$APPLICATIONS_DIR" "$ICON_DIR"
install -m 755 "$SCRIPT_DIR/MoonlightTizenInstaller" "$APP_DIR/MoonlightTizenInstaller"
install -m 644 "$SCRIPT_DIR/share/icons/hicolor/512x512/apps/moonlight-tizen-installer.png" "$ICON_DIR/moonlight-tizen-installer.png"
sed "s|@EXEC_PATH@|$APP_DIR/MoonlightTizenInstaller|g" \
  "$SCRIPT_DIR/share/applications/MoonlightTizenInstaller.desktop" \
  > "$APPLICATIONS_DIR/MoonlightTizenInstaller.desktop"
chmod 644 "$APPLICATIONS_DIR/MoonlightTizenInstaller.desktop"
ln -sfn "$APP_DIR/MoonlightTizenInstaller" "$BIN_DIR/moonlight-tizen-installer"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf 'Installed Moonlight Tizen Installer. Launch it from your application menu.\n'
printf 'Command-line launcher: %s/moonlight-tizen-installer\n' "$BIN_DIR"
