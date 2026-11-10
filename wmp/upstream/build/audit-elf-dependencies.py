#!/usr/bin/env python3
"""Audit the recursive DT_NEEDED closure of the final Tizen ARM ELF outputs.

The search space is deliberately limited to the target sysroot and the TV
firmware libraries supplied to the build. Host libraries are never considered.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from collections import deque
from pathlib import Path


NEEDED_RE = re.compile(r"Shared library: \[(.+?)\]")
SONAME_RE = re.compile(r"Library soname: \[(.+?)\]")
MACHINE_RE = re.compile(r"^\s*Machine:\s*(.+?)\s*$", re.MULTILINE)


def run_readelf(readelf: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [readelf, *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def dynamic_info(readelf: str, path: Path):
    result = run_readelf(readelf, "-d", str(path))
    if result.returncode:
        return None
    needed = NEEDED_RE.findall(result.stdout)
    soname_match = SONAME_RE.search(result.stdout)
    return needed, soname_match.group(1) if soname_match else None


def is_elf(readelf: str, path: Path) -> bool:
    result = run_readelf(readelf, "-h", str(path))
    return result.returncode == 0 and "ELF Header:" in result.stdout


def index_libraries(readelf: str, directories: list[Path]):
    by_name: dict[str, list[Path]] = {}
    by_soname: dict[str, list[Path]] = {}
    scanned: set[str] = set()
    for directory in directories:
        if not directory.is_dir():
            continue
        for root, dirs, files in os.walk(directory, followlinks=False):
            dirs.sort()
            files.sort()
            for filename in files:
                candidate = Path(root) / filename
                try:
                    real = str(candidate.resolve(strict=True))
                except (OSError, RuntimeError):
                    continue
                if real in scanned:
                    # Keep alternate symlink names as lookup aliases.
                    by_name.setdefault(filename, []).append(candidate)
                    continue
                scanned.add(real)
                info = dynamic_info(readelf, candidate)
                if info is None:
                    continue
                needed, soname = info
                by_name.setdefault(filename, []).append(candidate)
                if soname:
                    by_soname.setdefault(soname, []).append(candidate)
    return by_name, by_soname


def choose(candidates: list[Path]) -> Path:
    return sorted(candidates, key=lambda p: (len(str(p)), str(p)))[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readelf", default="readelf")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--root", action="append", required=True, type=Path)
    parser.add_argument("--search-dir", action="append", required=True, type=Path)
    parser.add_argument(
        "--system-soname", action="append", default=[],
        help="DT_NEEDED SONAME supplied by the target Tizen firmware, not bundled with the app",
    )
    args = parser.parse_args()

    roots = [p.resolve() for p in args.root]
    directories = [p.resolve() for p in args.search_dir if p.is_dir()]
    missing_roots = [p for p in roots if not p.is_file()]
    if missing_roots:
        for path in missing_roots:
            print(f"ERROR: missing audit root: {path}", file=sys.stderr)
        return 2

    by_name, by_soname = index_libraries(args.readelf, directories)
    queue = deque(roots)
    visited: set[str] = set()
    records: dict[str, dict] = {}
    missing: dict[str, list[str]] = {}
    system_external: dict[str, list[str]] = {}
    system_sonames = set(args.system_soname)

    while queue:
        path = queue.popleft()
        key = str(path.resolve())
        if key in visited:
            continue
        visited.add(key)

        header = run_readelf(args.readelf, "-h", str(path))
        if header.returncode:
            records[key] = {"path": str(path), "machine": "NOT ELF", "needed": []}
            continue
        machine_match = MACHINE_RE.search(header.stdout)
        machine = machine_match.group(1) if machine_match else "unknown"
        dynamic = dynamic_info(args.readelf, path)
        needed = dynamic[0] if dynamic else []
        version_result = run_readelf(args.readelf, "-V", str(path))
        version_info = version_result.stdout.strip() if version_result.returncode == 0 else (
            version_result.stderr.strip() or "readelf -V unavailable"
        )
        records[key] = {
            "path": str(path),
            "machine": machine,
            "needed": needed,
            "versions": version_info,
        }

        for soname in needed:
            candidates = by_soname.get(soname) or by_name.get(soname) or []
            if not candidates:
                target = system_external if soname in system_sonames else missing
                target.setdefault(soname, []).append(str(path))
                continue
            dependency = choose(candidates)
            dep_key = str(dependency.resolve())
            if dep_key not in visited:
                queue.append(dependency)

    lines = [
        "Tizen ARM ELF dependency audit",
        "===============================",
        "",
        "Roots:",
        *[f"  {p}" for p in roots],
        "",
        "Search directories:",
        *[f"  {p}" for p in directories],
        "",
        f"ELF objects inspected: {len(records)}",
        f"Unresolved DT_NEEDED entries: {len(missing)}",
        "",
        "Dependency closure:",
    ]
    for record in sorted(records.values(), key=lambda item: item["path"]):
        lines.append(f"\n[{record['machine']}] {record['path']}")
        for needed in record["needed"]:
            lines.append(f"  NEEDED {needed}")

    lines.extend(["", "Unresolved dependencies:"])
    if missing:
        for soname in sorted(missing):
            lines.append(f"  {soname}")
            for requester in sorted(set(missing[soname])):
                lines.append(f"    required by: {requester}")
    else:
        lines.append("  none")

    lines.extend(["", "Platform-provided external dependencies:"])
    if system_external:
        for soname in sorted(system_external):
            lines.append(f"  {soname}")
            for requester in sorted(set(system_external[soname])):
                lines.append(f"    required by: {requester}")
    else:
        lines.append("  none")

    lines.extend(["", "ELF symbol-version information:", ""])
    for record in sorted(records.values(), key=lambda item: item["path"]):
        lines.append(f"--- {record['path']} ---")
        lines.append(record.get("versions", "No version information"))
        lines.append("")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"ELF objects inspected: {len(records)}")
    print(f"Unresolved DT_NEEDED entries: {len(missing)}")
    print(f"Platform-provided external DT_NEEDED entries: {len(system_external)}")
    print(f"Report: {args.output}")
    for soname in sorted(system_external):
        print(f"PLATFORM: {soname}")
        for requester in sorted(set(system_external[soname])):
            print(f"  required by: {requester}")
    if missing:
        for soname in sorted(missing):
            print(f"UNRESOLVED: {soname}")
            for requester in sorted(set(missing[soname])):
                print(f"  required by: {requester}")
        return 1
    print("No unclassified DT_NEEDED dependencies remain.")
    if system_external:
        print("The listed platform dependencies must be supplied by the target Tizen firmware at runtime.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
