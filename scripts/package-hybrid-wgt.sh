set -euo pipefail
cc -O2 -Wall -Wextra -I/usr/include/libxml2 /workspace/scripts/xml-c14n.c -o "$RUNNER_TEMP/xml-c14n" -lxml2
run_tz() {
  local label="$1"
  shift
  local log="$RUNNER_TEMP/tz-${label//[^A-Za-z0-9_-]/_}.log"
  echo "::group::Tizen Core: $label"
  set +e
  "$@" 2>&1 | tee "$log"
  local statuses=("${PIPESTATUS[@]}")
  local command_status="${statuses[0]}"
  set -e
  echo "::endgroup::"
  if (( command_status != 0 )); then
    echo "::error::Tizen Core command failed with exit code $command_status: $*"
    return "$command_status"
  fi
}

TIZEN_CORE_CLI="/home/tizen/tizen-studio/tools/tizen-core/tz"
export TIZEN_STUDIO_DATA_PATH="/home/tizen/tizen-studio-data"
mkdir -p "$TIZEN_STUDIO_DATA_PATH"
        
cat > "$RUNNER_TEMP/tizen-package-expect.exp" <<'EXPECT'
set timeout -1
log_user 1
spawn {*}$argv
expect {
  -re {Author password:} { send -- "123456\r"; exp_continue }
  "Yes: (Y), No: (N) ?" { send -- "N\r"; exp_continue }
  eof
}
set status [wait]
exit [lindex $status 3]
EXPECT
chmod 600 "$RUNNER_TEMP/tizen-package-expect.exp"
        
run_tz "create-signing-certificate" tizen certificate -a Moonlight -f Moonlight -p 123456
author_key="$TIZEN_STUDIO_DATA_PATH/keystore/author/Moonlight.p12"
openssl pkcs12 -legacy -in "$author_key" -passin pass:123456 -noout
run_tz "register-signing-profile" tizen security-profiles add -n Moonlight -a "$author_key" -p 123456 -- "$TIZEN_STUDIO_DATA_PATH/profile"
profiles="$TIZEN_STUDIO_DATA_PATH/profile/profiles.xml"
test -s "$profiles"
author_encrypted='HeifNwdU+kk='
distributor_encrypted='Vy63flx5JBMc5GA4iEf8oFy+8aKE7FX/+arrDcO4I5k='
sed -i -E '/distributor="0"/ s|password="[^"]*"|password="'$author_encrypted'"|' "$profiles"
sed -i -E '/distributor="1"/ s|password="[^"]*"|password="'$distributor_encrypted'"|' "$profiles"
grep -Fq 'name="Moonlight"' "$profiles"
grep -Fq "$author_key" "$profiles"
awk -v expected="$author_encrypted" '/distributor="0"/ && index($0, "password=\"" expected "\"") { found=1 } END { exit !found }' "$profiles"
awk -v expected="$distributor_encrypted" '/distributor="1"/ && index($0, "password=\"" expected "\"") { found=1 } END { exit !found }' "$profiles"
! grep -Fq '.pwd' "$profiles"
run_tz "select-signing-profile" tizen cli-config "profiles.path=$profiles"
run_tz "list-signing-profile" tizen security-profiles list -n Moonlight
        
workspace="$RUNNER_TEMP/tz-production-workspace"
web_project="$workspace/MoonlightWeb"
service_project="$workspace/AmbilightService/AmbilightService"
wmp_service_project="$workspace/WmpService/WmpService"
mkdir -p "$workspace"
        
package_base_web() {
  local source="$1" name="$2" base_wgt="$3"
  local web="$workspace/$name"
  local base_project="$RUNNER_TEMP/$name-base-project"
  run_tz "create-web-project-$name" "$TIZEN_CORE_CLI" new -t Basic_Empty -n "$name" -T web -p tv-samsung-10.0 -w "$workspace"
  test -d "$web"
  cp -a "$source/." "$web/"
  # Keep the Tizen Core project metadata in the workspace because
  # later tz build commands still need it. Package a clean copy as
  # the base WGT, without the unused Basic_Empty template files.
  run_tz "set-web-build-type-$name" "$TIZEN_CORE_CLI" set -b Release -w "$web"
  grep -Fqx "build_type: Release" "$web/tizen_web_project.yaml"
  rm -rf "$base_project"
  mkdir -p "$base_project"
  cp -a "$web/." "$base_project/"
  rm -f "$base_project/tizen_web_project.yaml" "$base_project/css/style.css" "$base_project/main.js"
  rmdir "$base_project/css" 2>/dev/null || true
  run_tz "sign-base-web-wgt-$name" expect "$RUNNER_TEMP/tizen-package-expect.exp" tizen package -t wgt -- "$base_project"
  mapfile -t generated_wgts < <(find "$base_project" -maxdepth 1 -type f -name '*.wgt' -print | sort)
  if (( ${#generated_wgts[@]} != 1 )); then
    echo "::error::Expected exactly one base Web WGT in $base_project; found ${#generated_wgts[@]}."
    printf '%s\\n' "${generated_wgts[@]}"
    exit 1
  fi
  test -s "${generated_wgts[0]}"
  cp "${generated_wgts[0]}" "$base_wgt"
  unzip -tq "$base_wgt"
  if unzip -Z1 "$base_wgt" | grep -Fxq 'tizen_web_project.yaml' ||
     unzip -Z1 "$base_wgt" | grep -Fxq 'css/style.css' ||
     unzip -Z1 "$base_wgt" | grep -Fxq 'main.js'; then
    echo "::error::Unused Basic_Empty template files remain in base WGT $name."
    exit 1
  fi
}
        
package_base_web "$RUNNER_TEMP/web" MoonlightWeb "$RUNNER_TEMP/$BASE_WGT_NAME"
        
run_tz "create-dotnet-service" "$TIZEN_CORE_CLI" new -t TizenServiceApp -n AmbilightService -T dotnet -p tv-samsung-6.0 -w "$workspace"
test -d "$service_project"
rm -f "$service_project/AmbilightService_App.cs"
cp ambilight-service/Program.cs ambilight-service/VideoPlaneCapture.cs ambilight-service/WledOutput.cs "$service_project/"
cp ambilight-service/tizen-manifest.xml "$service_project/tizen-manifest.xml"
cp ambilight-service/TizenAmbilight.csproj "$service_project/AmbilightService.csproj"
cat > "$service_project/tizen_dotnet_project.yaml" <<'YAML'
csproj_file: AmbilightService.csproj
profile: tv-samsung
api_version: "6.0"
build_type: Release
signing_profile: Moonlight
files:
  - AmbilightService.csproj
  - Program.cs
  - VideoPlaneCapture.cs
  - WledOutput.cs
  - tizen-manifest.xml
  - shared/res/AmbilightService.png
deps: []
YAML
        
# Create WMP as a first-class Tizen Core .NET service project.
# Its managed sources, manifest and native engine payload are built and
# packaged by Tizen Core as a dependency of the main Web project.
run_tz "create-wmp-dotnet-service" "$TIZEN_CORE_CLI" new -t TizenServiceApp -n WmpService -T dotnet -p tv-samsung-6.0 -w "$workspace"
# Resolve the project root from Tizen Core metadata; do not assume the
# template's directory nesting.
mapfile -t wmp_project_metadata < <(find "$workspace/WmpService" -type f -name tizen_dotnet_project.yaml -print)
if (( ${#wmp_project_metadata[@]} != 1 )); then
  echo "::error::Expected exactly one WMP Tizen Core project metadata file; found ${#wmp_project_metadata[@]}."
  printf '%s\\n' "${wmp_project_metadata[@]}"
  exit 1
fi
wmp_service_project="$(dirname "${wmp_project_metadata[0]}")"
test -f "$wmp_service_project/tizen-manifest.xml"
rm -f "$wmp_service_project/WmpService_App.cs"
cp wmp/dotnet-host/Program.cs \
   wmp/dotnet-host/EngineApi.cs \
   wmp/dotnet-host/HostLog.cs \
   wmp/dotnet-host/HostProtocol.cs \
   wmp/dotnet-host/ManualLoader.cs \
   wmp/dotnet-host/WmpSupervisor.cs \
   "$wmp_service_project/"
cp wmp/dotnet-host/MoonlightHost.csproj "$wmp_service_project/MoonlightHost.csproj"
# The Tizen Core project has its own generated icon; discard the upstream relative icon reference.
sed -i '/<None Include="..\/..\/res\/icon.png"/d' "$wmp_service_project/MoonlightHost.csproj"
cp wmp/dotnet-host/tizen-manifest.xml "$wmp_service_project/tizen-manifest.xml"
python3 - "$wmp_service_project/tizen-manifest.xml" "$web_project/config.xml" <<'PY'
import sys
import xml.etree.ElementTree as ET

manifest_path, config_path = sys.argv[1:]
ET.register_namespace("", "http://tizen.org/ns/packages")
manifest_tree = ET.parse(manifest_path)
manifest = manifest_tree.getroot()
config = ET.parse(config_path).getroot()
version = config.get("version")
if not version:
    raise SystemExit("Moonlight config.xml has no package version")
if manifest.get("package") != "MoonLightS" or manifest.get("api-version") != "6.0":
    raise SystemExit("WMP .NET package must target Tizen 6.0 / API 8")
manifest.set("version", version)
manifest_tree.write(manifest_path, encoding="UTF-8", xml_declaration=True)
print(f"WMP Tizen Core project manifest version synchronized to {version}.")
PY
test -s wmp/dotnet-host/lib/libmlengine.so
mkdir -p "$wmp_service_project/lib"
cp wmp/dotnet-host/lib/libmlengine.so "$wmp_service_project/lib/libmlengine.so"
cat > "$wmp_service_project/tizen_dotnet_project.yaml" <<'YAML'
csproj_file: MoonlightHost.csproj
profile: tv-samsung
api_version: "6.0"
build_type: Release
signing_profile: Moonlight
files:
  - MoonlightHost.csproj
  - Program.cs
  - EngineApi.cs
  - HostLog.cs
  - HostProtocol.cs
  - ManualLoader.cs
  - WmpSupervisor.cs
  - tizen-manifest.xml
  - lib/libmlengine.so
  - shared/res/WmpService.png
deps: []
YAML

run_tz "build-web-standalone" "$TIZEN_CORE_CLI" build -w "$web_project" -s Moonlight -b Release
ambilight_dependency="$(realpath --relative-to="$web_project" "$service_project")"
wmp_dependency="$(realpath --relative-to="$web_project" "$wmp_service_project")"
test -f "$service_project/tizen_dotnet_project.yaml"
test -f "$wmp_service_project/tizen_dotnet_project.yaml"
echo "Tizen Core dependencies: $ambilight_dependency,$wmp_dependency"

# Capture both generated dependency projects immediately before add-deps.
# This is diagnostic only: it does not modify either project.
echo "::group::Tizen Core dependency project comparison"
for project in "$service_project" "$wmp_service_project"; do
  echo "===== PROJECT ROOT: $project ====="
  printf 'resolved='
  realpath "$project"
  stat -c 'directory mode=%A owner=%U:%G inode=%i' "$project"
  echo "--- FILE TREE (depth <= 5) ---"
  find "$project" -maxdepth 5 -printf '%y %P\\n' | sort
  for file in tizen_dotnet_project.yaml tizen-manifest.xml; do
    if [[ -f "$project/$file" ]]; then
      echo "--- $file ---"
      cat "$project/$file"
    else
      echo "::warning::Missing $file in $project"
    fi
  done
  mapfile -t project_files < <(find "$project" -maxdepth 1 -type f \\( -name '*.csproj' -o -name '*.cs' \\) -printf '%f\\n' | sort)
  for file in "${project_files[@]}"; do
    echo "--- $file ---"
    cat "$project/$file"
  done
done
echo "===== YAML DIFF: Ambilight -> WMP ====="
diff -u "$service_project/tizen_dotnet_project.yaml" "$wmp_service_project/tizen_dotnet_project.yaml" || true
echo "===== MANIFEST DIFF: Ambilight -> WMP ====="
diff -u "$service_project/tizen-manifest.xml" "$wmp_service_project/tizen-manifest.xml" || true
echo "===== CSPROJ DIFF: Ambilight -> WMP ====="
ambilight_csproj="$(find "$service_project" -maxdepth 1 -type f -name '*.csproj' -print -quit)"
wmp_csproj="$(find "$wmp_service_project" -maxdepth 1 -type f -name '*.csproj' -print -quit)"
if [[ -n "$ambilight_csproj" && -n "$wmp_csproj" ]]; then
  diff -u "$ambilight_csproj" "$wmp_csproj" || true
else
  echo "::warning::Could not locate both service project files for comparison."
fi
echo "::endgroup::"

run_tz "add-service-dependencies" "$TIZEN_CORE_CLI" add-deps "$web_project" -d "$ambilight_dependency,$wmp_dependency"
run_tz "build-hybrid" "$TIZEN_CORE_CLI" build -w "$web_project" -s Moonlight -b Release
        
# Tizen Core builds both .NET service projects through the Web project's
# dependency graph. Collect their signed TPKs for the final hybrid pack.
mapfile -t service_pkgs < <(find "$service_project/bin/Release/tizen80" -type f -name '*.tpk' -not -path '*/obj/*' | sort)
if (( ${#service_pkgs[@]} != 1 )); then
  echo "::error::Expected exactly one Ambilight Tizen 6.0 / API 8 service TPK; found ${#service_pkgs[@]}."
  printf '%s\\n' "${service_pkgs[@]}"
  exit 1
fi
service_tpk="${service_pkgs[0]}"
test -s "$service_tpk"
echo "Ambilight service TPK: $service_tpk"
unzip -tq "$service_tpk"

mapfile -t wmp_pkgs < <(find "$wmp_service_project/bin/Release/tizen80" -type f -name '*.tpk' -not -path '*/obj/*' | sort)
if (( ${#wmp_pkgs[@]} != 1 )); then
  echo "::error::Expected exactly one WMP Tizen 6.0 / API 8 service TPK; found ${#wmp_pkgs[@]}."
  printf '%s\\n' "${wmp_pkgs[@]}"
  exit 1
fi
wmp_tpk="${wmp_pkgs[0]}"
test -s "$wmp_tpk"
unzip -tq "$wmp_tpk"
python3 - "$wmp_tpk" <<'PY'
import sys, zipfile
import xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as package:
    names = set(package.namelist())
    required = {"bin/MoonlightHost.dll", "res/lib/libmlengine.so", "tizen-manifest.xml"}
    missing = sorted(required - names)
    if missing:
        raise SystemExit("WMP TPK is missing: " + ", ".join(missing))
    if not package.read("bin/MoonlightHost.dll") or not package.read("res/lib/libmlengine.so"):
        raise SystemExit("WMP TPK contains an empty managed host or engine library")
    manifest = ET.fromstring(package.read("tizen-manifest.xml"))
    apps = [n for n in manifest.iter() if n.tag.endswith("service-application")]
    app_by_id = {app.get("appid"): app for app in apps}
    expected_ids = {"MoonLightS.WmpService", "MoonLightS.WmpSupervisor"}
    if manifest.get("package") != "MoonLightS" or manifest.get("api-version") != "6.0":
        raise SystemExit("WMP TPK must target Tizen 6.0 / API 8")
    if len(apps) != 2 or set(app_by_id) != expected_ids:
        raise SystemExit(
            "WMP TPK must contain exactly the WMP service and its independent supervisor; "
            f"found {sorted(app_by_id)!r}"
        )
    for app_id, app in app_by_id.items():
        if app.get("exec") != "MoonlightHost.dll" or app.get("type") != "dotnet" or app.get("api-version") != "8":
            raise SystemExit(f"WMP TPK service {app_id} must use the Tizen API 8 .NET host")
        if not any(
            n.tag.endswith("background-category") and n.get("value") == "background-network"
            for n in app
        ):
            raise SystemExit(f"WMP TPK service {app_id} is missing background-network capability")
print("WMP Tizen Core dependency TPK payload and manifest verified.")
PY
echo "WMP service TPK: $wmp_tpk"

package_hybrid() {
  local source="$1" name="$2" base_wgt="$3" output="$4"
  local draft="$RUNNER_TEMP/$name-unsigned.wgt"
  local project="$RUNNER_TEMP/$name-final-project"

  # 1. Assemble the hybrid WGT without asking Tizen Core to sign it.
  run_tz "pack-hybrid-wgt-$name" "$TIZEN_CORE_CLI" pack --type wgt --ref-pkgs "$service_tpk;$wmp_tpk" --base-pkg "$base_wgt" --out-path "$draft"
  test -s "$draft"
  unzip -tq "$draft"

  # 2. Expand the assembled package so the standard Tizen CLI can sign
  #    the complete hybrid payload, including the embedded service TPK.
  rm -rf "$project"
  mkdir -p "$project"
  unzip -q "$draft" -d "$project"

  # Verify the managed WMP service and its private engine payload are present.
  test -s "$project/bin/MoonlightHost.dll"
  test -s "$project/res/lib/libmlengine.so"

  # 3. Keep the Web installation floor at Tizen 5.5 and explicitly
  #    merge both service-application declarations into the outer manifest.
  #    Tizen Core embeds the referenced TPK payloads, but does not merge
  #    every referenced service application into this manifest.
  python3 scripts/normalize-hybrid-manifest.py "$project/tizen-manifest.xml" "$service_tpk" "$wmp_tpk"

  # 4. Sign the already assembled hybrid project with the standard
  #    Tizen package command. Prompts match the AC3 Dockerfile.
  cat > "$RUNNER_TEMP/tizen-package-expect.exp" <<'EXPECT'
set timeout -1
log_user 1
spawn {*}$argv
expect {
  -re {Author password:} { send -- "123456\r"; exp_continue }
  "Yes: (Y), No: (N) ?" { send -- "N\r"; exp_continue }
  eof
}
set status [wait]
exit [lindex $status 3]
EXPECT
  chmod 600 "$RUNNER_TEMP/tizen-package-expect.exp"
  expect "$RUNNER_TEMP/tizen-package-expect.exp" tizen package -t wgt -- "$project"

  test -s "$project/Moonlight.wgt"
  cp "$project/Moonlight.wgt" "$output"

  unzip -tq "$output"

  # Verify the XML signatures cryptographically using the certificates
  # embedded in each signature, including all referenced package digests.
  local signature_check="$RUNNER_TEMP/$name-signature-check"
  rm -rf "$signature_check"
  mkdir -p "$signature_check"
  unzip -q "$output" -d "$signature_check"

  author_certificate="$RUNNER_TEMP/author-signing-certificate.pem"
  distributor_certificate="$RUNNER_TEMP/distributor-signing-certificate.pem"
  openssl pkcs12 -legacy -in "/home/tizen/tizen-studio-data/keystore/author/Moonlight.p12" \
    -clcerts -nokeys -passin pass:123456 -out "$author_certificate"
  distributor_password="$(printf '%s' 'dGl6ZW5wa2NzMTJwYXNzZm9yZHNpZ25lcg==' | base64 -d)"
  openssl pkcs12 -legacy -in "/home/tizen/tizen-studio/tools/certificate-generator/certificates/distributor/tizen-distributor-signer.p12" \
    -clcerts -nokeys -passin "pass:$distributor_password" -out "$distributor_certificate"
  python3 scripts/verify-tizen-xmlsig.py "$signature_check" \
    "$author_certificate" "$distributor_certificate" /runner-temp/xml-c14n

  # 5. Validate the final signed WGT, not the unsigned tz pack output.
  python3 - "$output" "$service_tpk" "$wmp_tpk" "$source" <<'PY'
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath

package_path, service_tpk_path, wmp_tpk_path, source_path = map(Path, sys.argv[1:])
with zipfile.ZipFile(package_path) as package, zipfile.ZipFile(service_tpk_path) as service, zipfile.ZipFile(wmp_tpk_path) as wmp:
    names = set(package.namelist())
    service_names = set(service.namelist())
    wmp_names = set(wmp.namelist())
    # Tizen Core's hybrid packer expands the referenced service TPK
    # into the outer WGT; it does not retain a nested .tpk archive.
    # Verify every service payload member byte-for-byte at its
    # package-root path. The service manifest/signatures are metadata
    # and are represented by the combined outer manifest/signatures.
    service_metadata = {
        "tizen-manifest.xml", "author-signature.xml",
        "signature1.xml", "signature2.xml",
    }
    embedded_service_count = 0
    for label, archive, archive_names in (
        ("Ambilight", service, service_names),
        ("WMP", wmp, wmp_names),
    ):
        service_payload = {
            name for name in archive_names
            if not name.endswith("/") and name not in service_metadata
        }
        missing_service = sorted(service_payload - names)
        if missing_service:
            raise SystemExit(
                f"Final hybrid WGT is missing expanded {label} TPK files: "
                + ", ".join(missing_service)
            )
        changed_service = [
            name for name in sorted(service_payload)
            if package.read(name) != archive.read(name)
        ]
        if changed_service:
            raise SystemExit(
                f"Expanded {label} TPK payload changed during hybrid signing: "
                + ", ".join(changed_service)
            )
        embedded_service_count += len(service_payload)

    required = {
        "config.xml", "tizen-manifest.xml", "author-signature.xml",
        "signature1.xml", "bin/MoonlightHost.dll", "res/lib/libmlengine.so",
        "res/wgt/config.xml", "res/wgt/index.html",
        "res/wgt/moonlight-wasm.js", "res/wgt/moonlight-wasm.wasm",
        "res/wgt/service/service.js",
    }
    missing = sorted(required - names)
    if missing:
        raise SystemExit("Final signed hybrid WGT missing: " + ", ".join(missing))

    ds = "{http://www.w3.org/2000/09/xmldsig#}"
    for signature_name in ("author-signature.xml", "signature1.xml"):
        try:
            signature_root = ET.fromstring(package.read(signature_name))
        except ET.ParseError as exc:
            raise SystemExit(f"Invalid {signature_name}: {exc}")
        signatures = list(signature_root.iter(ds + "Signature"))
        if not signatures:
            raise SystemExit(f"{signature_name} contains no XML Digital Signature")
        for signature in signatures:
            value = signature.find(".//" + ds + "SignatureValue")
            refs = signature.findall(".//" + ds + "Reference")
            if value is None or not (value.text or "").strip():
                raise SystemExit(f"{signature_name} has an empty SignatureValue")
            if not refs or any(
                ref.find(ds + "DigestValue") is None or
                not (ref.find(ds + "DigestValue").text or "").strip()
                for ref in refs
            ):
                raise SystemExit(f"{signature_name} has missing reference digests")

    manifest = ET.fromstring(package.read("tizen-manifest.xml"))
    service_app_nodes = [
        node for node in manifest.iter()
        if node.tag.endswith("service-application")
    ]
    service_app_ids = [node.get("appid") for node in service_app_nodes]
    expected_service_ids = {
        "MoonLightS.MoonlightAmbilight",
        "MoonLightS.WmpService",
        "MoonLightS.WmpSupervisor",
    }
    if len(service_app_nodes) != 3 or set(service_app_ids) != expected_service_ids:
        raise SystemExit(
            "Final hybrid manifest must declare Ambilight, WMP and its independent supervisor; "
            f"found {service_app_ids!r}"
        )
    if manifest.get("package") != "MoonLightS" or manifest.get("api-version") != "5.5":
        raise SystemExit("Final hybrid package identity/API floor changed")
    root_metadata = {
        "label": "Moonlight Tizen Services",
        "author": "Moonlight Tizen",
        "description": "Native Moonlight Tizen services: WMP playback, process supervision and Ambilight.",
    }
    for tag, expected in root_metadata.items():
        node = manifest.find("{http://tizen.org/ns/packages}" + tag)
        if node is None or (node.text or "").strip() != expected:
            raise SystemExit(f"Final hybrid package {tag} must be {expected!r}")
    web_config = ET.parse(source_path / "config.xml").getroot()
    if manifest.get("version") != web_config.get("version"):
        raise SystemExit("Final hybrid package version differs from the embedded Moonlight Web version")
    service_apps = {node.get("appid"): node for node in service_app_nodes}
    ambilight_app = service_apps["MoonLightS.MoonlightAmbilight"]
    expected_ambilight = {
        "api-version": "8",
        "exec": "MoonlightAmbilight.dll",
        "type": "dotnet",
        "nodisplay": "true",
        "on-boot": "false",
        "auto-restart": "false",
        "multiple": "false",
        "taskmanage": "false",
    }
    for key, value in expected_ambilight.items():
        if ambilight_app.get(key) != value:
            raise SystemExit(f"Final Ambilight service manifest {key} must be {value!r}")
    if not any(
        node.tag.endswith("background-category") and node.get("value") == "background-network"
        for node in ambilight_app
    ):
        raise SystemExit("Final Ambilight service is missing background-network capability")
    if "bin/MoonlightAmbilight.dll" not in names or not package.read("bin/MoonlightAmbilight.dll"):
        raise SystemExit("Final WGT is missing the Ambilight service assembly")
    wmp_app = service_apps["MoonLightS.WmpService"]
    expected_wmp = {
        "exec": "MoonlightHost.dll",
        "api-version": "8",
        "nodisplay": "true",
        "on-boot": "false",
        "auto-restart": "false",
        "multiple": "false",
        "type": "dotnet",
        "taskmanage": "false",
    }
    if "bin/MoonlightHost.dll" not in names or not package.read("bin/MoonlightHost.dll"):
        raise SystemExit("Final WGT is missing the WMP .NET service assembly")
    for key, value in expected_wmp.items():
        if wmp_app.get(key) != value:
            raise SystemExit(f"Final WMP service manifest {key} must be {value!r}")
    if not any(
        node.tag.endswith("background-category") and node.get("value") == "background-network"
        for node in wmp_app
    ):
        raise SystemExit("Final WMP service is missing background-network capability")
    supervisor_app = service_apps["MoonLightS.WmpSupervisor"]
    for key, value in expected_wmp.items():
        if supervisor_app.get(key) != value:
            raise SystemExit(f"Final WMP supervisor manifest {key} must be {value!r}")
    if not any(
        node.tag.endswith("background-category") and node.get("value") == "background-network"
        for node in supervisor_app
    ):
        raise SystemExit("Final WMP supervisor is missing background-network capability")
    required_privileges = {
        "http://tizen.org/privilege/internet",
        "http://tizen.org/privilege/network.get",
        "http://tizen.org/privilege/appmanager.launch",
        "http://developer.samsung.com/privilege/esplay",
    }
    declared_privileges = {
        (node.text or "").strip() for node in manifest.iter()
        if node.tag.endswith("privilege")
    }
    if not required_privileges <= declared_privileges:
        raise SystemExit("Final hybrid manifest is missing required WMP/ESPlus privileges")

    for name in names:
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"Unsafe path in final hybrid WGT: {name}")

    for item in source_path.rglob("*"):
        if item.is_file():
            member = "res/wgt/" + item.relative_to(source_path).as_posix()
            if member not in names or package.read(member) != item.read_bytes():
                raise SystemExit("Moonlight Web payload changed or missing after signing: " + member)

    config = ET.fromstring(package.read("res/wgt/config.xml"))
    if any(node.tag.endswith("video_splash_screen") for node in config.iter()):
        raise SystemExit("Obsolete native video splash declaration remains in the WGT")
    obsolete_splash_assets = sorted(
        name for name in names
        if name.startswith("res/wgt/static/res/launch-screen")
    )
    if obsolete_splash_assets:
        raise SystemExit(
            "Obsolete static/animated splash assets remain in the WGT: "
            + ", ".join(obsolete_splash_assets)
        )


    print("Final signed hybrid WGT verified:")
    print(f"  Expanded Ambilight and WMP .NET TPK payloads byte-for-byte preserved: {embedded_service_count} files.")
    print("  Author and distributor XML signatures are present and structurally valid.")
    print("  Moonlight Web payload and manifest are preserved; obsolete native splash assets are absent.")
PY
}

package_hybrid "$RUNNER_TEMP/web" MoonlightWeb "$RUNNER_TEMP/$BASE_WGT_NAME" "$RUNNER_TEMP/$BUILD_OUTPUT_NAME"
mkdir -p "$RUNNER_TEMP/hybrid-output"
cp "$RUNNER_TEMP/$BUILD_OUTPUT_NAME" "$RUNNER_TEMP/hybrid-output/$BUILD_OUTPUT_NAME"
(cd "$RUNNER_TEMP/hybrid-output" && sha256sum "$BUILD_OUTPUT_NAME" > SHA256SUMS)

