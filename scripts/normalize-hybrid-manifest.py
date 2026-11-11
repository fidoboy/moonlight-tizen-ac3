#!/usr/bin/env python3
"""Normalize the outer Tizen manifest for the Moonlight hybrid WGT."""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NAMESPACE = "http://tizen.org/ns/packages"
WMP_APPID = "MoonLightS.WmpService"
# Tizen Core derives this temporary identity from the .NET assembly name.
# It is replaced below with the canonical app declaration from the signed WMP TPK.
WMP_GENERATED_APPID = "MoonLightS.MoonlightHost"
AMBILIGHT_APPID = "MoonLightS.MoonlightAmbilight"


def fail(message):
    raise SystemExit(message)


def local_name(node):
    return node.tag.rsplit("}", 1)[-1]


def normalized_appid(value):
    return re.sub(r"[^a-z0-9]", "", (value or "").casefold())


def set_root_text(root, name, value):
    matches = [child for child in list(root) if local_name(child) == name]
    node = matches[0] if matches else None
    for duplicate in matches[1:]:
        root.remove(duplicate)
    if node is None:
        node = ET.Element(f"{{{NAMESPACE}}}{name}")
        # Keep package identity metadata together before service declarations.
        insert_at = 0
        for child in list(root):
            if local_name(child) in {"label", "author", "description"}:
                insert_at += 1
        root.insert(insert_at, node)
    node.text = value


def main():
    if len(sys.argv) != 4:
        fail("Usage: normalize-hybrid-manifest.py HYBRID_MANIFEST AMBILIGHT_TPK WMP_TPK")

    hybrid_manifest, ambilight_tpk, wmp_tpk = sys.argv[1:]
    ET.register_namespace("", NAMESPACE)
    tree = ET.parse(hybrid_manifest)
    root = tree.getroot()

    if root.get("package") != "MoonLightS":
        fail("Hybrid package identity must remain MoonLightS")
    root.set("api-version", "5.5")

    service_apps = [node for node in root.iter() if local_name(node) == "service-application"]
    ambilight_apps = [node for node in service_apps if node.get("appid") == AMBILIGHT_APPID]
    if len(ambilight_apps) != 1:
        found = [node.get("appid") for node in service_apps]
        fail(f"Hybrid manifest must contain exactly one Ambilight service; found {found!r}")

    ambilight = ambilight_apps[0]
    expected_ambilight = {
        "api-version": "13",
        "exec": "MoonlightAmbilight.dll",
        "type": "dotnet",
    }
    for key, value in expected_ambilight.items():
        if ambilight.get(key) != value:
            fail(f"Ambilight service {key} must be {value!r}")
    if not any(
        local_name(node) == "background-category"
        and node.get("value") == "background-network"
        for node in ambilight
    ):
        fail("Ambilight service must declare the background-network category")

    # Validate the actual Ambilight TPK as well as the outer manifest.
    with zipfile.ZipFile(ambilight_tpk) as package:
        ambilight_root = ET.fromstring(package.read("tizen-manifest.xml"))
        if "bin/MoonlightAmbilight.dll" not in package.namelist():
            fail("Ambilight TPK is missing bin/MoonlightAmbilight.dll")
        if not package.read("bin/MoonlightAmbilight.dll"):
            fail("Ambilight TPK contains an empty MoonlightAmbilight.dll")
    if ambilight_root.get("package") != "MoonLightS" or ambilight_root.get("api-version") != "10.0":
        fail("Ambilight TPK package identity/API target changed")
    ambilight_privileges = {
        (node.text or "").strip()
        for node in ambilight_root.iter()
        if local_name(node) == "privilege"
    }
    required_ambilight_privileges = {
        "http://tizen.org/privilege/internet",
        "http://tizen.org/privilege/network.get",
    }
    if not required_ambilight_privileges <= ambilight_privileges:
        fail("Ambilight TPK is missing required network privileges")
    ambilight_tpk_apps = [
        node for node in ambilight_root.iter()
        if local_name(node) == "service-application"
    ]
    if len(ambilight_tpk_apps) != 1 or ambilight_tpk_apps[0].get("appid") != AMBILIGHT_APPID:
        fail("Ambilight TPK must contain exactly one canonical MoonLightS.MoonlightAmbilight application")
    for key, value in expected_ambilight.items():
        if ambilight_tpk_apps[0].get(key) != value:
            fail(f"Ambilight TPK service {key} must be {value!r}")
    if not any(
        local_name(node) == "background-category"
        and node.get("value") == "background-network"
        for node in ambilight_tpk_apps[0]
    ):
        fail("Ambilight TPK service must declare the background-network category")

    wmp_keys = {
        normalized_appid(WMP_APPID),
        normalized_appid(WMP_GENERATED_APPID),
    }
    unexpected = [
        node.get("appid") for node in service_apps
        if node is not ambilight
        and normalized_appid(node.get("appid")) not in wmp_keys
    ]
    if unexpected:
        fail(f"Hybrid manifest contains unexpected service applications: {unexpected!r}")

    with zipfile.ZipFile(wmp_tpk) as package:
        wmp_root = ET.fromstring(package.read("tizen-manifest.xml"))
    wmp_apps = [node for node in wmp_root.iter() if local_name(node) == "service-application"]
    if len(wmp_apps) != 1 or wmp_apps[0].get("appid") != WMP_APPID:
        fail("WMP TPK must contain exactly one canonical MoonLightS.WmpService application")

    canonical_wmp = wmp_apps[0]
    if wmp_root.get("package") != "MoonLightS" or wmp_root.get("api-version") != "6.0":
        fail("WMP .NET TPK must target Tizen 6.0 / API 8")
    with zipfile.ZipFile(wmp_tpk) as package:
        if "bin/MoonlightHost.dll" not in package.namelist():
            fail("WMP .NET TPK is missing bin/MoonlightHost.dll")
        if "res/lib/libmlengine.so" not in package.namelist():
            fail("WMP .NET TPK is missing res/lib/libmlengine.so")
    expected_wmp = {
        "exec": "MoonlightHost.dll",
        "api-version": "8",
        "nodisplay": "true",
        "multiple": "false",
        "type": "dotnet",
        "taskmanage": "false",
    }
    for key, value in expected_wmp.items():
        if canonical_wmp.get(key) != value:
            fail(f"WMP TPK service {key} must be {value!r}")
    if not any(
        local_name(node) == "background-category"
        and node.get("value") == "background-network"
        for node in canonical_wmp
    ):
        fail("WMP TPK service must declare the background-network category")

    required_privileges = {
        "http://tizen.org/privilege/internet",
        "http://tizen.org/privilege/network.get",
        "http://developer.samsung.com/privilege/esplay",
    }
    declared_privileges = {
        (node.text or "").strip()
        for node in root.iter()
        if local_name(node) == "privilege"
    }
    missing_privileges = sorted(required_privileges - declared_privileges)
    if missing_privileges:
        fail("Hybrid manifest is missing required service privileges: " + ", ".join(missing_privileges))

    # Replace Tizen Core's temporary .NET assembly-derived declaration,
    # or any expanded WMP declaration, with the canonical service declaration
    # from the signed .NET TPK exactly once.
    for node in service_apps:
        if normalized_appid(node.get("appid")) in wmp_keys:
            root.remove(node)

    # Service applications belong before shortcut-list, privileges and the
    # remaining package-level sections. Insert WMP directly after Ambilight.
    existing_service_positions = [
        index for index, node in enumerate(list(root))
        if local_name(node) == "service-application"
    ]
    if not existing_service_positions:
        fail("Hybrid manifest lost the Ambilight service while normalizing WMP")
    root.insert(max(existing_service_positions) + 1, canonical_wmp)

    final_apps = [node for node in root.iter() if local_name(node) == "service-application"]
    final_ids = [node.get("appid") for node in final_apps]
    if len(final_apps) != 2 or set(final_ids) != {AMBILIGHT_APPID, WMP_APPID}:
        fail(f"Final hybrid manifest must declare exactly Ambilight and WMP; found {final_ids!r}")

    root_children = list(root)
    service_positions = [
        index for index, node in enumerate(root_children)
        if local_name(node) == "service-application"
    ]
    trailing_positions = [
        index for index, node in enumerate(root_children)
        if local_name(node) in {
            "shortcut-list", "privileges", "dependencies",
            "provides-appdefined-privileges",
        }
    ]
    if trailing_positions and max(service_positions) >= min(trailing_positions):
        fail("Service applications must precede shortcut-list, privileges and package dependencies")

    set_root_text(root, "label", "Moonlight Tizen Services")
    set_root_text(root, "author", "Moonlight Tizen")
    set_root_text(
        root,
        "description",
        "Native Moonlight Tizen services: WMP playback and Ambilight.",
    )

    tree.write(hybrid_manifest, encoding="UTF-8", xml_declaration=True)
    print("Hybrid manifest normalized: package metadata is accurate and exactly two services are declared.")


if __name__ == "__main__":
    main()
