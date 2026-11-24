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

**The public Tizen 6.0 `libvideo-capture.so.0` / `.0.1.0` binary has since been acquired and inspected.** The two filenames are byte-identical (24,104 bytes each), with SONAME `libvideo-capture.so.0` and Build ID `ab0f48022fbb90b351a5138fabcb614b208678a4`. Its dependency list does not contain the SEC implementation; the public library imports `dlopen()` and `dlerror()` and contains paths naming `/usr/lib/libvideo-capture-impl-sec.so` and its diagnosis variant. This indicates dynamic implementation loading rather than a direct `DT_NEEDED` dependency. The exact public entry-point-to-builder call chain is still being reconstructed.

### 5.4 Public capture library and SEC builder injection

The public Tizen 6.0 library was subsequently extracted as both `libvideo-capture.so.0` and `libvideo-capture.so.0.1.0`. The two files are byte-identical and each is 24,104 bytes.

Confirmed ELF observations:

- ELF32, little-endian ARM, EABI5, shared object; stripped.
- SONAME: `libvideo-capture.so.0`.
- Build ID: `ab0f48022fbb90b351a5138fabcb614b208678a4`.
- Its `DT_NEEDED` entries do **not** include `libvideo-capture-impl-sec.so.0.1.0`.
- It imports `dlopen()` and `dlerror()`; strings include `/usr/lib/libvideo-capture-impl-sec.so`, `/usr/lib/libvideo-capture-impl-sec-diagnosis.so` and diagnostic messages referring to loading the lower library and injecting a builder.

This is consistent with a plugin/builder architecture: the public library dynamically loads an implementation instead of linking the SEC implementation as a normal ELF dependency. The presence of `dlopen()` and the path strings alone do not establish the full selection logic or prove which implementation is chosen for every call.

#### ELF constructor/destructor registration in the SEC implementation

The SEC implementation's initialization and finalization arrays were inspected:

| Section | Address range | Relocation target | Meaning |
|---|---:|---|---|
| `.init_array` | `0x1b000–0x1b007` | `0x29c8`, `CaptureSecImpl_Inject()` | Runs when the shared object is loaded |
| `.fini_array` | `0x1b008–0x1b00f` | `0x29c4`, `CaptureSecImpl_destructor()` | Runs during shared-object finalization/unload |

The corresponding relocation records are:

```text
0001b000  R_ARM_RELATIVE
0001b004  R_ARM_ABS32  000029c8  _Z21CaptureSecImpl_Injectv
0001b008  R_ARM_RELATIVE
0001b00c  R_ARM_ABS32  000029c4  _Z25CaptureSecImpl_destructorv
```

The hex dumps show one pointer-sized entry in each array. The paired `R_ARM_RELATIVE` and `R_ARM_ABS32` relocations are consistent with the dynamic loader relocating the registered function pointers. This confirms that `CaptureSecImpl_Inject()` is an ELF constructor and `CaptureSecImpl_destructor()` is registered for finalization.

#### Reconstructed `CaptureSecImpl_Inject()`

The function at `0x29c8` was initially disassembled with the Thumb triple, which produced invalid/misleading instructions. Re-disassembly with `--triple=armv7-linux-gnueabihf` produced a coherent ARM instruction stream. The relevant control flow is:

| Address | Instruction/call | Confirmed interpretation |
|---|---|---|
| `0x29d0` | `getpid()` | Obtains the process ID for diagnostic logging |
| `0x2a24` | `__dlog_print()` | Logs entry into the injection routine |
| `0x2a28–0x2a38` | Loads a size of 4 and calls `operator new(unsigned int, std::nothrow_t const&)` | Allocates storage for the builder pointer/object |
| `0x2a3c–0x2a40` | Tests the returned pointer | Branches on allocation success/failure |
| `0x2a44` | `CaptureBuilderSecImpl::CaptureBuilderSecImpl()` | Constructs the SEC builder when allocation succeeds |
| `0x2a4c–0x2a58` | Loads a global address and stores the allocated pointer | Updates the SEC implementation's global builder pointer |
| `0x2a5c` | `IVideoCaptureBuilder::setThisBuilder()` | Registers the builder with the public capture library |
| `0x2a68` | Unconditional branch to `capture_shm_init()` | Tail-calls shared-memory initialization after restoring the stack |

On allocation failure, the alternate path stores the null pointer in the global builder-pointer slot, logs the failure and returns without calling the constructor or `setThisBuilder()`.

The call to `capture_shm_init()` is a tail branch, not a normal call followed by additional work in `CaptureSecImpl_Inject()`. It occurs after the builder registration on the successful path. Its implementation and failure behaviour have not yet been analysed.

**Confirmed architectural consequence:** loading the SEC shared object causes the ELF loader to invoke `CaptureSecImpl_Inject()` through `.init_array`. The public library therefore does not need to find or call `CaptureSecImpl_Inject()` through `dlsym()`. The constructor itself creates and registers the SEC builder. This does not yet establish the public library's complete dynamic-loading policy, builder-selection logic, or the outcome of shared-memory initialization.

The SEC shared object's `.fini_array` separately registers `CaptureSecImpl_destructor()`. Its exact cleanup behaviour has not yet been disassembled.

## 6. Current Moonlight implementation constraints

The current service implementation is in [VideoPlaneCapture.cs](VideoPlaneCapture.cs). It dynamically loads `libvideo-capture.so.0.1.0`, resolves `secvideo_api_capture_video_main` and uses a 32-bit parameter layout with caller-owned buffers.

The current implementation deliberately rejects a process where `IntPtr.Size != 4`, because the pointer fields in the recovered structure are 32-bit. This guard must not be removed based on assumptions from a newer firmware or a different architecture.

The existing 960×540 NV12 assumptions and parameter offsets must be treated as **ABI hypotheses for Tizen 6.0 until checked against the actual Tizen 6.0 public library and implementation**. Similarity to the newer project's structure is useful, but it is not proof of binary compatibility.

No code change is implied by this document. In particular, do not change the project target, manifest API, capture structure, native call signature or permissions until the remaining ABI and runtime questions are answered.

## 7. Outstanding investigation

The following work is required, in this order:

1. **Complete public-library loader analysis.** Reconstruct the public library's dynamic loading, implementation selection, builder retrieval and fallback/diagnosis paths. The public binary is now available and its lack of a direct SEC `DT_NEEDED` entry is confirmed.
2. **Analyse shared-memory initialization.** Disassemble `capture_shm_init()` and trace its system calls, device/file access, mappings, permissions and error propagation.
3. **Analyse builder creation.** Reconstruct `CaptureBuilderSecImpl::buildNewCaptureHandle()`, including allocation, constructor and failure paths.
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
| Extracted Tizen 6.0 capture libraries are ARM ELF32 EABI5 shared objects | Confirmed by `file` and `llvm-readelf -h` |
| Tizen 6.0 `libtzcapturec.so` uses the TEE Client API | Confirmed by dynamic dependencies and imported symbols |
| SEC implementation imports TZCAPTURE functions and exports secure/non-secure scaler functions | Confirmed by dynamic symbol inspection |
| Public Tizen 6.0 library dynamically loads an implementation; SEC constructor registers its builder through `setThisBuilder()` | Confirmed by ELF dependencies, strings, relocations and ARM disassembly |
| Exact public Tizen 6.0 capture ABI and complete call chain | Not yet established |
| Meaning and origin of `rc=-95` | Unknown |
| Tizen 6.0 capture permission/SMACK requirements | Unknown |
| Whether `capture_shm_init()` succeeds and what resources it requires | Unknown |
| Whether Tizen 6.0 ordinary video capture requires TEE initialization | Unknown |
| General Tizen 6.0 compatibility across TV models | Not established |

This document is a working record. Add new device observations, binary hashes, symbol findings and verified runtime results here, while preserving the distinction between confirmed facts, external reports and hypotheses.
