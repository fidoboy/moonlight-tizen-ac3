# AVOC API inventory

This document records reusable AVOC API knowledge: function names, known argument metadata, return metadata, related proxy methods, and unresolved contract details. Entries may be partial. A name is worth recording even when its signature or behavior is not yet known.

Evidence is stated explicitly:
- **Native-name occurrence:** the name appears in the supplied library string inventory. This alone does not prove that it is exported or callable by third-party code.
- **Proxy metadata:** method names and logical input/output argument names are visible in the proxy-related inventory. These are not C types or complete D-Bus signatures.
- **Debug-format reference:** the name appears in an AVOC debug format string. This is evidence that the implementation refers to an operation, but does not by itself prove that a corresponding public symbol exists.

Do not infer argument types, accepted values, return-code meanings, availability, or behavior from names alone.

## Game Mode

### Native functions

| Function | Known information |
|---|---|
| `avoc_set_game_mode` | Setter with a two-argument C interface: `save_type`, `mode`. The examined ARM implementations use the first two C argument registers (`r0`, `r1`) for these values. A later value observed during disassembly belongs to the internal call/stack path used to reach the D-Bus proxy and is not a third public C parameter. See the corrected cross-library ABI discussion below. |
| `avoc_get_game_mode` | Getter. Proxy metadata: input `save_type`; outputs `mode`, `ret`. |
| `avoc_check_game_mode` | Check operation. Proxy metadata: no input arguments observed; output `ret`. |
| `avoc_set_game_mode_by_source` | Setter by source. Proxy metadata: inputs `save_type`, `source`, `game_mode`; output `ret`. |

### Proxy method metadata

| Proxy method | Inputs | Outputs |
|---|---|---|
| `set_game_mode` | `save_type`, `mode` | `ret` |
| `get_game_mode` | `save_type` | `mode`, `ret` |
| `check_game_mode` | None observed | `ret` |
| `set_game_mode_by_source` | `save_type`, `source`, `game_mode` | `ret` |

These are logical argument names. The Game Mode D-Bus/GVariant tuple types are documented below; the accepted values and semantics of `save_type`, `mode`, `source`, and `game_mode` have not been fully established.

### Experimental C signature reference

The public [WMP Tizen 5.0 implementation](https://github.com/WMP/moonlight-tizen50/blob/608e2e98540c1202786aed3df8bf910f7cbb947d/mlclient/engine_avoc.c) declares:

```c
typedef int (*avoc_set_game_mode_fn)(int save_type, int mode);
```

It calls the function with `save_type=1` and `mode=1` to enable or `mode=0` to disable. Its source comment associates `save_type=1` with saving/restoring by source. These calls document the two-argument interface used by an independent implementation and are consistent with the examined ARM libraries. The argument semantics are supported by the proxy method metadata and implementation evidence below.



### Cross-library ARM ABI verification (corrected conclusion)

The exported `avoc_set_game_mode` entry point was disassembled from three ARM libraries:

- `libavoc.so` from the Tizen 5.0 emulator used with the WMP Moonlight Tizen 5.0 reference.
- `libavoc.so` from the Tizen 6.0 emulator.
- `libavoc.so` extracted directly from the Samsung UE50AU7172 TV.

The three implementations exhibit the same two-argument public C interface. The caller supplies `save_type` and `mode`; these are the only two arguments in the exported function signature and are forwarded to `avoc_proxy_call_set_game_mode_sync`, which constructs the two-integer `SetGameMode(ii)` request. During disassembly, a third, final value/stack argument is visible deeper in the wrapper's internal call path. That value belongs to the internal proxy/D-Bus call sequence, not to the exported C entry point. It must not be added to the caller's function-pointer declaration or passed by Moonlight.

Under the ARM procedure-call convention, a normal C call through `int (*)(int save_type, int mode)` places the two arguments in `r0` and `r1`, matching the two-argument interface confirmed across the examined implementations. The third/final value seen while tracing the wrapper's internal path is used by the internal proxy/D-Bus call; it is not an incoming argument to `avoc_set_game_mode` and must not be promoted to a public C parameter.

The correct function-pointer shape is `int (*)(int save_type, int mode)`. There is no leading placeholder and no third public argument. The extra final argument belongs exclusively to the internal call path toward the D-Bus proxy. This setter finding is independent of the getter ABI described in the following section; the getter has a different signature and must not be used to infer the setter's argument count.

This finding confirms the two-argument declaration used by the public WMP Tizen 5.0 implementation; it is not an older-ABI exception.

**Scope and remaining uncertainties:** this comparison establishes the relevant register convention only for the three libraries listed above. It does not prove that every Samsung model, firmware revision, Tizen release, or architecture uses the same convention. The argument positions are established by the examined wrapper/proxy flow; the semantic meaning of the first argument, the accepted values and meanings of the two operational arguments, the native return-value contract, and whether a call at a particular point in stream startup actually changes the TV's Game Mode state remain separate unresolved questions.

### Samsung UE50AU7172 ARM getter ABI and Game Mode state polling

The exported `avoc_get_game_mode` and `avoc_check_game_mode` wrappers were disassembled from the `libavoc.so` extracted directly from the Samsung UE50AU7172 TV. The corresponding synchronous proxy helpers were also disassembled.

#### `avoc_get_game_mode` native ABI

The verified public C function-pointer declaration is:

```c
typedef int (*avoc_get_game_mode_fn)(int save_type, int *mode);
```

The call shape is:

```c
int mode = -1;
int ret = get_game_mode(save_type, &mode);
```

The wrapper forwards `save_type` to `avoc_proxy_call_get_game_mode_sync` and copies the first reply field (`mode`) through the output pointer. The second reply field (`ret`) is handled separately as the AVOC method result.

**Correction:** the previously documented `int reserved` argument and the leading-zero call were incorrect. The public getter has exactly two C arguments: `save_type` and the output pointer `mode`.

The proxy helper confirms that `GetGameMode` sends one integer (`save_type`) and extracts two integer reply fields in this order: `mode`, then `ret`. The native wrapper writes `mode` through the caller's pointer; it does not substitute the method's `ret` field for that value. The D-Bus method result and the state value must therefore be kept distinct.

The server-side `on_get_game_mode()` handler accepts `save_type` values 0 and 1 and rejects values greater than 1. The caller should use the appropriate save type for the setting being queried.

#### Meaning of the returned `mode` value on the target TV

For the Samsung UE50AU7172 target, the state interpretation used by this project is:

- `mode == 1`: Game Mode is enabled.
- `mode == 0`: Game Mode is disabled.

This is the state field to inspect when determining whether activation has taken effect. Do not use the separate `ret` result as the Game Mode state.

#### Activation polling strategy

After requesting Game Mode activation, query the state with `avoc_get_game_mode` and inspect the output `mode`:

1. If the query succeeds and `mode == 1`, consider Game Mode active and stop retrying.
2. If the query succeeds and `mode == 0`, Game Mode is still inactive; another activation attempt may be made, subject to the integration's retry limit/timing.
3. If the query itself fails, treat the state as unknown. Do not interpret a failed query as `mode == 0` and do not claim that the TV has confirmed the disabled state.

This replaces blind periodic activation retries with retries gated by the state reported by AVOC. The retry limit, interval, and exact stream-startup hook are integration policy and are not established by this ABI analysis.

#### `avoc_check_game_mode` is not the state getter

The ARM wrapper takes no caller-supplied arguments and calls `avoc_proxy_call_check_game_mode_sync`. That proxy method has an empty request tuple and a one-integer reply tuple. Its reply field is `ret`; it does not provide the `mode` state used above. It is therefore not a substitute for `avoc_get_game_mode` when polling whether Game Mode is enabled.

### Native wrapper control flow (Tizen 6.0 x86 build)

Disassembly of the three native Game Mode entry points establishes the following wrapper behavior:

| Function | Proxy operation | Arguments forwarded by the native wrapper | Output handling |
|---|---|---|---|
| `avoc_set_game_mode` | `avoc_proxy_call_set_game_mode_sync` | The two public C arguments (cdecl offsets `[ebp+0x8]` and `[ebp+0xc]`) | Returns a local result value populated through the proxy-call dispatch path. |
| `avoc_get_game_mode` | `avoc_proxy_call_get_game_mode_sync` | The two public C arguments: `save_type` and `mode` output pointer | Forwards `save_type`; copies the proxy-provided `mode` value through the output pointer; returns a separate result value. |
| `avoc_check_game_mode` | `avoc_proxy_call_check_game_mode_sync` | No incoming arguments are read or forwarded | Returns a local result value populated through the proxy-call dispatch path. |

The public getter declaration is `int (*)(int save_type, int *mode)`: its two C arguments are the `save_type` input and the `mode` output pointer. There is no leading `reserved` argument. This getter-specific ABI must not be confused with `avoc_set_game_mode`, whose two arguments are `save_type` and `mode` values.

All three functions call `avoc_init_gdbus_connections` before obtaining the proxy and making a synchronous proxy call. If initialization returns nonzero, each function follows an error path that returns `-7` (`0xfffffff9`). Their result locals are initialized to `-1` before the proxy-call path; the final meaning of that value, and the values written by the dispatch helper, are not yet established.

The **Tizen 6.0 x86 getter** has the public two-argument C interface `int avoc_get_game_mode(int save_type, int *mode)`. The proxy operation has one input (`save_type`) and returns `mode` plus the separate AVOC result. Stack-frame offsets must be interpreted consistently with this verified public declaration; they do not introduce a third argument.

The x86 disassembly also exposes the internal stack arguments used along the wrapper-to-proxy/D-Bus path. In particular, the third/final value visible at that internal call boundary is not a third public `avoc_set_game_mode` C parameter. The exported setter remains a two-argument function; its internal proxy call serializes the two operational integers into `SetGameMode(ii)`. The getter has its own distinct pointer-bearing interface, described above.

The native C interface must not be confused with internal wrapper-to-proxy call frames. `avoc_set_game_mode` accepts two C arguments and the proxy method serializes those two integers as `SetGameMode(ii)`. Extra values visible in an internal stack frame are not additional public parameters.

Accordingly, the two-argument function pointer used by the Tizen client is consistent with the examined ARM implementations and the independent WMP implementation. The third value previously inferred from the disassembly is not a third setter parameter. Firmware-specific symbol availability and runtime behavior still require device validation, but the setter's public C signature is two arguments.

This disassembly confirms wrapper control flow and argument forwarding only. It does not establish the forwarded arguments' semantic names or types, the D-Bus/GVariant signatures, or the meaning of proxy return codes.

### Server-side Game Mode implementation

The server-side implementation contains a separate orchestration function:

```cpp
int avocd_set_game_mode(
    _AvocService* service,
    AvocData* data,
    avoc_game_mode_e requested_mode,
    avocd_game_mode_type_e game_mode_type,
    avoc_save_type_e save_type
);
```

The function coordinates AVE Game Mode state with picture, sound, and other TV settings. Its normal observed epilogue returns `0`; this is distinct from the AVE operation and from any D-Bus method result.

#### AVE Game Mode operation

In the general path, the requested mode is normalized to a boolean-like integer before calling:

```cpp
avocd_ave_set_game_mode(int mode);
```

The value passed to AVE is `0` when the requested mode is zero and `1` when it is nonzero. The original enum value is therefore not necessarily forwarded unchanged.

This AVE call is only one part of the server-side operation. Other paths and settings updates are coordinated by `avocd_set_game_mode()`; calling the AVE function alone is not established as equivalent to the complete server-side behavior.

#### Common picture and sound application path

The common application path performs the following operations:

1. Determine a picture mode:
   ```cpp
   tztv_picture_mode_e avocd_determine_game_picture_mode(
       AvocData* data,
       avocd_game_mode_type_e game_mode_type
   );
   ```
2. Read the current sound mode with `AVOC_audio_get_sound_mode(data, &sound_mode, 1)`.
3. Read the game surround-sound value with `avocd_get_game_surround_sound(data, &surround, 1)`.
4. Apply it with `avocd_set_game_surround_sound(service, data, surround, 1)`.
5. Apply the selected picture mode with `avocd_set_picture_mode(service, data, picture_mode, 1)`.

The two setters in steps 4 and 5 use `save_type=1`, rather than forwarding the `save_type` argument of `avocd_set_game_mode()`.

After picture-mode application, the function checks the previously read sound mode using:

```cpp
bool avocd_check_special_view_sound_mode(
    avoc_audio_sound_mode_e sound_mode
);
```

When this check is true, the observed path additionally:
- Restores the previously read sound mode with `avocd_audio_set_sound_mode(service, data, sound_mode, 1)`.
- Gets the Low Input Lag value using `avocd_get_low_input_lag_mode(data, source, requested_mode)`.
- Applies that value using `avocd_set_low_input_lag_mode(data, source, value)`.
- Calls `avocd_update_HGiG_mode(service, data)`.
- Calls `avocd_set_film_mode(data, film_mode, 1)`.

The Low Input Lag getter receives the original requested mode. The boolean-like result is zero-extended before being passed to the setter. The film-mode value is prepared by an earlier branch; its enum semantics are not established here.

If the requested mode differs from the previous mode tracked by the function, it emits D-Bus event identifier `0x0D` through `avocd_dbus_send_event()`. The event payload contract is not established.

#### Requested-mode branches and setting selection

The following control-flow facts are established by the server-side implementation:

- For `requested_mode == 0`, the function reads DB setting `0x36` using the incoming `save_type`, checks HDR state, sets the local `game_mode_type` argument to zero, and joins the shared mode-configuration path.
- In the picture-mode conversion path, SDR content is passed through `_avocd_convert_sdr_picture_mode(tztv_picture_mode_e)`; HDR content uses the corresponding HDR conversion helper.
- A conditional persistence path is reached when the requested mode satisfies `(requested_mode & ~2) == 1` (the observed integer cases are 1 and 3), volatile setting `0x34` is nonzero, and the current source field equals `3`. It writes the converted picture mode to DB setting `3` when `game_mode_type == 0`, or setting `5` when `game_mode_type` is nonzero. The incoming `save_type` is forwarded to this write.
- For `requested_mode == 1`, one branch checks the field at offset `0xAC` in `AvocData`. If it equals `1`, the function copies DB setting `0x44` to DB setting `0x45`, using `save_type=1`. Otherwise it reads the current picture mode through `avocd_get_picture_mode(data, &picture_mode, 1)` and continues through conditional previous-picture-mode handling.
- The previous-picture-mode path calls `avocd_can_pmode_be_stored_in_prev_pmode(picture_mode)`. If true, it reaches a separate setting-write path; the exact setting identifier depends on values prepared by the preceding branch and is not generalized here.
- A separate path calls `avocd_update_wide_gaming(data, source, requested_mode)`. Its broader gating conditions and setting side effects are not fully established.
- Another conditional path calls `_avocd_detect_gmp_condition_in_resolution(data, &condition)`; the effect of its result on the full mode transition is not fully established.

The numeric setting identifiers above are recorded as observed. Their individual user-facing names and semantic meanings are not established by these call sites.

#### Special Game Mode branches: PC picture modes, AI Tech Mode, and Film Maker Mode

Further control-flow analysis establishes these additional branches within `avocd_set_game_mode()`:

- In the previous-picture-mode path, when the incoming `game_mode_type` is nonzero and the previously read setting value is zero, the function checks the current picture mode with `avocd_is_pc_picture_mode(tztv_picture_mode_e)`. If that check is true, it also checks `avocd_is_game_picture_mode_group(tztv_picture_mode_e)`. When the PC-picture-mode check is true and the Game-Picture-Mode-Group check is false, it writes the current picture mode to a DB setting identifier prepared by the preceding branch, using `save_type=1`. The setting identifier is branch-dependent and is not generalized here.
- If the PC-picture-mode check is false, or the picture mode belongs to the Game Picture Mode group, execution follows the ordinary common application path instead.
- A separate previous-picture-mode path calls `avocd_can_pmode_be_stored_in_prev_pmode(picture_mode)`. When true, it writes the picture mode to the previously prepared DB setting identifier with `save_type=1`. The exact identifier remains dependent on the preceding branch.
- When the `AvocData` field at offset `0xAC` equals `1`, the function reads DB setting `0x44` with `save_type=1` and writes that value to DB setting `0x45`, also with `save_type=1`. This path then rejoins the picture-mode retrieval and selection flow.

For the configuration-7 branch:

1. The function reads DB setting `0x60` with `save_type=1).
2. It reads volatile setting `0x34` and calls `avocd_get_ai_illumination(AvocData*, int*)`.
3. If both the volatile setting and the returned AI-illumination output are nonzero, it calls:
   ```cpp
   avocd_set_ai_tech_mode(service, data, true);
   ```
   It then joins the Film Maker Mode/audio path.
4. Otherwise, it calls `avocd_check_filmmaker_mode_on(AvocData*)`.
   - If true, it joins the Film Maker Mode/audio path.
   - If false, it reads DB setting `0x45) and joins the common picture/surround application path.

The Film Maker Mode/audio path performs:

```cpp
avocd_set_filmmaker_mode(service, data, value);
avocd_audio_set_sound_mode(service, data, sound_mode, 1);
```

The `value` passed to `avocd_set_filmmaker_mode()` and the `sound_mode` passed to the audio setter are prepared earlier in the function. The audio setter uses `save_type=1). If the requested mode differs from the previously tracked mode, the path emits event `0x0D) through `avocd_dbus_send_event()`; otherwise it returns through the normal epilogue. This path does not pass through the common Picture Mode/surround application sequence shown above.

#### Low-frequency dimming (LFD) Game Mode path and HDR-dependent picture selection

The configuration-7 branch delegates to:

```cpp
int avocd_set_game_mode_lfd(
    _AvocService* service,
    AvocData* data,
    avoc_game_mode_e requested_mode,
    avoc_save_type_e save_type
);
```

The helper reads DB setting `0x38` using the incoming `save_type`. This value is the previously stored mode used by the helper's change and restoration decisions; it is not an independent flag.

- If the previous value equals `requested_mode` and the `AvocData` field at offset `0x20` equals `6`, the helper takes a special path that calls `_avocd_detect_gmp_condition_in_resolution(data, &condition)`. When the returned condition is true, it calls `avocd_update_vrr_smc_state(data, source, requested_mode)` and follows the associated special path.
- Otherwise, it writes the requested mode to DB setting `0x36`, using the incoming `save_type`. For requested mode zero, the local requested mode is changed to one before the AVE operation.
- The helper reads DB setting `0x38` with `save_type=1`, calls `avocd_ave_set_game_mode(mode)`, and compares the requested/normalized mode with the previously read value. When they differ, it writes setting `0x38` with `save_type=1` and calls `avocd_set_secaudio_info(data)`.
- When requested mode is zero and the previous value in setting `0x38` is nonzero, it restores, in order: sound mode from setting `0x60`, Picture Mode from setting `0x04`, Film Mode from `0x44`, RGB Only from `0x46`, and Digital Clean View from `0x113`. The reads use `save_type=1`; the corresponding application calls use the observed zero-valued flags/arguments.
- A changed-mode path emits event identifier `0x0D`. The helper's observed normal return value is zero.

#### VRR and Game Motion Plus state coordination

The LFD path and other Game Mode paths call the server helper:

```cpp
avocd_update_vrr_smc_state(
    AvocData* data,
    tztv_source_e source,
    avoc_game_mode_e requested_mode
);
```

The helper first checks Game Mode subfeature identifiers `1` and `2` independently through `avocd_check_game_feature_support()`. In the observed control flow:

- If both subfeatures are unsupported, the helper returns without calling either AVE state-update operation.
- When subfeature `1` is supported, the observed reset path calls `avocd_ave_api_set_vrr_mode(0)`.
- When subfeature `1` is unsupported but subfeature `2` is supported, the observed reset path calls `avocd_ave_api_update_game_motion_plus(0, 0, 0, 0)`, then writes zero to volatile setting `0x1E`.
- For `requested_mode != 1`, the four arguments prepared for the Game Motion Plus update are initialized to zero before this reset path.

For `requested_mode == 1`, the helper additionally calls `avocd_check_smooth_motion_control(data)`:

- Return value `1` enters a path that retrieves source-specific Smooth Motion Control settings, each with `save_type=1`:
  - `avocd_get_smooth_motion_control(data, source, &value, 1)`
  - `avocd_get_smc_blur_reduction(data, source, &value, 1)`
  - `avocd_get_smc_judder_reduction(data, source, &value, 1)`
- In that path, the code tests the retrieved Smooth Motion Control value. A nonzero value calls `avocd_get_smc_led_clear_motion(data, source, &value, 1)`; the subsequent control flow re-tests the Smooth Motion Control value. The complete intended loop/termination condition has not been established from this fragment, so no behavior should be inferred for the LED Clear Motion value.
- A nonzero return other than `1` exits the helper.
- Return value `0` leads to checks of volatile settings `0x20` and `0x25`. A nonzero value from setting `0x20` selects a separate diagnostic/early-return path (the helper returns `1` there). When setting `0x20` is zero, the setting-`0x25` test either reaches the reset path directly or reaches it after diagnostic logging.

The observed AVE operations associate subfeature `1` with the VRR setter path and subfeature `2` with the Game Motion Plus update path. This is a control-flow association, not a recovered public enum definition. The meanings of volatile settings `0x1E`, `0x20`, and `0x25`, the four Game Motion Plus arguments in non-reset paths, and the complete Smooth Motion Control/LED Clear Motion path remain unresolved. The `source` parameter is confirmed to be passed to the Smooth Motion Control getters; its use in the other paths is not established by the examined fragment.

For `requested_mode == 1`, the helper reads the current sound mode with `AVOC_audio_get_sound_mode(data, &sound_mode, 1)` and checks it with `avocd_check_special_view_sound_mode(sound_mode)`. The observed paths then restore the sound mode through `avocd_audio_set_sound_mode(service, data, sound_mode, 1)`. When the special-view check is false, the current sound mode is first written to DB setting `0x60` with `save_type=1`.

The helper reads DB setting `0x03` using the incoming `save_type`. Unless its value is in the inclusive range `0x20012`–`0x20013`, that value is copied to DB setting `0x04`, also using the incoming `save_type`. It then checks the effective HDR state through:

```cpp
bool avocd_hdr_meta_is_hdr_mode(AvocData* data);
```

The HDR result directly selects the Picture Mode applied by `avocd_set_picture_mode()`:

| HDR state at the time Game Mode is applied | Picture Mode value |
|---|---:|
| HDR active | `0x20013` |
| HDR inactive | `0x20012` |

The selected Picture Mode is applied with the incoming `save_type`. Both branches then call `avocd_set_film_mode(data, 0, 0)`, `_AVOC_set_rgb_only_mode(data, 0, 0, 0)`, and `avocd_set_digital_clean_view(data, 0, 0)`.

**Streaming-client integration implication:** this AVOC path selects its Picture Mode from the HDR state that exists when Game Mode is applied; it does not establish that a later HDR transition will cause the selection to be revisited. A client that enables HDR for a stream should therefore defer its Game Mode request until the player has received video and completed the corresponding display-mode transition. If the stream is SDR, Game Mode can be applied after the player has established the SDR display mode. This is an integration-ordering inference from the observed server behavior, not a documented AVOC callback or synchronization API; the player event that guarantees completion still needs to be identified.

When `requested_mode == 2`, the outer `avocd_set_game_mode()` function reads volatile setting `3`. If it is zero, execution joins the `requested_mode == 0` path. If nonzero, it changes the local `game_mode_type` argument to `1` and joins the main mode-configuration path.

In another branch, `avocd_update_wide_gaming(data, source, requested_mode)` is called before continuing through the surrounding mode-transition flow. Its complete gating conditions and side effects remain unresolved.

The numeric setting identifiers and structure-field offsets in these observations are implementation evidence only; their user-facing names and semantic meanings are not established.

#### Related server-side Game Mode helpers

The following helpers have been identified in the server implementation:

| Function | Confirmed behavior |
|---|---|
| `avocd_set_game_mode_by_source(AvocData*, tztv_source_e, avoc_game_mode_e, avoc_save_type_e)` | Requires the source to satisfy `(source & 0xff0000) == 0x80000`; otherwise returns `-1`. For a valid source, first writes DB value `0x103` for that source. If it is the current source, it also writes setting `0x103` through the current-source DB setter using the supplied `save_type`. For a non-current source and game-mode values 1 or 2, it checks UHD Color Mode and enables it if the retrieved value is zero. The observed valid-source paths return `0`; setter/getter results are not used to determine that return. |
| `avocd_determine_game_picture_mode(AvocData*, avocd_game_mode_type_e)` | Returns a `tztv_picture_mode_e`. Selects a base mode using `game_mode_type`, volatile setting `3`, HDR state, Game Mode subfeature `4`, and (when that subfeature is supported) volatile settings `0x42` and `0x43`. Observed constants include `0x1000B`, `0x70002`, `0x60006`, `0x60007`, `0x50010`, `0x70005`, `0x70006`, and `0x70007`. The symbolic names and semantics of these values and volatile settings are unknown. |
| `avocd_get_game_mode(AvocData*, avoc_game_mode_e*, avoc_save_type_e)` | Writes the mode through the output pointer and returns a separate status value. Its selection logic depends on model configuration, DB setting `0x36` or `0x39`, volatile setting `3`, and in some paths DICOM or Picture Mode state. Some paths normalize the output to `0` or `1`; a Picture Mode value of `0x20003` produces output `1`. |
| `avocd_get_picture_mode(AvocData*, tztv_picture_mode_e*, avoc_save_type_e)` | Reads DB setting `3`, `5`, or `0x132`, selected by model configuration `7`, volatile setting `0x2F`, and volatile setting `3). Copies the setting value to the output pointer and returns `0` in the observed paths. |
| `avocd_save_picture_mode_into_db(AvocData*, tztv_picture_mode_e, avoc_save_type_e)` | Writes Picture Mode to DB setting `3`, `5`, or `0x132`, using the same selection conditions as `avocd_get_picture_mode()`. For setting `0x132`, values outside `0x5000C`–`0x5000F` are replaced with `0x5000D`. The supplied `save_type` is forwarded to the DB setter. |
| `avocd_check_multiview_picture_mode(tztv_picture_mode_e)` | Returns true only for values in the inclusive range `0x5000C`–`0x5000F`. |
| `avocd_check_dynamic_black_eq(AvocData*)` | Checks Game Mode subfeature `3). Returns `2` when unsupported; otherwise gets Game Mode with save type `1` and returns `1` if the resulting mode is `1`, or `0` otherwise. |
| `avocd_set_dynamic_black_eq(AvocData*, int, avoc_save_type_e)` | When the check above returns `1`, stores the supplied value in DB setting `0x115`; otherwise calls the imported `avocd_ave_api_set_dynamic_black_eq(int)`. |
| `avocd_get_dynamic_black_eq(AvocData*, int*)` | When the check above returns `1`, reads DB setting `0x115` with save type `1`; otherwise writes zero to the output pointer. Returns `0` in both observed paths. |

The return values of `avocd_check_dynamic_black_eq()` are recorded as observed control values; their symbolic meanings are not established.

#### Handler behavior

The D-Bus `on_set_game_mode()` handler validates its first integer method argument against `0` and `1), and validates the requested mode with `avocd_data_check_boundary(data, 0x36, requested_mode)`. A failed validation returns service result `-2). A further rejection occurs when custom feature flag `13` is true, the current source is `0x80004`, and requested mode is `2). The successful path calls `avocd_set_game_mode_by_source()` and then the server-side `avocd_set_game_mode()` orchestration function. The complete enum and boundary-table semantics remain unknown.

The D-Bus `on_get_game_mode()` handler accepts save-type values `0` and `1`; values greater than `1` are rejected with `-2`. It calls `avocd_get_game_mode()`. An unchanged output sentinel is treated as an error and converted to result `-1). If a subsequent getter returns mode `2`, the handler overrides its main result with `2). The handler's own return value is separate from the method result.

### Related proxy and signal names

- `avoc_proxy_call_set_game_mode`
- `avoc_proxy_call_set_game_mode_sync`
- `avoc_proxy_call_set_game_mode_finish`
- `avoc_proxy_call_get_game_mode`
- `avoc_proxy_call_get_game_mode_sync`
- `avoc_proxy_call_get_game_mode_finish`
- `avoc_proxy_call_check_game_mode`
- `avoc_proxy_call_check_game_mode_sync`
- `avoc_proxy_call_check_game_mode_finish`
- `avoc_proxy_call_set_game_mode_by_source`
- `avoc_proxy_call_set_game_mode_by_source_sync`
- `avoc_proxy_call_set_game_mode_by_source_finish`
- `avoc_proxy_complete_set_game_mode`
- `avoc_proxy_complete_get_game_mode`
- `avoc_proxy_complete_check_game_mode`
- `avoc_proxy_emit_game_mode_changed`

The library also contains the `game_mode_changed` signal name. Its payload and subscription contract are unknown.

### Synchronous proxy-call behavior and dispatch error handling

Disassembly of the Game Mode synchronous proxy helpers establishes this common call pattern:

- Build a request `GVariant` with `g_variant_new`.
- Cast the supplied object to `GDBusProxy`.
- Call `g_dbus_proxy_call_sync` with no `GCancellable` and timeout `-1`.
- If a reply `GVariant` is returned, extract reply fields with `g_variant_get` and release the reply with `g_variant_unref`.
- Return a boolean indicating whether a reply `GVariant` was returned. This boolean is distinct from the AVOC method's `ret` value extracted from the reply.

| Helper | Request arguments passed to `g_variant_new` | Reply outputs extracted with `g_variant_get` |
|---|---|---|
| `avoc_proxy_call_set_game_mode_sync` | Two incoming arguments | One output: the AVOC `ret` value |
| `avoc_proxy_call_get_game_mode_sync` | One incoming argument | Two outputs: the mode value and AVOC `ret` |
| `avoc_proxy_call_check_game_mode_sync` | No arguments | One output: the AVOC `ret` value |
| `avoc_proxy_call_set_game_mode_by_source_sync` | Three incoming arguments | One output: the AVOC `ret` value |

### Confirmed Game Mode GVariant signatures

The synchronous helpers pass the following literal format strings to `g_variant_new` and `g_variant_get`. This establishes the method tuple signatures and the order and types of their fields:

| Method | Request tuple | Reply tuple | Reply fields |
|---|---|---|---|
| `SetGameMode` | `(ii)` | `(i)` | `ret` |
| `GetGameMode` | `(i)` | `(ii)` | `mode`, `ret` |
| `CheckGameMode` | `()` | `(i)` | `ret` |
| `SetGameModeBySource` | `(iii)` | `(i)` | `ret` |

Each `i` is a 32-bit signed integer in the GVariant type system. Thus, `SetGameModeBySource` sends three integer fields, including `source`; it does not send a string field in this proxy method signature. The reply field order for `GetGameMode` is `mode` followed by `ret`, matching the order of the output pointers supplied to `g_variant_get`.

The helper disassembly also confirms the request argument counts: two for `SetGameMode`, one for `GetGameMode`, none for `CheckGameMode`, and three for `SetGameModeBySource`. The exact semantic meaning and accepted values of those integer fields remain unresolved.

The helpers pass timeout `-1`, `NULL` for `GCancellable`, and a caller-provided `GError **` to `g_dbus_proxy_call_sync`.

The shared `avoc_dispatch_proxy_call_f` helper receives the proxy-call boolean, the `GError *`, and a pointer to the caller's integer result. Its observed result handling is:

- If the proxy-call boolean is true and the error pointer is `NULL`, it returns without changing the result.
- If the error pointer is non-NULL and the `GError.code` field equals `2`, it writes `-19` to the result.
- If the error pointer is `NULL` and the proxy-call boolean is false, it writes `-7` to the result.
- Other non-NULL error cases are logged and freed; this helper does not overwrite the result in the observed path.

The native Game Mode wrappers initialize their result local to `-1` before the proxy call. Therefore, in the observed control flow, an error case not explicitly mapped by the dispatcher can leave that initial value unchanged.

This dispatcher mapping concerns GDBus transport/error handling. It is separate from the AVOC `ret` integer decoded from a successful method reply. In particular, the observed dispatcher does not itself map a service reply value of `-2`; such a value can pass through as the method's returned `ret` when a reply is successfully decoded. The meaning of any AVOC service return value remains unknown.

## Picture-mode settings reset

Disassembly of `avocd_db_utils_reset_picture_mode()` establishes two sequential SQL operations against the `SETTING` table. The SQL format strings and the arguments passed to `g_string_append_printf()` establish the following behavior.

### First operation: delete settings without a default

```sql
DELETE FROM SETTING
WHERE picture_mode NOT IN (0x10003, 0x10004, 0x60002, 0x60003)
  AND default_value = -1
  AND setting_id NOT IN (
      0x4E, 0x4F, 0x50, 0x51, 0x52,
      0x53, 0x34, 0x01, 0x5B
  );
```

This operation deletes rows whose `picture_mode` is not one of the four protected values, whose `default_value` is `-1`, and whose `setting_id` is not one of the nine protected identifiers.

### Second operation: restore settings with a default

```sql
UPDATE SETTING
SET current_value = default_value
WHERE picture_mode NOT IN (0x10003, 0x10004, 0x60002, 0x60003)
  AND default_value != -1
  AND setting_id NOT IN (
      0x4E, 0x4F, 0x50, 0x51, 0x52,
      0x53, 0x34, 0x01, 0x5B, 0x5D
  );
```

This operation copies `default_value` into `current_value` for rows whose `picture_mode` is not protected, whose `default_value` is not `-1`, and whose `setting_id` is not one of the ten protected identifiers.

### Execution and return behavior

- The delete operation runs first.
- A nonzero result from the delete operation is logged, but execution continues to the update operation.
- The update operation is then executed regardless of whether the delete operation succeeded.
- The function returns the result of the update operation; it does not return the delete operation's result.
- The two protected `setting_id` lists are not identical: `0x5D` is excluded by the update but not by the delete.

The numeric identifiers are recorded as observed. Their individual setting names and semantic meanings have not been established.

## Picture and video processing

The following native function names occur in the supplied library inventory:

| Area | Function names |
|---|---|
| Picture mode | `avoc_check_picture_mode`, `avoc_check_picture_mode_by_mode`, `avoc_set_picture_mode`, `avoc_get_picture_mode` |
| Apply picture mode | `avoc_check_apply_picture_mode`, `avoc_set_apply_picture_mode`, `avoc_get_apply_picture_mode` |
| Color tone | `avoc_check_color_tone_mode`, `avoc_set_color_tone_mode`, `avoc_get_color_tone_mode` |
| RGB Only | `avoc_check_rgb_only_mode`, `avoc_set_rgb_only_mode`, `avoc_get_rgb_only_mode` |
| Film mode | `avoc_check_film_mode`, `avoc_check_film_mode_by_mode`, `avoc_set_film_mode`, `avoc_get_film_mode` |
| Auto Motion Plus | `avoc_check_auto_motion_plus_by_mode` |
| Gamma configuration | `avoc_check_gamma_config_mode_by_mode` |
| Gamut | `avoc_check_gamut_mode_by_mode` |

No parameter types, accepted values, or return contracts are established for these functions by the available inventory.

## HDR, VRR, UHD color, and PC mode

| Area | Function names |
|---|---|
| HDR10+ | `avoc_check_hdr10_plus_mode`, `avoc_set_hdr10_plus_mode`, `avoc_get_hdr10_plus_mode` |
| HDR Plus | `avoc_check_hdr_plus_mode`, `avoc_set_hdr_plus_mode`, `avoc_get_hdr_plus_mode` |
| VRR | `avoc_check_vrr_mode`, `avoc_set_vrr_mode_info`, `avoc_get_vrr_mode_info` |
| UHD color | `avoc_check_uhd_color_mode`, `avoc_check_uhd_color_mode_by_source`, `avoc_set_uhd_color_mode`, `avoc_get_uhd_color_mode` |
| Extended UHD color | `avoc_set_extended_uhd_color_mode`, `avoc_get_extended_uhd_color_mode` |
| PC mode | `avoc_get_pc_mode` |

The UHD color debug-format references include `source`, `value`, and `save_type` in the setter, and `save_type` and `source` in the getter. A debug-format string is not a substitute for a verified function signature.

## Special picture modes

| Area | Function names |
|---|---|
| HGiG | `avoc_check_HGiG_mode`, `avoc_set_HGiG_mode`, `avoc_get_HGiG_mode` |
| Adaptive mode | `avoc_check_adaptive_mode`, `avoc_set_adaptive_mode`, `avoc_get_adaptive_mode` |
| Director mode | `avoc_check_director_mode`, `avoc_set_director_mode`, `avoc_get_director_mode` |
| DICOM | `avoc_check_dicom_mode`, `avoc_set_dicom_mode`, `avoc_get_dicom_mode` |
| Outdoor mode | `avoc_set_outdoor_mode` |
| Ambient mode | `avoc_set_ambient_mode` |
| Art mode condition | `avoc_set_art_mode_condition` |

## Sound and audio

| Area | Function names |
|---|---|
| Sound mode | `avoc_check_sound_mode`, `avoc_check_sound_mode_by_mode`, `avoc_set_sound_mode`, `avoc_get_sound_mode` |
| Sound mode by app | `avoc_set_sound_mode_by_app`, `avoc_set_return_sound_mode_by_app` |
| Surround mode | `avoc_check_surround_mode`, `avoc_get_surround_mode`, `avoc_set_surround_mode` |
| HD audio mode | `avoc_change_hd_audio_mode` |
| Concert system mode | `avoc_check_concert_system_mode`, `avoc_get_concert_system_mode`, `avoc_set_concert_system_mode` |

The debug-format strings provide additional audio-related name references:

| Operation | Name | Argument names visible in debug format |
|---|---|---|
| Dolby Digital compression | `avoc_get_dolby_digital_comp` | `save_type`; logged value as mode |
| Dolby Digital compression | `avoc_set_dolby_digital_comp` | `save_type`, `mode` |
| Equalizer | `avoc_get_equalizer` | `band`, `save_type` |
| Equalizer | `avoc_set_equalizer` | `band`, `value`, `save_type` |
| Seven-band equalizer | `avoc_set7band_equalizer` | `band`, `value`, `save_type` |
| Sound feedback | `avoc_get_sound_feedback` | `save_type` |
| Sound feedback | `avoc_set_sound_feedback` | `save_type`, `sound_feedback` |
| Wireless microphone | `avoc_get_wireless_mic` | `save_type` |
| Wireless microphone | `avoc_set_wireless_mic` | `on_off`, `save_type` |
| Dialogue clarity | `avoc_get_dialog_clarity` | `save_type` |
| Dialogue clarity | `avoc_set_dialog_clarity` | `on_off`, `save_type` |
| Audio delay | `avoc_get_delay` | `save_type` |
| Audio delay | `avoc_set_delay` | `value`, `save_type` |
| Auto volume | `avoc_get_auto_volume` | `save_type` |
| Auto volume | `avoc_set_auto_volume` | `mode`, `save_type` |
| Balance | `avoc_get_balance` | `save_type` |
| Balance | `avoc_set_balance` | `value`, `save_type` |

The names and argument labels in this table are **debug-format references**, not verified exported symbols or complete signatures. The logged integer format specifiers do not establish the underlying API types or valid value ranges.

## Other native-name occurrences

| Area | Function names |
|---|---|
| Enhancer active mode | `avoc_get_enhancer_active_mode`, `avoc_set_enhancer_active_mode`, `avoc_check_enhancer_active_mode` |
| Panorama mode | `avoc_get_panorama_mode`, `avoc_set_panorama_mode` |
| Welcome mode | `avoc_set_welcome_mode` |
| Shop mode notification/update | `avoc_update_on_shop_mode_changed` |
| Senior mode | `avoc_get_senior_mode`, `avoc_set_senior_mode`, `avoc_check_senior_mode` |
| Cube lighting mode | `avoc_get_cube_lighting_mode`, `avoc_set_cube_lighting_mode` |
| Wide gaming | `avoc_get_wide_gaming`, `avoc_set_wide_gaming` |
| Force FMM | `avoc_set_use_force_FMM` |
| Game surround sound | `avoc_get_game_surround_sound` |

For `avoc_get_wide_gaming`, the debug-format reference mentions `source` and `mode`. For `avoc_set_wide_gaming`, it mentions `source` and `mode`. For `avoc_set_use_force_FMM`, it mentions `val`, `source`, and `scaler_mode`. For `avoc_get_game_surround_sound`, it mentions `save_type` and a value. These are debug-format clues only.

## Proxy API naming pattern

The inventory contains proxy functions in these forms:

- `avoc_proxy_call_<method>`
- `avoc_proxy_call_<method>_sync`
- `avoc_proxy_call_<method>_finish`
- `avoc_proxy_complete_<method>`

The method-specific names observed cover the native operations listed above, including picture, sound, HDR, VRR, UHD color, PC, surround, HGiG, adaptive, director, DICOM, outdoor, ambient, film, RGB-only, and Game Mode operations. These are proxy-layer helpers, not interchangeable with the native `avoc_*` API.

The inventory also contains proxy emitters and change notifications:
- `avoc_proxy_emit_sound_mode_changed`
- `avoc_proxy_emit_concert_mode_changed`
- `avoc_proxy_emit_pc_mode_changed_value`
- `avoc_proxy_emit_pc_mode_changed`
- `avoc_proxy_emit_game_mode_changed`
- `avoc_proxy_emit_picture_mode_changed`
- `avoc_proxy_emit_hdr_mode_changed`

Related notification names include `sound-mode-changed`, `concert-mode-changed`, `pc-mode-changed-value`, `pc-mode-changed`, `game-mode-changed`, `picture-mode-changed`, and `hdr-mode-changed`. Payload and subscription contracts are not yet known.

## Managed API

The related managed AVOC library exposes these Game Mode wrappers:
- `avoc_managed_get_game_mode`
- `avoc_managed_set_game_mode`
- `avoc_managed_check_game_mode`

Their accessibility, initialization requirements, and permission requirements for third-party applications are not established.

## Functional areas without individual names established here

The following areas were part of the initial functional inventory, but the supplied symbol/string listing does not establish specific function names for them:
- Energy saving
- Eco Sensor
- Backlight
- Brightness

Do not invent names for these areas. Add them when identified.

## Unresolved API details

For the functions listed outside the limited Game Mode reference, the following remain unknown unless explicitly stated above:
- Whether each native-name occurrence is an exported dynamic symbol and callable by external code.
- Complete C prototypes, parameter types, order, pointer ownership, and constness.
- Complete D-Bus method signatures and GVariant types.
- Accepted enumerations, numeric values, ranges, and default values.
- Return types and the meaning of success, failure, and individual return codes.
- Required initialization, calling context, authorization, and permissions.
- Side effects, persistence behavior, source identifiers, and version/architecture availability.
- Signal payloads, callback contracts, and subscription requirements.

The names and partial argument clues are retained as useful starting points. They must not be treated as a complete API specification.
