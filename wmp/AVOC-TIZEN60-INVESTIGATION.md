# AVOC API inventory

This document is a concise reference for AVOC functions and method metadata that may be useful when integrating AVOC APIs from native code. It records API names and parameter information only where that information has been identified. It does not infer undocumented types, values, ownership rules, or availability.

## Game Mode

### Native functions

| Function | Known information |
|---|---|
| `avoc_set_game_mode` | Setter. An experimental public implementation declares the C function type as `int (int save_type, int mode)`. |
| `avoc_get_game_mode` | Getter. The proxy method takes `save_type` and returns `mode` plus `ret`. |
| `avoc_check_game_mode` | Capability/check operation. The proxy metadata shows no input arguments and an output `ret`. |
| `avoc_set_game_mode_by_source` | Setter with inputs `save_type`, `source`, and `game_mode`; output `ret`. |

The proxy metadata identifies the following logical arguments:

| Proxy method | Inputs | Outputs |
|---|---|---|
| `set_game_mode` | `save_type`, `mode` | `ret` |
| `get_game_mode` | `save_type` | `mode`, `ret` |
| `check_game_mode` | None observed | `ret` |
| `set_game_mode_by_source` | `save_type`, `source`, `game_mode` | `ret` |

**Important:** these are logical argument names, not confirmed C or D-Bus type declarations. The accepted values and semantics of `save_type`, `mode`, `source`, and `game_mode` have not been fully established.

### Experimental C signature reference

The public [WMP Tizen 5.0 implementation](https://github.com/WMP/moonlight-tizen50/blob/608e2e98540c1202786aed3df8bf910f7cbb947d/mlclient/engine_avoc.c) declares:

```c
typedef int (*avoc_set_game_mode_fn)(int save_type, int mode);
```

and calls the function with `save_type=1` and `mode=1` to enable or `mode=0` to disable. Its source comment associates `save_type=1` with saving/restoring by source. Treat this as an experimental usage reference, not a complete API specification.

### Related symbols

- `avoc_proxy_call_set_game_mode`
- `avoc_proxy_call_set_game_mode_sync`
- `avoc_proxy_call_get_game_mode`
- `avoc_proxy_call_get_game_mode_sync`
- `avoc_proxy_call_check_game_mode`
- `avoc_proxy_call_check_game_mode_sync`
- `avoc_proxy_complete_set_game_mode`
- `avoc_proxy_complete_get_game_mode`
- `avoc_proxy_complete_check_game_mode`
- `avoc_proxy_emit_game_mode_changed`

The library exposes a `game_mode_changed` signal. Its exact payload and subscription contract have not been established.

## Managed API

The related managed AVOC library exposes:

- `avoc_managed_get_game_mode`
- `avoc_managed_set_game_mode`
- `avoc_managed_check_game_mode`

The existence of these wrappers does not establish their accessibility to third-party applications or their permission requirements.

## Other discovered API families

The AVOC library symbol inventory also includes functions in these areas:

- Picture mode
- Sound mode
- HDR10+ and HDR Plus
- Variable refresh rate (VRR)
- UHD and HDMI color modes
- PC mode
- HGiG
- Film Mode and Director Mode
- DICOM and Adaptive Mode
- RGB Only and Color Tone
- Ambient Mode and Outdoor Mode
- Energy Saving and Eco Sensor
- Backlight and Brightness
- Surround Mode
- Dolby Digital compression
- HD audio mode
- Equalizer

These entries are API-family classifications, not function signatures. Individual function names, parameters, types, return values, and availability must be recorded only after they have been verified.

## Unresolved API details

For Game Mode, the following information remains to be established before relying on the API:

- Exact C and D-Bus types and complete signatures.
- Accepted values and semantics for all arguments.
- Return-code definitions.
- Authorization and calling-context requirements.
- The expected identifier and meaning of `source` in `avoc_set_game_mode_by_source`.
- The payload and subscription contract of `game_mode_changed`.
- API availability and compatibility across Tizen versions and architectures.

Do not infer undocumented API behavior from symbol names alone.
