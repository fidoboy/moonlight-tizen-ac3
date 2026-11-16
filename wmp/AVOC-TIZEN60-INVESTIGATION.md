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
| `avoc_set_game_mode` | Setter. An experimental public implementation declares the C function type as `int (int save_type, int mode)`. |
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

It calls the function with `save_type=1` and `mode=1` to enable or `mode=0` to disable. Its source comment associates `save_type=1` with saving/restoring by source. Treat this as an experimental usage reference, not a complete API specification.


### Native wrapper control flow (Tizen 6.0 x86 build)

Disassembly of the three native Game Mode entry points establishes the following wrapper behavior:

| Function | Proxy operation | Arguments forwarded by the native wrapper | Output handling |
|---|---|---|---|
| `avoc_set_game_mode` | `avoc_proxy_call_set_game_mode_sync` | The second and third incoming stack arguments (cdecl offsets `[ebp+0xc]` and `[ebp+0x10]`) | Returns a local result value populated through the proxy-call dispatch path. |
| `avoc_get_game_mode` | `avoc_proxy_call_get_game_mode_sync` | The second incoming stack argument (`[ebp+0xc]`) | Copies the proxy-provided mode value to the pointer supplied as the third incoming stack argument (`[ebp+0x10]`); returns a separate result value. |
| `avoc_check_game_mode` | `avoc_proxy_call_check_game_mode_sync` | No incoming arguments are read or forwarded | Returns a local result value populated through the proxy-call dispatch path. |

For both `avoc_set_game_mode` and `avoc_get_game_mode`, the first incoming stack argument (`[ebp+8]`) is not referenced in the disassembled function body. Its purpose is unknown. Consequently, the experimental two-argument Tizen 5.0 setter declaration above must not be assumed to describe the complete Tizen 6.0 entry-point ABI.

All three functions call `avoc_init_gdbus_connections` before obtaining the proxy and making a synchronous proxy call. If initialization returns nonzero, each function follows an error path that returns `-7` (`0xfffffff9`). Their result locals are initialized to `-1` before the proxy-call path; the final meaning of that value, and the values written by the dispatch helper, are not yet established.

This disassembly confirms wrapper control flow and argument forwarding only. It does not establish the forwarded arguments' semantic names or types, the D-Bus/GVariant signatures, or the meaning of proxy return codes.

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
