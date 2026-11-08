#!/usr/bin/env python3
"""Audit a Tizen hybrid WGT against its original Moonlight Web WGT."""
import argparse
import hashlib
import json
import posixpath
import re
import sys
import urllib.parse
import zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import PurePosixPath

WEB_PREFIX = "res/wgt/"
SIGNATURE_FILES = {
    "tizen-manifest.xml", "author-signature.xml",
    "signature1.xml", "signature2.xml",
}
WASM_FILES = {
    "moonlight-wasm.js", "moonlight-wasm.js.mem",
    "moonlight-wasm.wasm", "moonlight-wasm.worker.js",
}
LOCALE_FILES = {
    "static/locales/" + locale + ".json"
    for locale in ("de-DE", "en-US", "es-ES", "fr-FR", "it-IT", "pt-BR", "ru-RU")
}
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)
CSS_IMPORT = re.compile(r"@import\s+(?:url\()?\s*(['\"])(.*?)\1\s*\)?", re.I)
JS_PATH_LITERAL = re.compile(r"""['"]((?:static|platform|service)/[^'"]+)['"]""")
JS_RELATIVE_ASSET = re.compile(
    r"""['"]((?:\.\.?/)[^'"]+\.(?:js|json|wasm|mem|worker|mp3|png|svg|woff2?))['"]""",
    re.I,
)
JS_REQUEST = re.compile(
    r"""(?:fetch|importScripts|Worker|Audio)\s*\(\s*['"]([^'"]+)['"]""",
    re.S,
)

class AuditError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise AuditError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def zip_entries(archive, label):
    entries = {}
    for item in archive.infolist():
        name = item.filename
        if name.endswith("/"):
            continue
        path = PurePosixPath(name)
        require(
            not path.is_absolute() and ".." not in path.parts and "\\" not in name,
            f"{label}: unsafe ZIP entry: {name}",
        )
        require(name not in entries, f"{label}: duplicate ZIP entry: {name}")
        entries[name] = item
    corrupt = archive.testzip()
    require(corrupt is None, f"{label}: ZIP CRC failure at {corrupt}")
    return entries

def resolve_reference(reference, source, available, label):
    value = (reference or "").strip().strip("\"'")
    if not value or value.startswith(("//", "#", "$WEBAPIS/")):
        return
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme:
        return
    path = urllib.parse.unquote(parsed.path)
    if not path:
        return
    target = posixpath.normpath(
        path.lstrip("/") if path.startswith("/")
        else posixpath.join(posixpath.dirname(source), path)
    )
    require(
        target not in (".", "..") and not target.startswith("../"),
        f"{label}: path escapes app root: {value!r} from {source}",
    )
    require(
        target in available,
        f"{label}: missing {target} (referenced as {value!r} from {source})",
    )

def xml_references(data, source):
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise AuditError(f"{source}: invalid XML: {exc}")
    references = []
    profiles = set()
    for node in root.iter():
        tag = node.tag.split("}")[-1]
        if tag in ("content", "icon") and node.get("src"):
            references.append((node.get("src"), f"{source}:{tag}@src"))
        if tag == "src" and node.get("name"):
            references.append((node.get("name"), f"{source}:tizen:src@name"))
        if tag in ("vss_default", "vss_landscape", "vss_portrait"):
            profiles.add(tag)
            for attribute in ("video", "background_image", "image"):
                if node.get(attribute):
                    references.append((node.get(attribute), f"{source}:{tag}@{attribute}"))
    return root, references, profiles

class HTMLReferences(HTMLParser):
    ATTRIBUTES = {
        "script": ("src",), "img": ("src",), "source": ("src",),
        "iframe": ("src",), "frame": ("src",), "audio": ("src",),
        "video": ("src", "poster"), "track": ("src",), "embed": ("src",),
        "object": ("data",), "input": ("src",), "link": ("href",),
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.inline_css = []
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        for name in self.ATTRIBUTES.get(tag.lower(), ()):
            if attributes.get(name):
                self.references.append((attributes[name], f"<{tag} {name}>"))
        if attributes.get("srcset"):
            for item in attributes["srcset"].split(","):
                candidate = item.strip().split()
                if candidate:
                    self.references.append((candidate[0], f"<{tag} srcset>"))
        if attributes.get("style"):
            self.inline_css.append(attributes["style"])
        if tag.lower() == "style":
            self.in_style = True

    def handle_endtag(self, tag):
        if tag.lower() == "style":
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.inline_css.append(data)

def css_references(source):
    for match in CSS_URL.finditer(source):
        value = match.group(2).strip()
        if value:
            yield value
    for match in CSS_IMPORT.finditer(source):
        value = match.group(2).strip()
        if value:
            yield value

def audit_web_payload(files, label):
    available = set(files)
    require("index.html" in available and "config.xml" in available,
            f"{label}: embedded app is missing index.html or config.xml")

    _, config_refs, inner_profiles = xml_references(files["config.xml"], "config.xml")
    require({"vss_default", "vss_landscape", "vss_portrait"} <= inner_profiles,
            f"{label}: inner config.xml is missing one or more splash profiles")

    checked = 0
    for value, source in config_refs:
        resolve_reference(value, "config.xml", available, f"{label} {source}")
        checked += 1

    html = HTMLReferences()
    try:
        html.feed(files["index.html"].decode("utf-8"))
        html.close()
    except (UnicodeDecodeError, ValueError) as exc:
        raise AuditError(f"{label}: index.html cannot be parsed: {exc}")

    for value, source in html.references:
        resolve_reference(value, "index.html", available, f"{label} HTML {source}")
        checked += 1
    for style in html.inline_css:
        for value in css_references(style):
            resolve_reference(value, "index.html", available, f"{label} inline CSS")
            checked += 1

    for name, data in files.items():
        if not name.lower().endswith(".css"):
            continue
        try:
            css = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AuditError(f"{label}: invalid CSS encoding in {name}: {exc}")
        for value in css_references(css):
            resolve_reference(value, name, available, f"{label} CSS")
            checked += 1

    for name in WASM_FILES:
        require(name in available and files[name],
                f"{label}: missing or empty Emscripten runtime file {name}")
    for name in LOCALE_FILES:
        require(name in available and files[name],
                f"{label}: missing or empty locale file {name}")
        try:
            json.loads(files[name].decode("utf-8"))
        except Exception as exc:
            raise AuditError(f"{label}: invalid locale JSON {name}: {exc}")

    for name in (
        "platform.js", "platform/ambilight.js", "platform/index.js",
        "platform/i18n.js", "platform/navigation.js",
        "service/service.js", "static/res/click.mp3",
    ):
        require(name in available and files[name],
                f"{label}: missing or empty runtime resource {name}")

    for name, data in files.items():
        if not name.lower().endswith(".js"):
            continue
        try:
            javascript = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        candidates = set(JS_PATH_LITERAL.findall(javascript))
        candidates.update(JS_RELATIVE_ASSET.findall(javascript))
        candidates.update(JS_REQUEST.findall(javascript))
        for value in candidates:
            # Browser fetch(), Worker() and Audio() relative URLs are resolved
            # against the document URL, not the directory of the JS source file.
            resolve_reference(value, "index.html", available, f"{label} JS in {name}")
            checked += 1

    return checked, len(config_refs)

def audit_outer_package(files, label):
    require("config.xml" in files, f"{label}: missing outer config.xml")
    root, references, profiles = xml_references(files["config.xml"], "outer config.xml")
    available = set(files)
    for value, source in references:
        resolve_reference(value, "config.xml", available, f"{label} {source}")

    contents = [value for value, source in references if source.endswith("content@src")]
    icons = [value for value, source in references if source.endswith("icon@src")]
    app_control_sources = [
        node.get("name") for node in root.iter()
        if node.tag.split("}")[-1] == "src" and node.get("name")
    ]
    require(
        "res/wgt/index.html" in contents and "res/wgt/service/service.js" in contents,
        f"{label}: outer config must point to res/wgt/index.html and res/wgt/service/service.js",
    )
    require("res/wgt/icon.png" in icons,
            f"{label}: outer app icon must point to res/wgt/icon.png")
    require("res/wgt/index.html" in app_control_sources,
            f"{label}: outer AppControl entry must point to res/wgt/index.html")
    require({"vss_default", "vss_landscape", "vss_portrait"} <= profiles,
            f"{label}: outer config.xml is missing a splash profile")

    # The outer package configuration resolves its launch-screen resources
    # from the hybrid package root, while the embedded Web WGT retains its
    # original copies and relative references beneath res/wgt.
    for name in (
        "static/res/launch-screen.mp4",
        "static/res/launch-screen-portrait.mp4",
        "static/res/launch-screen.png",
        "static/res/launch-screen-portrait.png",
    ):
        nested = "res/wgt/" + name
        require(name in available and files[name],
                f"{label}: missing or empty package-root splash resource {name}")
        require(nested in available and files[nested],
                f"{label}: missing or empty original Web splash resource {nested}")
        require(files[name] == files[nested],
                f"{label}: package-root splash copy differs from {nested}")
    return len(references)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-wgt", required=True)
    parser.add_argument("--hybrid-wgt", required=True)
    parser.add_argument("--variant", default="standard")
    args = parser.parse_args()
    label = args.variant + " hybrid WGT"

    try:
        with zipfile.ZipFile(args.base_wgt) as base, zipfile.ZipFile(args.hybrid_wgt) as hybrid:
            base_entries = zip_entries(base, "Original Web WGT")
            hybrid_entries = zip_entries(hybrid, label)

            original_names = {name for name in base_entries if name not in SIGNATURE_FILES}
            embedded_names = {
                name[len(WEB_PREFIX):] for name in hybrid_entries if name.startswith(WEB_PREFIX)
            }
            missing = sorted(original_names - embedded_names)
            extra = sorted(embedded_names - original_names)
            require(
                not missing and not extra,
                f"{label}: embedded web file set differs from original; missing={missing}, extra={extra}",
            )

            changed = []
            for name in sorted(original_names):
                before = digest(base.read(name))
                after = digest(hybrid.read(WEB_PREFIX + name))
                if before != after:
                    changed.append((name, before, after))
            require(
                not changed,
                f"{label}: original Moonlight web payload was modified: {changed}",
            )

            web_files = {
                name[len(WEB_PREFIX):]: hybrid.read(name)
                for name in hybrid_entries if name.startswith(WEB_PREFIX)
            }
            web_checks, inner_config_checks = audit_web_payload(web_files, label)
            outer_checks = audit_outer_package(
                {name: hybrid.read(name) for name in hybrid_entries}, label
            )

            print(f"PASS: {label}")
            print(f"  Original web payload byte-for-byte identical: {len(original_names)} files.")
            print(f"  Inner config references resolved: {inner_config_checks}.")
            print(f"  HTML/CSS/JS/runtime references checked: {web_checks}.")
            print(f"  Outer config references resolved: {outer_checks}.")
            print(f"  Both splash videos, both splash images, four WASM files and "
                  f"{len(LOCALE_FILES)} locale JSON files verified.")
    except (OSError, zipfile.BadZipFile, AuditError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
