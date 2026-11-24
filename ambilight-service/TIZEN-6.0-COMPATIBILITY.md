# Tizen 6.0 capture compatibility investigation

**Status:** in progress  
**Branch:** `1.3.1-pre`  
**Last updated:** 2026-11-24  
**Scope:** Samsung TV capture compatibility on Tizen 6.0 while retaining the `tizen80` application target.

## 1. Objective and compatibility policy

Ambilight must remain buildable for the existing Moonlight Tizen 6.0 platform baseline. The service must therefore continue targeting **`tizen80` / Tizen API 8**, with a Tizen 6.0 package manifest and service-application API level 8. A newer Tizen target must not be introduced merely to make the capture implementation work on newer televisions.

The investigation has two separate questions:

1. **Application/runtime compatibility:** can the service be installed and run on the Tizen 6.0 .NET runtime?
2. **Capture ABI/platform compatibility:** does that firmware expose a compatible video-capture implementation, ABI, permissions and runtime behaviour?

A successful answer to the first question does not imply a successful answer to the second. The reported `rc=-95` on a Tizen 6.0 QN90A is a concrete warning against conflating them.

The objective is not to port the newer projects wholesale. Their capture research is useful evidence, but every native ABI assumption must be checked against Tizen 6.0 firmware before it is adopted.

## 2. Current Moonlight service target

The current `1.3.1-pre` service project is configured as follows:

| Setting | Current value |
|---|---|
| Tizen .NET SDK | `Tizen.NET.Sdk/1.1.6` |
| Target framework | `tizen80` |
| Package manifest API | `6.0` |
| Service application API | `8` |
| Tizen profile | `tv` |
| Intended platform profile | `tv-samsung-6.0` |
| Service startup | On demand; `on-boot=false`, `auto-restart=false` |

Sources in this repository:

- [TizenAmbilight.csproj](TizenAmbilight.csproj)
- [tizen-manifest.xml](tizen-manifest.xml)
- [Ambilight service README](README.md)

These values are intentional and must be preserved during this investigation. The outer hybrid WGT's API floor is a separate packaging concern; it does not change the embedded service's target.

## 3. Comparison projects

The two supplied projects are related: **nithino/tizenambilight is a fork of RitwickVerma/TizenAmbilight**. They should not be treated as two independent implementations or two independent confirmations of the same native ABI.

Repositories:

- [RitwickVerma/TizenAmbilight](https://github.com/RitwickVerma/TizenAmbilight)
- [nithino/tizenambilight](https://github.com/nithino/tizenambilight)

### 3.1 Target framework and API floor

The inspected project files show:

| Project | Tizen .NET SDK | Target framework |
|---|---|---|
| RitwickVerma/TizenAmbilight | `Tizen.NET.Sdk/1.1.9` | `tizen90` |
| nithino/tizenambilight | `Tizen.NET.Sdk/1.1.9` | `tizen90` |
| Moonlight Ambilight | `Tizen.NET.Sdk/1.1.6` | `tizen80` |

The external READMEs state that their manifest asks for API level 6.5 while their project targets `tizen90`. These are distinct settings: the manifest API floor does not turn a `tizen90` binary into a `tizen80` application, nor does it establish compatibility with a Tizen 6.0 runtime.

### 3.2 What their compatibility reports actually establish

The inspected RitwickVerma README reports:

| TV / Tizen | Reported result | Evidential status |
|---|---|---|
| 2025 Samsung S84F / Tizen 9.0 | Video-plane capture works | Tested on this one model |
| Same S84F after Tizen 10.0 update | Video-plane capture works | Tested on this one model |
| 2023 Samsung S90C / Tizen 8.0 | `tizen90` app reportedly starts, but full-frame capture is blocked; hardware RGB sampler works | One report; not general Tizen 8 compatibility |
| 2021 Samsung QN90A / Tizen 6.0 | App reportedly starts only after retargeting to `tizen80`; video-plane API is present but returns `rc=-95` | One report; cause and signing conditions unresolved |
| Older than Tizen 6.0 | Unknown | Not established |

The nithino fork's README is more conservative: it reports testing on the S84F / Tizen 9 only, lists Tizen 6.5–8.0 as untested and Tizen 6.0 or older as unknown, probably requiring porting work.

Consequently:

- Neither repository establishes general compatibility with Tizen 6.0.
- The Tizen 6.0 QN90A report is useful but does not establish that all Tizen 6.0 televisions return `-95`.
- The reported Tizen 8.0 S90C result also shows that framework/runtime launch and video-plane capture availability are separate compatibility dimensions.
- The two repositories share ancestry, so overlapping documentation or code is not independent corroboration.

References:

- [RitwickVerma compatibility documentation](https://github.com/RitwickVerma/TizenAmbilight#compatibility)
- [RitwickVerma engineering notes](https://github.com/RitwickVerma/TizenAmbilight/blob/master/docs/how-it-works.md)
- [nithino compatibility documentation](https://github.com/nithino/tizenambilight#compatibility)
- [nithino engineering notes](https://github.com/nithino/tizenambilight/blob/master/docs/how-it-works.md)

## 4. Capture design used by the comparison projects

The comparison projects describe the primary video source as:

```text
libvideo-capture.so.0.1.0
  └── secvideo_api_capture_video_main(width, height, param)
        └── caller-owned Y and chroma buffers
              └── 960 × 540 NV12 video plane
```

Their documented parameter structure uses 32-bit pointer fields at offsets `+0x10` and `+0x14`, followed by output fields including returned dimensions, interlace state and pitches. Their implementation dynamically loads the library and resolves the entry point.

The comparison project's documented return codes are:

| Return code | Meaning claimed by that project |
|---|---|
| `0` | Capture succeeded |
| `-1` | Not ready |
| `-2` | Scaler failure |
| `-4` | Copy-protected content |

**Do not assume these meanings are valid on every firmware or model.** In particular, `-95` is reported on one Tizen 6.0 QN90A, but its meaning has not yet been established from the Tizen 6.0 implementation or device-side testing.

The comparison projects also describe `libvideoenhance.so` / `ppi_ve_*` as a colour-measurement fallback for DRM-protected playback. That fallback is outside the scope of the present Tizen 6.0 video-plane investigation. The PPI backend in Moonlight remains opt-in and is not being treated as a solution to the current capture failure.

## 5. Tizen 6.0 firmware evidence collected

### 5.1 Test device and extraction

The following two libraries were pulled from a physical Samsung **UE50AU7172UXXH**, running **Tizen 6.0**:

| Device-side path | Local analysis filename | Size |
|---|---|---:|
| `/usr/lib/libtzcapturec.so` | `libtzcapturec.so` | 13,728 bytes |
| `/usr/lib/libvideo-capture-impl-sec.so.0.1.0` | `libvideo-capture-impl-sec.so.0.1.0` | 47,844 bytes |

The files were retrieved using SDB file transfer. No interactive shell on the production TV was used.

SHA-256:

| File | SHA-256 |
|---|---|
| `libtzcapturec.so` | `38a18064baa1422a2c4535d7df7ae40db89a3126ad1f3b097e698c642509d7cc` |
| `libvideo-capture-impl-sec.so.0.1.0` | `d84c21e8216fc90734af62e039fcd33292c15091ddb3fb3743788a8f86e89303` |

ELF header observations for both files:

- ELF32, little-endian, ARM, EABI5.
- Shared objects (`ET_DYN`).
- Stripped.
- ELF flags: `0x5000200`.
- `llvm-readelf -A` returned `BuildAttributes {}`; therefore the available attributes do not establish `Tag_ABI_VFP_args` or prove the hard-float calling convention. Do not infer that from the EABI flags alone.

Build IDs:

| File | Build ID |
|---|---|
| `libtzcapturec.so` | `829c0cd5d6f9f1db9459a6a7750d7ad58d063a44` |
| `libvideo-capture-impl-sec.so.0.1.0` | `6dbd1561d9041af555a840163d61b2e9980156f9` |

### 5.2 Findings from dynamic symbols and dependencies

The initial symbol/dependency inspection identified the following public functions in `libtzcapturec.so`:

- `isTZCAPTUREError`
- `TZCAPTURE_Initialize`
- `TZCAPTURE_Finalize`
- `TZCAPTURE_Secure_Capture`
- `TZCAPTURE_Capture_screen`

The library depends on `libteec.so` and imports GlobalPlatform TEE Client API functions including:

- `TEEC_InitializeContext`
- `TEEC_OpenSession`
- `TEEC_AllocateSharedMemory`
- `TEEC_InvokeCommand`
- `TEEC_ReleaseSharedMemory`
- `TEEC_CloseSession`
- `TEEC_FinalizeContext`

This establishes that the Tizen 6.0 `libtzcapturec.so` is a TEE client interface. Its secure-capture operations communicate with a Trusted Application through the TEE Client API; this is not an ordinary userspace framebuffer-copy interface.

The inspected SEC implementation imports `TZCAPTURE_Initialize`, `TZCAPTURE_Capture_screen` and `TZCAPTURE_Finalize`. Its dynamic dependencies include `libdrm.so.2`, `libvideo-capture.so.0`, `libhdr-conversion.so.0` and `libambient-linker.so.0`, among other Tizen libraries.

Notable exported symbols in `libvideo-capture-impl-sec.so.0.1.0` include:

| Symbol | Address | Size |
|---|---:|---:|
| `scaler_capture` | `0x4e50` | 2316 |
| `scaler_capture_secure` | `0x60e8` | 1912 |
| `scaler_capture_execute` | `0x38b4` | 476 |
| `scaler_capture_fill_captbuff` | `0x43f0` | 2128 |
| `scaler_capture_secure_fill_captbuff` | `0x58e0` | 2056 |
| `scaler_capture_is_protect` | `0x575c` | 388 |
| `CaptureSecImpl::getVideoMainYUV` | `0x8748` | 388 |
| `CaptureSecImpl::isProtectCapture` | `0x7488` | 164 |

Other exported methods indicate several capture sources, including video main, video sub, video post, screen post and cropped video main.

**Interpretation (preliminary):** the Tizen 6.0 SEC implementation contains both conventional scaler/DRM-related capture machinery and a separate secure-capture path backed by TZCAPTURE/TEE. The symbols show that both paths exist in this library. They do not yet prove the exact conditions under which the implementation selects each path, nor that the public `secvideo_api_capture_video_main` call reaches a particular one.

### 5.3 Important distinction between the extracted libraries

The extracted `libvideo-capture-impl-sec.so.0.1.0` is not the same file as `libvideo-capture.so.0.1.0`, which is the library named by the comparison projects and by the current video-plane backend.

The SEC implementation declares a dependency on `libvideo-capture.so.0`, but that dependency does not establish that the exact `.0.1.0` library was extracted or that its exported API matches the newer firmware ABI.

**The actual Tizen 6.0 `libvideo-capture.so.0` / `.0.1.0` binary still needs to be acquired and inspected.** This is a key missing piece before drawing conclusions about the public capture entry point and the `rc=-95` result.

## 6. Current Moonlight implementation constraints

The current service implementation is in [VideoPlaneCapture.cs](VideoPlaneCapture.cs). It dynamically loads `libvideo-capture.so.0.1.0`, resolves `secvideo_api_capture_video_main` and uses a 32-bit parameter layout with caller-owned buffers.

The current implementation deliberately rejects a process where `IntPtr.Size != 4`, because the pointer fields in the recovered structure are 32-bit. This guard must not be removed based on assumptions from a newer firmware or a different architecture.

The existing 960×540 NV12 assumptions and parameter offsets must be treated as **ABI hypotheses for Tizen 6.0 until checked against the actual Tizen 6.0 public library and implementation**. Similarity to the newer project's structure is useful, but it is not proof of binary compatibility.

No code change is implied by this document. In particular, do not change the project target, manifest API, capture structure, native call signature or permissions until the remaining ABI and runtime questions are answered.

## 7. Outstanding investigation

The following work is required, in this order:

1. **Acquire the exact public capture library from the Tizen 6.0 TV.** Pull `/usr/lib/libvideo-capture.so.0` and resolve whether it is a symlink or the versioned implementation. Record its size, Build ID and SHA-256.
2. **Inspect its dynamic exports and dependencies.** Confirm whether `secvideo_api_capture_video_main` exists, its symbol type/version, and its relationship to `libvideo-capture-impl-sec.so.0.1.0`.
3. **Disassemble all three Tizen 6.0 libraries with LLVM.** Use the ARM Thumb triple, relocations, dynamic symbols and string tables. Reconstruct the call chain from the public entry point through the SEC implementation.
4. **Resolve the parameter ABI.** Verify pointer widths, field offsets, struct size/alignment, argument count, calling convention, expected buffer sizes and output fields from the Tizen 6.0 machine code.
5. **Trace return values.** Determine where `-95` originates and whether it is propagated from the implementation, generated by a lower layer, or returned by a capability/permission check. Do not assign it a meaning until traced.
6. **Reconstruct secure-path selection.** Determine the role of `scaler_capture_is_protect`, `scaler_capture_secure` and the TZCAPTURE calls. Establish whether ordinary unprotected video capture requires TEE initialization.
7. **Check runtime loading and security policy.** Inspect `dlopen` failure paths, unresolved dependencies, SMACK/access requirements and any Tizen privileges actually required by the public capture path. Do not add manifest privileges speculatively.
8. **Validate on hardware.** Separate library/symbol availability, initialization, first capture, repeated capture, protected-content behaviour and recovery after stream end. A static analysis result alone cannot prove runtime permissions or successful capture.

Useful analysis commands (run on the extracted binaries on the analysis host):

```sh
llvm-readelf -h -A -d --dyn-syms --wide libtzcapturec.so
llvm-readelf -h -A -d --dyn-syms --wide libvideo-capture-impl-sec.so.0.1.0
llvm-readelf -r --wide libtzcapturec.so
llvm-readelf -r --wide libvideo-capture-impl-sec.so.0.1.0

llvm-objdump -d -r --demangle --triple=thumbv7-linux-gnueabihf \
  libtzcapturec.so > libtzcapturec.disasm.txt
llvm-objdump -d -r --demangle --triple=thumbv7-linux-gnueabihf \
  libvideo-capture-impl-sec.so.0.1.0 > libvideo-capture-impl-sec.disasm.txt

strings -a -t x libtzcapturec.so
strings -a -t x libvideo-capture-impl-sec.so.0.1.0
```

Do not execute the extracted TV libraries on the analysis host. Their dependencies and runtime environment belong to the TV firmware.

## 8. Compatibility decisions

Until the investigation is complete:

- Keep `TargetFramework=tizen80`.
- Keep package manifest API `6.0` and service application API `8`.
- Keep the Tizen 6.0 Samsung TV profile.
- Keep the existing 32-bit ABI guard.
- Do not require Tizen 6.5+ APIs or retarget to `tizen90`.
- Do not assume the PPI sampler solves the Tizen 6.0 video-plane issue.
- Do not add speculative privileges or bypass copy-protection controls.
- A failure in Ambilight must remain isolated and must not affect Moonlight streaming.

The intended outcome is a Tizen 6.0-compatible implementation, not merely a newer-target build that happens to launch on one older television.

## 9. Evidence classification

| Finding | Classification |
|---|---|
| Moonlight service targets `tizen80` with manifest API 6.0 / service API 8 | Confirmed from current branch project files |
| Two extracted binaries are ARM ELF32 EABI5 shared objects | Confirmed by `file` and `llvm-readelf -h` |
| Tizen 6.0 `libtzcapturec.so` uses the TEE Client API | Confirmed by dynamic dependencies and imported symbols |
| SEC implementation imports TZCAPTURE functions and exports secure/non-secure scaler functions | Confirmed by dynamic symbol inspection |
| Exact public Tizen 6.0 capture ABI and call chain | Not yet established |
| Meaning and origin of `rc=-95` | Unknown |
| Tizen 6.0 capture permission/SMACK requirements | Unknown |
| Whether Tizen 6.0 ordinary video capture requires TEE initialization | Unknown |
| General Tizen 6.0 compatibility across TV models | Not established |

This document is a working record. Add new device observations, binary hashes, symbol findings and verified runtime results here, while preserving the distinction between confirmed facts, external reports and hypotheses.
