#!/usr/bin/env python3
"""Fetch the Samsung TV CA chain from the official Tizen SDK extension archive."""
import io
import os
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

BASE = "https://download.tizen.org/sdk/tizenstudio/official/extension_info.xml"
HOST = "download.tizen.org"
FILES = (
    "vd_tizen_dev_author_ca.cer",
    "vd_tizen_dev_public2.crt",
    "vd_tizen_dev_partner2.crt",
)
MAX_DOWNLOAD = 128 * 1024 * 1024


def fetch(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != HOST:
        raise RuntimeError(f"Refusing non-official Tizen SDK URL: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "Moonlight-Tizen-Build/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_DOWNLOAD + 1)
    if not data or len(data) > MAX_DOWNLOAD:
        raise RuntimeError(f"Unexpected download size from {url}: {len(data)} bytes")
    return data


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: fetch-samsung-cas.py OUTPUT_DIRECTORY")
    output = sys.argv[1]
    root = ET.fromstring(fetch(BASE))
    archive_url = None
    for extension in root.iter("extension"):
        name = (extension.findtext("name") or "").strip()
        repository = (extension.findtext("repository") or "").strip()
        if name.lower() == "samsung certificate extension":
            parsed = urllib.parse.urlparse(repository)
            if parsed.scheme == "https" and parsed.hostname == HOST:
                archive_url = repository
                break
    if not archive_url:
        raise RuntimeError("Samsung Certificate Extension archive URL not found in official extension_info.xml")

    outer_bytes = fetch(archive_url)
    found = None
    with zipfile.ZipFile(io.BytesIO(outer_bytes)) as outer:
        nested_names = sorted(
            name for name in outer.namelist()
            if name.lower().endswith(".zip") and not name.endswith("/")
        )
        for nested_name in nested_names:
            nested_bytes = outer.read(nested_name)
            if len(nested_bytes) > MAX_DOWNLOAD:
                continue
            try:
                with zipfile.ZipFile(io.BytesIO(nested_bytes)) as addon:
                    jars = sorted(
                        (name for name in addon.namelist()
                         if name.rsplit("/", 1)[-1].lower().startswith("org.tizen.common.cert_")
                         and name.lower().endswith(".jar")),
                        key=lambda name: (0 if "certificate-manager" in name.lower() else 1, name),
                    )
                    for jar_name in jars:
                        jar_bytes = addon.read(jar_name)
                        with zipfile.ZipFile(io.BytesIO(jar_bytes)) as jar:
                            paths = {name: "res/ca/" + name for name in FILES}
                            if all(path in jar.namelist() for path in paths.values()):
                                found = (nested_name, jar_name, {name: jar.read(path) for name, path in paths.items()})
                                break
                if found:
                    break
            except (zipfile.BadZipFile, KeyError):
                continue

    if not found:
        raise RuntimeError("Could not find all three Samsung CA files in extension/add-on/certificate-manager JAR")

    nested_name, jar_name, files = found
    os.makedirs(output, exist_ok=True)
    for name, content in files.items():
        if not content:
            raise RuntimeError(f"Samsung CA file is empty: {name}")
        with open(os.path.join(output, name), "wb") as target:
            target.write(content)
    print(f"Samsung CA files extracted from official extension archive: {archive_url}")
    print(f"Nested add-on: {nested_name}")
    print(f"Certificate Manager JAR: {jar_name}")
    for name in FILES:
        print(f"Extracted {name}: {len(files[name])} bytes")


if __name__ == "__main__":
    main()
