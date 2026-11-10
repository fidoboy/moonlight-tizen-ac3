#!/usr/bin/env bash
# Download Tizen sources, headers and toolchain for a native Moonlight client
# on a Samsung TV with Tizen 5.5+ ARMv7l baseline (GCC 6.2 cross-toolchain, softfp).
#
# Usage: fetch-tizen-sources.sh [output-dir]   (default: ./tizen-deps)
# Needs: curl, unzip, and bsdtar (libarchive-tools) or rpm2cpio + cpio.
#
# Result:
#   <out>/src/      reference sources (esplusplayer, trackrenderer, capi-media-*)
#   <out>/sysroot/  Tizen 5.5 armv7l headers + libs to compile against
#   <out>/toolchain Tizen cross-arm-gcc-6.2 (same GCC major as the TV firmware)
#   <out>/rpm/      downloaded packages (kept for re-extraction)
#
# Note: libesplusplayer on the TV has an OLDER API (esplusplayer_add_*_stream_info)
# than any public source. The sources here are a reference only; struct layouts
# must still be checked against the TV binary.
set -euo pipefail

OUT=$(realpath -m "${1:-./tizen-deps}")
SNAP=https://download.tizen.org/snapshots/TIZEN
T55_BASE=$SNAP/Tizen-5.5/Tizen-5.5-Base/latest/repos/standard
T55_UNI=$SNAP/Tizen-5.5/Tizen-5.5-Unified/latest/repos/standard
T65_UNI=$SNAP/Tizen-6.5/Tizen-6.5-Unified/latest/repos/standard
SDK=https://download.tizen.org/sdk/tizenstudio/official/binary
TOOLCHAIN_ZIP=cross-arm-gcc-6.2_0.2.2_ubuntu-64.zip

mkdir -p "$OUT"/{rpm,src,sysroot}
declare -A LISTING

# Newest file in a directory listing whose name matches "<name>-<digit>...<suffix>".
pick() { # dir name suffix
  local dir=$1 name=$2 suffix=$3
  [[ -n ${LISTING[$dir]:-} ]] || LISTING[$dir]=$(curl -fsS --retry 3 "$dir/" | grep -oE 'href="[^"]+"' | cut -d'"' -f2 | sed 's/%2B/+/g')
  grep -E "^$(sed 's/[+.]/\\&/g' <<<"$name")-[0-9].*$suffix\$" <<<"${LISTING[$dir]}" | sort -V | tail -1
}

fetch() { # dir name suffix [quiet] -> prints local path, or nothing if not found
  local f; f=$(pick "$1" "$2" "$3")
  if [[ -z $f ]]; then
    [[ ${4:-false} == true ]] || echo "WARN: $2 not found in $1" >&2
    return 0
  fi
  [[ -s $OUT/rpm/$f ]] || curl -fsS --retry 3 -o "$OUT/rpm/$f" "$1/$(sed 's/+/%2B/g' <<<"$f")"
  echo "$OUT/rpm/$f"
}

unrpm() { # rpm destdir
  mkdir -p "$2"
  if command -v bsdtar >/dev/null; then bsdtar -xf "$1" -C "$2"
  else (cd "$2" && rpm2cpio "$1" | cpio -idm --quiet); fi
}

echo "== Reference sources"
for spec in "$T65_UNI/source esplusplayer" "$T65_UNI/source libtrackrenderer" \
            "$T55_UNI/source capi-media-player" "$T55_UNI/source capi-media-tool"; do
  read -r dir name <<<"$spec"
  r=$(fetch "$dir" "$name" '\.src\.rpm'); [[ -n $r ]] || continue
  d=$OUT/src/$(basename "$r" .src.rpm); rm -rf "$d"; unrpm "$r" "$d"
  for t in "$d"/*.tar.*; do [[ -e $t ]] && tar -xf "$t" -C "$d" && rm "$t"; done
  echo "   $d"
done

echo "== Tizen 5.5 armv7l sysroot"
BASE_PKGS="glibc glibc-devel libgcc libstdc++ libstdc++-devel"
# Runtime libraries required by the native ServiceApp and its engine. Ecore,
# EFL and Wayland are deliberately excluded: the engine sources do not use
# them, and linking Ecore would pull in an unrelated EFL/OpenSSL dependency tree.
RUNTIME_PKGS="libdlog libffi appcore-agent message-port bundle"
UNI_PKGS="capi-base-common-devel glib2-devel gstreamer-devel capi-media-tool-devel capi-media-player-devel
  capi-media-audio-io-devel
  capi-appfw-application-devel capi-appfw-app-common-devel capi-appfw-app-control-devel capi-appfw-service-application-devel
  appcore-agent-devel message-port-devel bundle-devel"
for p in $RUNTIME_PKGS; do
  r=$(fetch "$T55_UNI/packages/armv7l" "$p" '\.armv7l\.rpm')
  if [[ -n $r ]]; then
    unrpm "$r" "$OUT/sysroot"
  else
    echo "RUNTIME_PACKAGE_NOT_FOUND=$p" | tee -a "$OUT/runtime-package-audit.txt"
  fi
done
# Resolve runtime dependencies by their exact SONAME. Use repository-specific
# package mappings where metadata has confirmed the provider; retain a quiet
# two-repository probe only for dependencies whose provider is not yet pinned.
# Every extracted RPM is checked for the exact SONAME before it is accepted.
fetch_runtime_soname() { # soname repo package-name...
  local soname="$1" repo="$2" pkg rpm found
  shift 2
  case "$repo" in
    unified) repo="$T55_UNI/packages/armv7l" ;;
    base) repo="$T55_BASE/packages/armv7l" ;;
    auto) repo="" ;;
    *) echo "Invalid Tizen repository '$repo' for $soname" >&2; return 2 ;;
  esac
  local repos=()
  if [[ -n "$repo" ]]; then repos=("$repo"); else repos=("$T55_UNI/packages/armv7l" "$T55_BASE/packages/armv7l"); fi
  for repo in "${repos[@]}"; do
    for pkg in "$@"; do
      rpm=$(fetch "$repo" "$pkg" '.armv7l\.rpm' true)
      [[ -n "$rpm" ]] || continue
      unrpm "$rpm" "$OUT/sysroot"
      found=$(find "$OUT/sysroot" \( -type f -o -type l \) -name "$soname" -print -quit)
      if [[ -n "$found" && -e "$found" ]]; then
        echo "   $soname <- $(basename "$rpm")"
        return 0
      fi
    done
  done
  echo "MISSING: Tizen 5.5 ARM package providing $soname (repository: $repo; tried: $*)" >&2
  return 1
}

# zlib remains a possible dependency of the Tizen framework libraries.
fetch_runtime_soname libz.so.1 auto zlib libz

# ServiceApp and the selected Tizen framework libraries have additional
# runtime dependencies. Resolve these by exact SONAME from the same Tizen 5.5
# Unified/Base snapshots; development RPMs alone do not provide link-time
# implementations for these dependencies.
fetch_runtime_soname libaul.so.0 auto aul
fetch_runtime_soname libglib-2.0.so.0 auto libglib glib2 glib
fetch_runtime_soname libcapi-appfw-app-control.so.0 auto capi-appfw-app-control
fetch_runtime_soname libappcore-common.so.1 auto appcore-common app-core-common
fetch_runtime_soname libpkgmgr-info.so.0 auto pkgmgr-info
fetch_runtime_soname libgio-2.0.so.0 auto libgio
fetch_runtime_soname libgobject-2.0.so.0 auto libgobject
fetch_runtime_soname libcapi-base-common.so.0 auto capi-base-common
fetch_runtime_soname libjson-glib-1.0.so.0 auto libjson-glib json-glib
fetch_runtime_soname libxkbcommon.so.0 auto libxkbcommon xkbcommon
fetch_runtime_soname libffi.so.6 auto libffi
fetch_runtime_soname libeeze.so.1 auto eeze
fetch_runtime_soname libttrace.so.1 auto libttrace ttrace

# Transitive dependencies pulled in by the Tizen 5.0 ServiceApp framework
# libraries (aul, appcore, pkgmgr-info, GIO and Eeze). Each RPM is accepted
# only when it contains the exact SONAME required by the linker.
fetch_runtime_soname libxdgmime.so.1 auto xdgmime
fetch_runtime_soname libtzplatform-config-2.0.so.2 auto libtzplatform-config
fetch_runtime_soname libcapi-system-info.so.0 auto capi-system-info
fetch_runtime_soname libvconf.so.0 auto vconf-compat vconf
fetch_runtime_soname libsqlite3.so.0 base libsqlite
fetch_runtime_soname libiniparser.so.0 auto iniparser
fetch_runtime_soname libxml2.so.2 auto libxml2
fetch_runtime_soname libstorage.so.0.1 auto libstorage
fetch_runtime_soname libpcre.so.1 base libpcre
fetch_runtime_soname libsensor.so.4 unified sensord-dummy
fetch_runtime_soname libpkgmgr_parser.so.0 unified pkgmgr-info-parser
fetch_runtime_soname libminizip.so.1 auto minizip
fetch_runtime_soname libgmodule-2.0.so.0 auto libgmodule libglib glib2
fetch_runtime_soname libudev.so.1 unified libsystemd
fetch_runtime_soname libmount.so.1 auto libmount util-linux
for p in $BASE_PKGS; do r=$(fetch "$T55_BASE/packages/armv7l" "$p" '\.armv7l\.rpm'); [[ -n $r ]] && unrpm "$r" "$OUT/sysroot"; done
r=$(fetch "$T55_BASE/packages/noarch" linux-glibc-devel '\.noarch\.rpm'); [[ -n $r ]] && unrpm "$r" "$OUT/sysroot"
# The RPM %post normally links asm -> asm-<arch>; extraction skips scripts.
[[ -e $OUT/sysroot/usr/include/asm ]] || ln -s asm-arm "$OUT/sysroot/usr/include/asm"
for p in $UNI_PKGS; do r=$(fetch "$T55_UNI/packages/armv7l" "$p" '\.armv7l\.rpm'); [[ -n $r ]] && unrpm "$r" "$OUT/sysroot"; done

# DLog development RPMs have moved between Tizen 5.0 Unified and Base.
# Search both repositories for the matching Tizen 5.5 ARM package; never
# substitute headers from a newer Tizen release. Keep a focused audit because
# package-name matches alone do not prove that the RPM contains dlog.h.
DLOG_AUDIT="$OUT/dlog-package-audit.txt"
: > "$DLOG_AUDIT"
dlog_devel=""
dlog_repo=""
dlog_package=""
for repo in "$T55_UNI" "$T55_BASE"; do
  for p in tizen-dlog-devel dlog-devel libdlog-devel; do
    candidate=$(fetch "$repo/packages/armv7l" "$p" '\.armv7l\.rpm' true)
    if [[ -n "$candidate" ]]; then
      dlog_devel=$candidate
      dlog_repo=$repo
      dlog_package=$p
      break
    fi
  done
  [[ -n "$dlog_devel" ]] && break
done
if [[ -z "$dlog_devel" ]]; then
  {
    echo "RESULT: no DLog development RPM found"
    echo "Repositories searched:"
    echo "  $T55_UNI/packages/armv7l"
    echo "  $T55_BASE/packages/armv7l"
    echo "Package names tried: tizen-dlog-devel, dlog-devel, libdlog-devel"
  } | tee "$DLOG_AUDIT"
  echo "MISSING: Tizen 5.5 ARM DLog development RPM; see $DLOG_AUDIT" >&2
  exit 1
fi

# The DLog runtime package does not contain development headers. Extract the
# selected development RPM explicitly so dlog.h and libdlog.so enter sysroot.
unrpm "$dlog_devel" "$OUT/sysroot"

{
  echo "Selected package: $(basename "$dlog_devel")"
  echo "Matched package name: $dlog_package"
  echo "Repository: $dlog_repo"
  echo "RPM file: $dlog_devel"
  echo
  echo "Relevant paths recorded inside RPM:"
  if command -v bsdtar >/dev/null; then
    bsdtar -tf "$dlog_devel" | grep -Ei '(^|/)(dlog\.h|libdlog[^/]*|pkgconfig/.*dlog.*)$' || true
  elif command -v rpm2cpio >/dev/null && command -v cpio >/dev/null; then
    (cd "$OUT" && rpm2cpio "$dlog_devel" | cpio -t 2>/dev/null) | grep -Ei '(^|/)(dlog\.h|libdlog[^/]*|pkgconfig/.*dlog.*)$' || true
  else
    echo "Cannot list RPM contents: neither bsdtar nor rpm2cpio+cpio is available"
  fi
} | tee -a "$DLOG_AUDIT"

# Audit the Message Port development package as well. Its package is
# already part of UNI_PKGS; record the RPM's declared paths and extracted
# header location so package-content and include-path failures are distinct.
MESSAGE_PORT_AUDIT="$OUT/message-port-package-audit.txt"
message_port_rpm=$(fetch "$T55_UNI/packages/armv7l" message-port-devel '\.armv7l\.rpm')
if [[ -n "$message_port_rpm" ]]; then
  {
    echo "Selected package: $(basename "$message_port_rpm")"
    echo "Repository: $T55_UNI/packages/armv7l"
    echo "Relevant paths recorded inside RPM:"
    bsdtar -tf "$message_port_rpm" | grep -Ei '(^|/)(message_port\.h|libmessage-port[^/]*|pkgconfig/.*message.port.*)$' || true
  } | tee "$MESSAGE_PORT_AUDIT"
else
  echo "RESULT: message-port-devel RPM not found in Tizen 5.5 Unified" | tee "$MESSAGE_PORT_AUDIT"
fi
{
  echo
  echo "Header locations after extraction:"
  find "$OUT/sysroot/usr/include" -type f -name message_port.h -print | sort
  echo
  echo "Message Port library candidates:"
  find "$OUT/sysroot" \( -type f -o -type l \) -name 'libmessage-port.so*' -print | sort
} | tee -a "$MESSAGE_PORT_AUDIT"

echo "== Cross toolchain (GCC 6.2)"
if [[ ! -d $OUT/toolchain ]]; then
  curl -fsS --retry 3 -o "$OUT/rpm/$TOOLCHAIN_ZIP" "$SDK/$TOOLCHAIN_ZIP"
  unzip -q "$OUT/rpm/$TOOLCHAIN_ZIP" -d "$OUT/toolchain"
fi
gcc_bin=$(find "$OUT/toolchain" -name '*-gcc' -type f -perm -u+x | head -1)

# Self-check: the pieces the native client needs must be present.
missing=0
for f in usr/include/stdio.h usr/include/media/media_packet.h usr/include/gstreamer-1.0/gst/gst.h \
         usr/include/glib-2.0/glib.h; do
  [[ -e $OUT/sysroot/$f ]] || { echo "MISSING: sysroot/$f" >&2; missing=1; }
done
# Tizen packages may install DLog and Message Port headers in subdirectories.
# The service build adds each discovered parent directory to its include path.
message_port_header=$(find "$OUT/sysroot/usr/include" -type f -name message_port.h -print -quit)
[[ -n "$message_port_header" ]] || { echo "MISSING: Message Port header under sysroot/usr/include" >&2; missing=1; }
dlog_header=$(find "$OUT/sysroot/usr/include" -type f -name dlog.h -print -quit)
[[ -n "$dlog_header" ]] || { echo "MISSING: DLog header under sysroot/usr/include" >&2; missing=1; }
ls "$OUT"/src/esplusplayer-*/esplusplayer-*/include/esplusplayer_capi/esplusplayer_capi.h >/dev/null 2>&1 \
  || { echo "MISSING: esplusplayer reference headers" >&2; missing=1; }
[[ -n $gcc_bin ]] || { echo "MISSING: cross gcc in toolchain/" >&2; missing=1; }

echo
echo "Sources:   $OUT/src"
echo "Sysroot:   $OUT/sysroot"
echo "Compiler:  ${gcc_bin:-<not found>}"
echo "Tizen framework runtime dependencies were resolved from Tizen 5.5 ARM RPMs; WMP crypto and cURL are built privately as static ARM libraries."
exit "$missing"
