# AVOC Game Mode API research

**Status:** Static API research. This document does not describe an AVOC integration in WMP and does not claim that Game Mode control has been validated on all Tizen versions.

This note records reusable findings about the AVOC API surface, its Game Mode methods, and the remaining questions that must be resolved before an implementation can be considered reliable.

## 1. Scope and architectural constraints

WMP runs the native streaming engine independently of the WebApp's EMSS backend. AVOC research concerns native platform API access; it must not introduce an auxiliary EMSS instance or couple the two backends.

Samsung documentation for **External Device Manager / Game Mode Settings** concerns external input devices. It does not establish the API contract for native Tizen applications.

The fact that Game Mode can be activated through another backend does not identify the API used by that backend and does not validate AVOC.

## 2. Game Mode API surface

The AVOC library exposes the following Game Mode-related symbols:

- `avoc_set_game_mode`
- `avoc_get_game_mode`
- `avoc_check_game_mode`
- `avoc_set_game_mode_by_source`
- Synchronous and asynchronous proxy methods for setting, getting, and checking Game Mode.
- Completion methods for the proxy calls.
- `avoc_proxy_emit_game_mode_changed`

The related managed library imports the native set/get/check functions and exposes:

- `avoc_managed_get_game_mode`
- `avoc_managed_set_game_mode`
- `avoc_managed_check_game_mode`

The existence of managed wrappers does not by itself establish that they are available to third-party applications or have fewer permission restrictions.

## 3. Method metadata

AVOC proxy metadata identifies these logical method arguments:

| Method | Input arguments | Output arguments |
|---|---|---|
| `set_game_mode` | `save_type`, `mode` | `ret` |
| `get_game_mode` | `save_type` | `mode`, `ret` |
| `set_game_mode_by_source` | `save_type`, `source`, `game_mode` | `ret` |
| `check_game_mode` | None observed | `ret` |

This establishes the logical argument names, but not the exact D-Bus types, C signatures, accepted values, authorization requirements, or semantics.

The `set_game_mode_by_source` method warrants further investigation because it accepts a `source` argument. The expected source identifier and its applicability to native streaming sessions remain unknown.

The library also contains a `game_mode_changed` signal, which may provide a way to observe state changes once its subscription contract is understood.

## 4. Observed return value and unresolved failure

In one native call path, the following behavior was observed:

- The AVOC shared library was loaded successfully.
- The `avoc_set_game_mode` symbol was resolved.
- The call was made with `save_type=1` and `mode=1`.
- The function returned `-2`.

The meaning and origin of `-2` have not been established. Available evidence does not determine whether it represents local validation, a daemon communication failure, a firmware condition, or another error.

Do not interpret `-2` as “unsupported API” or “invalid argument” without tracing the code path that produces it.

An internal application state variable is not an independent reading of the television's actual Game Mode state. Likewise, errors from unrelated input initialization code do not explain an AVOC return value without evidence connecting the two paths.

## 5. Proxy call behavior

The inspected synchronous proxy implementation:

1. Constructs a `GVariant` containing the method inputs.
2. Obtains the D-Bus proxy.
3. Calls `g_dbus_proxy_call_sync`.
4. Extracts the returned value when a response is received.
5. Releases the returned variant.

This describes the proxy transport path; it is not the implementation body of `avoc_set_game_mode` and does not explain where the observed `-2` originates.

Relevant internal metadata names include:

- `_avoc_proxy_method_info_set_game_mode_IN_ARG_save_type`
- `_avoc_proxy_method_info_set_game_mode_IN_ARG_mode`
- `_avoc_proxy_method_info_set_game_mode_OUT_ARG_ret`
- `_avoc_proxy_method_info_set_game_mode_by_source_IN_ARG_source`
- `_avoc_proxy_method_info_set_game_mode_by_source_IN_ARG_game_mode`
- `_avoc_proxy_method_info_get_game_mode_OUT_ARG_mode`
- `_avoc_proxy_signal_info_game_mode_changed`

## 6. Earlier Tizen implementation reference

An experimental implementation in the public [WMP/moonlight-tizen50 repository](https://github.com/WMP/moonlight-tizen50/blob/608e2e98540c1202786aed3df8bf910f7cbb947d/mlclient/engine_avoc.c) declares:

```c
typedef int (*avoc_set_game_mode_fn)(int save_type, int mode);
```

and invokes:

```c
int rc = set(1, on ? 1 : 0);
```

The source comment associates `save_type=1` with saving/restoring by source and `mode=1/0` with enabling/disabling. This is an experimental code reference, not official API documentation and not proof of compatibility across Tizen releases.

## 7. Other AVOC API families

The AVOC library exposes symbols from several other platform-control families:

- **Picture:** picture mode get/set/check operations and mode-specific variants.
- **Sound:** sound mode get/set/check operations and application-specific operations.
- **HDR:** HDR10+, HDR Plus, and related change notifications.
- **VRR:** `avoc_get_vrr_mode_info`, `avoc_set_vrr_mode_info`, and `avoc_check_vrr_mode`.
- **UHD and HDMI color:** UHD color and extended-mode operations, including source-specific methods.
- **PC mode:** `avoc_get_pc_mode` and change notifications.
- **HGiG:** `avoc_get_HGiG_mode`, `avoc_set_HGiG_mode`, and `avoc_check_HGiG_mode`.
- **Picture processing:** Film Mode, Director Mode, DICOM, Adaptive Mode, RGB Only, Color Tone, and Apply Picture Mode.
- **Panel and ambient features:** Ambient Mode, Outdoor Mode, Energy Saving, Eco Sensor, Backlight, and Brightness.
- **Audio processing:** Surround Mode, Dolby Digital compression, HD audio mode, and equalizer operations.

This is a symbol inventory, not a guarantee that every method is available to third-party applications or a specification of its parameters. Each API requires individual analysis.

## 8. Open questions and next steps

1. Trace the implementation of `avoc_set_game_mode` and identify the exact path that returns `-2`.
2. Establish the D-Bus argument types, method signatures, return codes, and authorization requirements.
3. Determine the accepted values and semantics of `save_type` and `mode`.
4. Determine the expected `source` identifier for `avoc_set_game_mode_by_source`.
5. Establish how to subscribe to `game_mode_changed` and whether it reports authoritative state.
6. Compare the API contract across relevant Tizen versions and device architectures before relying on it.
7. Validate API return values separately from the actual platform Game Mode state.

Until these questions are resolved, the available evidence is insufficient to claim that AVOC Game Mode control is reliable for native third-party applications.
