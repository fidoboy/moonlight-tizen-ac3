#!/usr/bin/env python3
"""Validate the Moonlight Tizen Installer localization table and UI coverage."""

from __future__ import annotations

import html
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALIZATION = ROOT / "Installer/src/MoonlightTizenInstaller/InstallerLocalization.cs"
PROJECT_SOURCE = ROOT / "Installer/src/MoonlightTizenInstaller"
EXPECTED_LOCALES = 7
NON_TRANSLATED_UI_LABELS = {
    "English (United States)", "Deutsch", "Español", "Français",
    "Italiano", "Português (Brasil)", "Русский",
}
PLACEHOLDER_RE = re.compile(r"\{\d+\}")

def unescape_csharp(value: str) -> str:
    return bytes(value, "utf-8").decode("unicode_escape") if "\\" in value else value

def fail(errors: list[str]) -> None:
    if errors:
        print("Installer localization validation failed:")
        for error in errors:
            print(f" - {error}")
        sys.exit(1)

localization = LOCALIZATION.read_text(encoding="utf-8")
source_files = [path for path in [*PROJECT_SOURCE.rglob("*.cs"), *PROJECT_SOURCE.rglob("*.axaml")] if path != LOCALIZATION]
source_text = {path: path.read_text(encoding="utf-8") for path in source_files}
all_source = "\n".join(source_text.values())
errors: list[str] = []

locale_match = re.search(r'Locales\s*=\s*\[(.*?)\]', localization, re.S)
if not locale_match:
    errors.append("Could not find the supported Locales array.")
    locales: list[str] = []
else:
    locales = re.findall(r'"([^"]+)"', locale_match.group(1))
    if len(locales) != EXPECTED_LOCALES:
        errors.append(f"Expected {EXPECTED_LOCALES} locales, found {len(locales)}: {locales}")

entry_re = re.compile(
    r'^\s*\["((?:\\.|[^"\\])*)"\]\s*=\s*'
    r'(?:new\s+string\[\]\s*)?(?:\[(.*?)\]|\{(.*?)\})\s*,?\s*$',
    re.M | re.S,
)
entries: dict[str, list[str]] = {}
for match in entry_re.finditer(localization):
    key = unescape_csharp(match.group(1))
    body = match.group(2) if match.group(2) is not None else match.group(3)
    values = [unescape_csharp(item) for item in re.findall(r'"((?:\\.|[^"\\])*)"', body)]
    if key in entries:
        errors.append(f"Duplicate source key: {key!r}")
    entries[key] = values
    if len(values) != EXPECTED_LOCALES:
        errors.append(f"{key!r}: expected {EXPECTED_LOCALES} translations, found {len(values)}")
        continue
    for locale, value in zip(locales, values):
        if not value.strip():
            errors.append(f"{key!r}: empty translation for {locale}")
        source_placeholders = Counter(PLACEHOLDER_RE.findall(key))
        translated_placeholders = Counter(PLACEHOLDER_RE.findall(value))
        if source_placeholders != translated_placeholders:
            errors.append(
                f"{key!r}: placeholder mismatch for {locale}: "
                f"expected {sorted(source_placeholders.elements())}, "
                f"found {sorted(translated_placeholders.elements())}"
            )

keys = set(entries)
expected: set[str] = set()

# Every literal passed to the runtime translator must exist in the table.
for call in re.finditer(r'InstallerLocalization\.T\((.*?)\)', all_source, re.S):
    for literal in re.findall(r'"((?:\\.|[^"\\])*)"', call.group(1)):
        expected.add(unescape_csharp(literal).replace("{{", "{").replace("}}", "}"))

# Static UI labels in Avalonia markup must be translatable, except native
# language names and numeric wizard indicators.
for path, text in source_text.items():
    if path.suffix != ".axaml":
        continue
    for match in re.finditer(r'\b(?:Text|Content|Header|Watermark|Title)="([^"]*)"', text):
        value = html.unescape(match.group(1)).strip()
        if not value or value.startswith("{") or value.isdigit() or value in NON_TRANSLATED_UI_LABELS:
            continue
        expected.add(value)

missing = sorted(expected - keys)
for key in missing:
    errors.append(f"Missing translation key referenced by the UI: {key!r}")

# A dictionary entry must still be referenced by the installer source/markup;
# this catches stale keys left behind after UI copy is removed or renamed.
unused = sorted(key for key in keys if key not in all_source)
for key in unused:
    errors.append(f"Unused translation key: {key!r}")

if not entries:
    errors.append("No translation entries were parsed; check the dictionary format.")

fail(errors)
print(
    f"Installer localization OK: {len(entries)} keys, "
    f"{len(locales)} locales; no missing/unused keys, empty values, or placeholder mismatches."
)
