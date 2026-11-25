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

The call to `capture_shm_init()` is a tail branch, not a normal call followed by additional work in `CaptureSecImpl_Inject()`. It occurs after the builder registration on the successful path. Its implementation is analysed in section 5.5.

**Confirmed architectural consequence:** loading the SEC shared object causes the ELF loader to invoke `CaptureSecImpl_Inject()` through `.init_array`. The public library therefore does not need to find or call `CaptureSecImpl_Inject()` through `dlsym()`. The constructor itself creates and registers the SEC builder. This does not yet establish the public library's complete dynamic-loading policy, builder-selection logic, or the outcome of shared-memory initialization.

The SEC shared object's `.fini_array` separately registers `CaptureSecImpl_destructor()`. Its exact cleanup behaviour has not yet been disassembled.

### 5.5 Shared-memory initialization, protocol and capture wrappers

The following functions were disassembled from the extracted Tizen 6.0 `libvideo-capture-impl-sec.so.0.1.0` using the ARM instruction set (for example, `--triple=armv7-linux-gnueabihf`). These findings supersede the earlier open question about what `capture_shm_init()` does. They are static findings; successful initialization on the physical TV has not been demonstrated.

#### SMACK readiness gate and SHM creation

The constructor path reaches `capture_shm_init()` after registering the SEC builder. The function first checks for the marker file:

```text
/tmp/smack_early_ready
```

It uses `access(path, F_OK)` in a bounded loop of up to 11 checks, sleeping for 10 ms between unsuccessful checks. If the marker is still absent, the function returns without creating or mapping the shared-memory object. The marker is not created by this function. The code therefore assumes that another component has made the SMACK readiness marker available before the SEC implementation is initialized.

If the marker exists, the function calls `umask(0)` and proceeds to `libsec_create_shm_file()`. The umask is not restored in the analysed function, so this changes the process umask beyond the scope of this helper.

`libsec_create_shm_file()` uses the path `/dev/shm/shm_libsecv_capture` and opens the POSIX shared-memory name `/shm_libsecv_capture` with read/write and create flags and mode `0666`. It does not use `O_EXCL`; an existing object is opened as well. The open operation is retried in a bounded loop. The creation path calls `ftruncate64()` to set the object size to 136 bytes, also with bounded retries.

Back in `capture_shm_init()`, the object is mapped with:

- Length: 136 bytes
- Protection: `PROT_READ | PROT_WRITE`
- Mapping: `MAP_SHARED`
- Offset: 0

The resulting pointer is stored in a process-global variable and the file descriptor is closed. A failed mapping is logged with the associated error. `capture_shm_exit()` unmaps 136 bytes and clears the global pointer; it does not call `shm_unlink()`, so the POSIX shared-memory object is not removed by this cleanup routine. `get_libsec_shm()` returns the global pointer, or logs and returns null if it has not been initialized.

**Important distinction:** the readiness gate checks `/tmp/smack_early_ready`, not the existence of `/dev/shm/shm_libsecv_capture`. The SHM object is opened/created only after the readiness marker is found. If the SEC library is loaded before that marker appears, this implementation makes no later retry in the analysed initialization function. This is a plausible initialization-order failure mode, but it has not been shown to occur on the UE50AU7172UXXH.

#### Reconstructed 136-byte shared-memory layout

The helpers `copy_to_shm()` and `copy_from_shm()` access the mapped region as follows:

| Offset | Size | Access/meaning established by disassembly |
|---:|---:|---|
| `0x00` | 4 bytes | PID of the process that published the payload |
| `0x04` | 4 bytes | Publication/validity flag; reader accepts exactly `1` |
| `0x08` | 8 bytes | Monotonic timestamp, represented as a 64-bit microsecond count |
| `0x10` | 120 bytes | Payload copied between caller buffer and shared memory |

The total is exactly 136 bytes, matching the `mmap64()` length and the `ftruncate64()` size.

`copy_to_shm(source, invalidate)` behaves as follows:

- It obtains the current PID and the SHM pointer.
- It reads `CLOCK_MONOTONIC` (clock ID 1) and converts seconds/nanoseconds to microseconds: `seconds * 1,000,000 + nanoseconds / 1,000`.
- If `invalidate` is nonzero, it writes flag `0` and the timestamp at offsets 4 and 8; it does not copy the payload or replace the PID.
- If `invalidate` is zero, it copies 120 bytes from `source` to offset 16, writes the current PID at offset 0, then writes flag `1` and the timestamp.

`copy_from_shm(destination)` returns `-1` unless the SHM pointer is non-null, the flag at offset 4 equals `1`, and the publisher PID differs from the current process PID. If those conditions pass, it copies 120 bytes from offset 16 to `destination` and returns `0`.

The reader does not clear the flag after copying. Thus, in the code examined so far, reading does not consume or acknowledge a publication. The payload remains marked valid until another operation changes the flag or publishes new data. No mutex, semaphore or atomic read-modify-write operation is visible in these two helper bodies. This observation alone is not sufficient to conclude that the overall protocol is racy; other synchronization may exist in their callers or peer process.

#### Timestamp-only publication and slow-call gate

`copy_to_time(value)` updates the header without copying the 120-byte payload. It uses the same `CLOCK_MONOTONIC` conversion to microseconds:

- If `value == 0`, it writes the current PID at offset 0, sets the flag at offset 4 to `1`, and writes the timestamp at offset 8.
- If `value != 0`, it leaves the PID unchanged, clears the flag to `0`, and updates the timestamp.

If `clock_gettime()` fails, the computed timestamp is zero; the helper still performs the flag/PID update according to the argument. This is distinct from `copy_to_shm()`, which also copies the payload on its publication path.

`is_call_time_slow(threshold)` reads a timestamp from offset 8 through a global pointer, obtains the current monotonic time in microseconds, and compares the elapsed interval with the supplied threshold. It returns `1` when the elapsed interval is greater than or equal to the threshold, and `0` when it is below the threshold or when the relevant shared timestamp pointer is unavailable. Its error/logging path for a failed `clock_gettime()` also returns `0`. The precise unit expected for the caller-supplied threshold is not independently established by this function alone, although the compared timestamp values are in microseconds.

This function appears to implement a time-based throttling/slow-call decision. The caller and the intended threshold policy have not yet been identified.

#### Call-site search result and its limitation

A full ARM disassembly was searched for direct `BL`/branch-with-link references to the addresses of `copy_to_shm()` (`0x6fe0`), `copy_from_shm()` (`0x7078`) and `copy_to_time()` (`0x70cc`). The grep returned no direct call instructions. Searching the disassembly for these names returned their function definitions and local branches only.

This does **not** establish that the helpers are unused. Possible explanations still to investigate include indirect calls through function pointers/vtables, relocations or references represented differently in the disassembly, and calls from another library/process. The process that supplies or consumes the shared payload is therefore unknown.

#### Builder creation and protection wrapper

`CaptureBuilderSecImpl::buildNewCaptureHandle()` at `0x7334` logs, allocates 24 bytes with nothrow `operator new`, and, if allocation succeeds, invokes the `CaptureSecImpl` constructor and returns the resulting object pointer. If allocation fails, it returns null. No direct SMACK, filesystem, device-node or TEE permission check is visible in this function body.

`CaptureSecImpl::isProtectCapture(int&)` at `0x7488` delegates to `scaler_capture_is_protect()`. A nonnegative result is returned directly. A negative result causes the wrapper to retrieve `errno` and log diagnostic information before returning the original negative result. The wrapper itself does not interpret the protection state; the scaler function owns that behaviour.

The complete `CaptureSecImpl::getScreenPostYUV()` body at `0x752c` has now been disassembled. It initializes a local protection-output word to zero, passes its address to `scaler_capture_is_protect()`, and then tests that output word. It does **not** test the function's return value. If the output word equals `1` and `InputParams + 0x18` is zero, it calls `scaler_capture_secure()`; otherwise it calls `scaler_capture()`. The implications and exact control flow are detailed below.


#### DRM protection query and secure/non-secure route selection

The full ARM disassembly of `scaler_capture_is_protect()` (`0x575c`, 388 bytes) establishes the following contract:

1. It calls `scaler_drm_open()`.
2. If opening DRM fails (negative return), it logs the failure and returns that negative result.
3. If opening succeeds, it issues `drmIoctl()` with request value `0xC0086461`, passing a pointer to a local output word.
4. If the ioctl fails (negative return), it reads `errno` for logging and returns the negative ioctl result.
5. If the ioctl succeeds, it copies the output word into the caller-provided `int*` and returns the ioctl result.

Thus, the function has two distinct outputs: its **return value is operation status**, while the integer written through its pointer is the **protection state**. A caller must check the return value before treating the output integer as authoritative. A successful ioctl normally returns zero; the protection state is not the function's return value.

`CaptureSecImpl::isProtectCapture(int&)` (`0x7488`) delegates to this function and preserves a negative return value after logging. This wrapper therefore exposes query failure to its caller.

The `getScreenPostYUV()` call site reveals an important caveat:

- It initializes the local protection-output word to `0`.
- It passes the address of that word to `scaler_capture_is_protect()`.
- It ignores the function's return value.
- It compares only the output word against `1`.
- If the output is `1` and `InputParams + 0x18` is zero, it selects `scaler_capture_secure()`.
- In every other case, it selects `scaler_capture()`.

Consequently, if DRM open or the protection ioctl fails, the output word remains at its initialized value of zero and this particular call site proceeds down the **ordinary `scaler_capture()` path**. This is a fail-open behaviour with respect to the protection-query error: an unknown protection state is treated as if the content were not protected. This conclusion is specific to the disassembled `getScreenPostYUV()` call site; it must not be generalized to every capture method without inspecting its caller.

The byte at `InputParams + 0x18` is demonstrably involved in selecting the secure versus ordinary path when the protection output is `1`, but its semantic name/meaning has not yet been recovered. Do not assign it a public API meaning based only on this branch.

**Implication for Moonlight's future PPI fallback:** preserve query status separately from the protection value. The state model must distinguish at least:
- query succeeded, content not protected;
- query succeeded, content protected;
- query failed / protection state unknown.

A negative DRM-open or ioctl result must never be normalized to `protect == 0` by Moonlight's own fallback logic. If the video-plane path cannot establish protection state, the caller must make an explicit fallback decision; where PPI is available and appropriate, it may be selected as a separate fallback path rather than silently attempting ordinary capture. This is a design requirement for our caller, not proof that the firmware's own `getScreenPostYUV()` follows it. PPI's exact behaviour and suitability for each protected-content case still require separate validation.

#### Current interpretation and unresolved questions

Confirmed by static disassembly:

- SEC builder injection calls `capture_shm_init()` after registering the builder.
- SHM initialization is gated by the external `/tmp/smack_early_ready` marker.
- The shared object is 136 bytes and has a 120-byte payload behind a 16-byte header.
- The header contains a PID, a one-word validity flag and a 64-bit monotonic microsecond timestamp.
- The helper-level publication and read rules are as described above.
- The protection wrapper delegates to `scaler_capture_is_protect()`.

Not established:

- Which component creates `/tmp/smack_early_ready`, and what exact SMACK state it signifies.
- Whether the marker exists when the public capture library loads on the test television.
- Whether `shm_open`, `ftruncate64` and `mmap64` succeed on that firmware under the service's security label.
- Which process is the SHM peer, who writes and who reads the 120-byte payload, and what the payload represents.
- Whether the helpers are called indirectly or from another loaded object.
- Whether the SHM protocol is required for ordinary video-main capture, secure capture, diagnostics, or another path.
- The caller's intended threshold and policy for `is_call_time_slow()`.
- The exact driver-side semantics of ioctl request `0xC0086461`, including the meaning and encoding of its protection-state output; the userspace call/return contract is reconstructed above.
- Whether the SMACK readiness gate explains any observed capture failure on the physical TV.

No implementation changes are justified by these static findings alone.



#### Capture pipeline: DRM execution, protected TEE route and shared plane transfer

The disassembly of `scaler_capture_buffer_create()`, `scaler_capture_execute()`, `scaler_capture_fill_captbuff()`, `scaler_capture_secure()` and `scaler_capture_secure_fill_captbuff()` now makes the internal capture pipeline substantially clearer.

At the architectural level, the SEC implementation has two capture routes:

- **Ordinary route:** the scaler path submits the hardware-capture operation through DRM and then prepares/transfers the resulting capture planes into the caller-facing capture buffer.
- **Protected route:** the scaler path still performs the DRM hardware-capture operation, but adds the TZCAPTURE/TEE interaction before completing the output through the secure fill routine.

Both routes converge on the same lower-level plane-copy helper, `scaler_capture_buffer_memcpy()`. This is the important commonality: the secure route does not define an unrelated output-transfer mechanism. Its secure fill routine invokes the same helper used by the ordinary fill path, then writes the corresponding output metadata.

##### Ordinary route

The reconstructed flow is:

```text
scaler_capture()
  ├─ scaler_drm_open()
  ├─ scaler_capture_buffer_create()
  │    └─ prepare capture-buffer state and map required buffers
  ├─ [capture locking on applicable paths]
  ├─ scaler_capture_execute()
  │    └─ DRM ioctl: 0xC0786452
  └─ scaler_capture_fill_captbuff()
       └─ scaler_capture_buffer_memcpy()
            └─ populate caller-facing plane data
```

`scaler_capture_buffer_create()` initializes the scaler capture-buffer structure, obtains configuration/dimension values and maps the buffers required by the selected path through `scaler_map_buff()`. The disassembly shows paths mapping two buffers and conditional paths mapping additional buffers. A return value of zero therefore means that this function completed its selected branch; it must not be interpreted as proof that every possible plane was mapped. The inspected body does not establish that this function allocates the underlying GEM objects itself.

`scaler_capture_execute()` is the DRM hardware-capture submission/status stage. It issues `drmIoctl()` with request `0xC0786452`. A successful ioctl is not by itself sufficient for success: the function subsequently checks the status field at offset `+0x4c` in the capture argument and checks two other parameter values against `0xffff`. It returns `-1` on ioctl failure and `-4` when the post-ioctl checks reject the result; the exact driver-level meaning of those fields is not yet known.

`scaler_capture_fill_captbuff()` is the output preparation/transfer stage, not the hardware-capture submission itself. It uses `scaler_capture_buffer_memcpy()` to transfer the plane data and populates the capture-buffer metadata consumed by the upper layer.

##### Protected route

The reconstructed high-level flow is:

```text
scaler_capture_secure()
  ├─ scaler_drm_open()
  ├─ scaler_capture_buffer_create()
  ├─ secvideo_capture_lock()
  ├─ scaler_capture_execute()
  ├─ TZCAPTURE_Initialize()
  ├─ TZCAPTURE_Capture_screen()
  ├─ obtain secure capture payload
  ├─ scaler_capture_secure_fill_captbuff()
  │    └─ scaler_capture_buffer_memcpy()
  │         └─ populate caller-facing plane data
  ├─ TZCAPTURE_Finalize() [cleanup path]
  └─ secvideo_capture_unlock()
```

The secure route therefore does not replace DRM with TEE. It combines the DRM capture operation with the TEE-backed `TZCAPTURE_Initialize()` / `TZCAPTURE_Capture_screen()` sequence and then completes the output transfer through `scaler_capture_secure_fill_captbuff()`.

The secure fill routine calls `scaler_capture_buffer_memcpy()` and retains its return value. A negative result is propagated; on success, the routine writes output metadata into the capture-buffer structure, including fields at offsets such as `+0x04`, `+0x08`, `+0x10`, `+0x20`, `+0x38`, `+0x3c` and `+0x40`. Its format/layout branches depend on FOURCC and capture-type values. The complete semantic mapping of those fields and formats remains part of the ABI reconstruction.

The secure function's detailed cleanup/error paths still need a dedicated pass before making guarantees about every failure edge. The sequence above records the successful route and the cleanup operations visible in the disassembly; it is not a claim that every possible failure path finalizes and unlocks identically.

##### Architectural conclusion and implication for PPI

The current evidence supports this division of responsibility:

1. **Capture execution:** DRM submits and reports the hardware capture operation.
2. **Protection handling:** the SEC wrapper queries the protection state and, for the relevant protected case, selects the secure route that adds TEE/TZCAPTURE.
3. **Output transfer:** ordinary and secure fill routines converge on `scaler_capture_buffer_memcpy()` and produce the capture-buffer representation expected by the upper layer.

This is the key design boundary for Moonlight's PPI fallback. **PPI should target the output contract required by our existing Ambilight processing, not reproduce Samsung's DRM/TEE implementation.** Reimplementing Samsung's DRM ioctls, buffer mapping, SHM coordination or TEE calls inside PPI would duplicate platform-specific machinery without being necessary to provide an alternate source of colour samples.

For the PPI integration, the reusable contract is the data presented to our processing pipeline: valid sample/plane data together with the dimensions, layout/format and per-plane metadata needed to interpret it correctly. The exact structure and field mapping still need to be completed from `scaler_capture_buffer_memcpy()` and the relevant capture-buffer structures before treating this as a finalized ABI.

This separation does **not** mean PPI can ignore content protection. The protection query must remain a separate state with three outcomes—unprotected, protected, and unknown/query-failed—and PPI must only be selected under an explicitly validated policy for the relevant content and device. In particular, a failed DRM protection query must not be silently converted into an unprotected result.

No code change follows from this static-analysis conclusion alone. The immediate reverse-engineering work is to finish the common memcpy helper and reconstruct the buffer/parameter structures so the output contract can be specified precisely.

## 6. Current Moonlight implementation constraints

The current service implementation is in [VideoPlaneCapture.cs](VideoPlaneCapture.cs). It dynamically loads `libvideo-capture.so.0.1.0`, resolves `secvideo_api_capture_video_main` and uses a 32-bit parameter layout with caller-owned buffers.

The current implementation deliberately rejects a process where `IntPtr.Size != 4`, because the pointer fields in the recovered structure are 32-bit. This guard must not be removed based on assumptions from a newer firmware or a different architecture.

The existing 960×540 NV12 assumptions and parameter offsets must be treated as **ABI hypotheses for Tizen 6.0 until checked against the actual Tizen 6.0 public library and implementation**. Similarity to the newer project's structure is useful, but it is not proof of binary compatibility.

No code change is implied by this document. In particular, do not change the project target, manifest API, capture structure, native call signature or permissions until the remaining ABI and runtime questions are answered.

## 7. Outstanding investigation

The following work is required, in this order:

1. **Complete public-library loader analysis.** Reconstruct the public library's dynamic loading, implementation selection, builder retrieval and fallback/diagnosis paths. The public binary is now available and its lack of a direct SEC `DT_NEEDED` entry is confirmed.
2. **Complete shared-memory protocol analysis.** The initialization path and basic read/write helpers are reconstructed in section 5.5. Remaining work is to identify all call sites (including indirect calls), the peer process and the semantic meaning of the 120-byte payload.
3. **Complete builder/capture analysis.** `buildNewCaptureHandle()` and the `isProtectCapture()` wrapper are reconstructed in section 5.5; the scaler implementation and complete capture call chain remain to be analysed.
4. **Resolve the parameter ABI.** Verify pointer widths, field offsets, struct size/alignment, argument count, calling convention, expected buffer sizes and output fields from the Tizen 6.0 machine code.
5. **Trace return values.** Determine where `-95` originates and whether it is propagated from the implementation, generated by a lower layer, or returned by a capability/permission check. Do not assign it a meaning until traced.
6. **Complete secure-path and PPI fallback analysis.** The DRM query contract and `getScreenPostYUV()` selection (including its ignored query-status return) are now reconstructed in section 5.5. Determine the behaviour of `scaler_capture_secure`, trace the TZCAPTURE calls, and design Moonlight's fallback so a failed protection query remains an explicit unknown/error state rather than being treated as unprotected. Establish whether ordinary unprotected video capture requires TEE initialization.
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
| Whether `capture_shm_init()` succeeds on the test TV at runtime | Unknown; its gate and resource operations are statically reconstructed in section 5.5 |
| Whether Tizen 6.0 ordinary video capture requires TEE initialization | Unknown |
| SHM readiness gate, 136-byte layout, timestamp units and helper-level publication/read conditions | Confirmed by ARM disassembly; runtime success and peer identity unknown |
| `copy_to_shm`, `copy_from_shm` and `copy_to_time` direct call sites | No direct BL references found in the current full disassembly search; indirect/external call paths remain possible |
| `is_call_time_slow` compares monotonic microsecond timestamps against a caller-supplied threshold | Confirmed by ARM disassembly; caller policy and threshold unit remain unverified |
| `buildNewCaptureHandle()` allocates and constructs a `CaptureSecImpl`; protection wrapper delegates to `scaler_capture_is_protect()` | Confirmed by ARM disassembly |
| `scaler_capture_is_protect()` distinguishes DRM-open failure, ioctl failure and successful protection-state output; `getScreenPostYUV()` ignores its status return and defaults its output word to zero | Confirmed by ARM disassembly; the resulting fail-open branch is specific to `getScreenPostYUV()` |
| General Tizen 6.0 compatibility across TV models | Not established |

This document is a working record. Add new device observations, binary hashes, symbol findings and verified runtime results here, while preserving the distinction between confirmed facts, external reports and hypotheses.
