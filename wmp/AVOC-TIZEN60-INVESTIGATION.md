# AVOC en Tizen 6.0: inventario e investigación

**Estado:** investigación estática; no constituye una integración de AVOC en WMP ni una validación funcional.
**Entorno:** Samsung Tizen 6.0. Imagen examinada: Samsung TV Extension SDK 6.0.0, emulador x86.

Esta nota conserva hallazgos técnicos reutilizables sobre AVOC y Game Mode. Separa los hechos observados de las cuestiones abiertas.

## 1. Contexto y límites

WMP ejecuta el motor nativo `libmlengine.so` en un servicio .NET independiente. Esta investigación estudia si el reproductor nativo puede controlar Game Mode mediante AVOC.

La ruta EMSS ya ha demostrado que el televisor puede activar Game Mode. Eso no demuestra qué API usa EMSS ni valida AVOC. No se debe introducir una instancia EMSS auxiliar en WMP: son subsistemas independientes.

La documentación de «External Device Manager / Game Mode Settings» se refiere a dispositivos externos y no acredita el mecanismo para aplicaciones Tizen nativas.

## 2. Síntoma observado

En el recorrido nativo se registró:

```text
LiStartConnection -> 0
TV Game Mode: transition requested=1 preference=1 current_api_state=0
AVOC: dlopen(libavoc.so) SUCCEEDED handle=...
AVOC: symbol avoc_set_game_mode RESOLVED address=...
AVOC: calling avoc_set_game_mode(save_type=1, mode=1)
AVOC: avoc_set_game_mode returned rc=-2
AVOC: AVOC API reported failure transition=enable rc=-2
input_init -> -1
ml_engine_start_session -> 0
```

Conclusiones:

- La biblioteca se pudo cargar y el símbolo se resolvió en el dispositivo.
- La llamada devolvió `-2`; no se ha encontrado documentación fiable para asignar significado a ese código.
- `current_api_state=0` es el estado interno informado por WMP, no una lectura independiente del estado real de Game Mode.
- `input_init -> -1` pertenece a otro subsistema y no explica por sí mismo el resultado AVOC.
- No se sabe si `-2` procede de validación local, comunicación con el daemon o una condición del firmware.

No interpretar `-2` como «API no soportada» o «parámetro inválido» sin localizar la ruta que lo devuelve.

## 3. Imagen Tizen 6.0 examinada

Se utilizó Samsung TV Extension SDK 6.0.0 y su imagen QCOW2 x86 del emulador. La imagen es QCOW2 v3, con disco virtual de 12 GiB y dos particiones ext4 de aproximadamente 6 GiB:

| Dispositivo | Etiqueta | Uso |
|---|---|---|
| `/dev/nbd0p1` | `emulator-rootfs` | Sistema raíz |
| `/dev/nbd0p2` | `emulator-sysdata` | Datos del sistema |

Se conectó en solo lectura mediante NBD y se montó sin reproducir el journal:

```sh
modprobe nbd max_part=16
IMAGE="/path/to/emulimg-6.0.x86"
qemu-nbd --read-only --connect=/dev/nbd0 "$IMAGE"
mkdir -p /mnt/tizen60-rootfs /mnt/tizen60-sysdata
mount -t ext4 -o ro,noload /dev/nbd0p1 /mnt/tizen60-rootfs
mount -t ext4 -o ro,noload /dev/nbd0p2 /mnt/tizen60-sysdata
```

Al terminar, desmontar ambos puntos y ejecutar `qemu-nbd --disconnect /dev/nbd0`.

**Limitación:** es la imagen x86 del emulador, no el firmware ARM32 del televisor. Sus binarios e interfaces no sustituyen la comprobación en el firmware real.

## 4. Componentes AVOC encontrados

En el rootfs se localizaron:

- `/usr/bin/avocd`: daemon AVOC.
- `/usr/lib/libavoc.so`: biblioteca AVOC principal.
- `/usr/lib/libavoc-managed.so`: capa de interfaz gestionada.
- `/usr/lib/libavoc-br.so`
- `/usr/lib/libavoc-mls.so`
- `/usr/lib/libavoc-avsink.so`
- `/usr/lib/libavoc-checker.so`
- `/usr/lib/systemd/system/avocd-launcher.service`
- `/usr/apps/settings-datafw/res/jsons/tv/game-mode-setting.json`
- `/usr/apps/migration/jobs/avoc.migration.json`
- `/usr/apps/csapi-tv-tizenfx/shared/lib/Tizen.TV.System.Framework.dll`
- `/usr/apps/csapi-tv-tizenfx/shared/lib/Tizen.TV.System.Framework.pdb`
- Recursos JSON de Game Mode (On, Off, Auto, Game Boost y FreeSync) bajo el paquete de recursos de temas de Samsung.
- Archivos de base de datos AVOC bajo `/dbspace/` en sysdata.

Algunos nombres `libavoc-*.so` son enlaces simbólicos hacia `/usr/lib/libavoc.so`; no son necesariamente bibliotecas independientes.

## 5. Biblioteca principal y símbolos

La biblioteca examinada:

```text
ELF 32-bit LSB shared object, Intel 80386, dynamically linked
BuildID[sha1]=20b0c30b947c7d2f7389512d55705d164ebd2d6d
not stripped
```

Símbolos exportados relacionados con Game Mode:

- `avoc_set_game_mode`
- `avoc_get_game_mode`
- `avoc_check_game_mode`
- `avoc_set_game_mode_by_source`
- `avoc_proxy_call_set_game_mode`
- `avoc_proxy_call_set_game_mode_sync`
- `avoc_proxy_call_get_game_mode`
- `avoc_proxy_call_get_game_mode_sync`
- `avoc_proxy_call_check_game_mode`
- `avoc_proxy_call_check_game_mode_sync`
- `avoc_proxy_emit_game_mode_changed`
- `avoc_proxy_complete_set_game_mode`
- `avoc_proxy_complete_get_game_mode`
- `avoc_proxy_complete_check_game_mode`

Direcciones y tamaños de esta compilación concreta:

| Símbolo | Dirección | Tamaño |
|---|---:|---:|
| `avoc_set_game_mode` | `0x84140` | 338 bytes |
| `avoc_get_game_mode` | `0x842a0` | 354 bytes |
| `avoc_check_game_mode` | `0x8ee00` | 314 bytes |
| `avoc_set_game_mode_by_source` | `0x7b080` | 346 bytes |

Estas direcciones solo corresponden al binario identificado por el Build ID anterior.

### 5.1 Capa gestionada

`libavoc-managed.so` importa funciones AVOC de Game Mode y exporta:

- `avoc_managed_get_game_mode`
- `avoc_managed_set_game_mode`
- `avoc_managed_check_game_mode`

El wrapper `avoc_managed_set_game_mode` aparece en `0x2f30`, tamaño 50 bytes. Su existencia justifica inspeccionar la capa gestionada, pero no demuestra que sea invocable desde cualquier aplicación ni que tenga menos restricciones.

## 6. Metadatos D-Bus

Los metadatos internos de métodos proxy AVOC muestran estos nombres de argumentos:

| Método | Entrada | Salida |
|---|---|---|
| `set_game_mode` | `save_type`, `mode` | `ret` |
| `get_game_mode` | `save_type` | `mode`, `ret` |
| `set_game_mode_by_source` | `save_type`, `source`, `game_mode` | `ret` |
| `check_game_mode` | Ninguna observada | `ret` |

Esto confirma la estructura lógica y los nombres, pero no los tipos D-Bus, la firma C exacta, los valores válidos ni los permisos necesarios.

`set_game_mode_by_source` merece atención futura porque acepta un argumento `source`; aún no se conoce qué identificador espera ni si se aplica a una sesión nativa de streaming.

La biblioteca contiene también la señal `game_mode_changed`, potencialmente útil para observar cambios si se determina cómo suscribirse.

## 7. Desensamblado disponible

La salida de comandos examinada incluye el desensamblado de:

```text
0005c220 <avoc_proxy_call_set_game_mode_sync>
```

Ese proxy construye un `GVariant` con dos entradas, obtiene el proxy D-Bus, llama a `g_dbus_proxy_call_sync`, extrae el retorno mediante `g_variant_get` si hay respuesta y libera el valor recibido.

**No es el cuerpo de `avoc_set_game_mode`**. Por tanto, todavía no permite determinar dónde se genera `-2`.

Entre los metadatos localizados figuran:

- `_avoc_proxy_method_info_set_game_mode_IN_ARG_save_type`
- `_avoc_proxy_method_info_set_game_mode_IN_ARG_mode`
- `_avoc_proxy_method_info_set_game_mode_OUT_ARG_ret`
- `_avoc_proxy_method_info_set_game_mode_by_source_IN_ARG_source`
- `_avoc_proxy_method_info_set_game_mode_by_source_IN_ARG_game_mode`
- `_avoc_proxy_method_info_get_game_mode_OUT_ARG_mode`
- `_avoc_proxy_signal_info_game_mode_changed`

## 8. Otras familias de API AVOC

El inventario de símbolos de `libavoc.so` muestra otras familias potencialmente útiles:

- **Imagen:** `avoc_get_picture_mode`, `avoc_set_picture_mode`, `avoc_check_picture_mode` y variantes por modo.
- **Sonido:** `avoc_get_sound_mode`, `avoc_set_sound_mode`, `avoc_check_sound_mode` y operaciones por aplicación.
- **HDR:** funciones HDR10+, HDR Plus y señales de cambios HDR.
- **VRR:** `avoc_get_vrr_mode_info`, `avoc_set_vrr_mode_info`, `avoc_check_vrr_mode`.
- **UHD / color HDMI:** consulta y modificación de UHD color y modos extendidos, incluidos métodos por fuente HDMI.
- **PC mode:** `avoc_get_pc_mode` y señal de cambio.
- **HGiG:** `avoc_get_HGiG_mode`, `avoc_set_HGiG_mode`, `avoc_check_HGiG_mode`.
- **Modos de imagen:** Film Mode, Director Mode, DICOM, Adaptive Mode, RGB Only, Color Tone y Apply Picture Mode.
- **Panel y ambiente:** Ambient Mode, Outdoor Mode, Energy Saving, Eco Sensor, Backlight y Brightness.
- **Procesamiento de sonido:** Surround Mode, compresión Dolby Digital, HD audio mode y ecualización.

Es un catálogo de símbolos, no una garantía de disponibilidad para aplicaciones de terceros ni una especificación de parámetros. Cada API requiere análisis individual.

## 9. Referencia experimental Tizen 5.0

Implementación experimental localizada en:

- Repositorio: https://github.com/WMP/moonlight-tizen50
- Commit: `608e2e98540c1202786aed3df8bf910f7cbb947d`
- Archivo: [`mlclient/engine_avoc.c`](https://github.com/WMP/moonlight-tizen50/blob/608e2e98540c1202786aed3df8bf910f7cbb947d/mlclient/engine_avoc.c)

Declara un puntero de función equivalente a:

```c
typedef int (*avoc_set_game_mode_fn)(int save_type, int mode);
```

y llama:

```c
int rc = set(1, on ? 1 : 0);
```

El comentario del experimento asocia `save_type=1` a guardar/restaurar por fuente y `mode=1/0` a activar/desactivar. Es una referencia de código Tizen 5.0, no documentación oficial ni prueba de compatibilidad Tizen 6.0.

## 10. Próximos pasos

1. Obtener el desensamblado de `avoc_set_game_mode`, `avoc_get_game_mode`, `avoc_check_game_mode` y `avoc_set_game_mode_by_source`.
2. Seguir la ruta de retorno de `avoc_set_game_mode` y localizar si `-2` se genera antes o después de D-Bus.
3. Analizar tipos de argumentos D-Bus y valores de retorno.
4. Inspeccionar `avocd`, su unidad systemd y los recursos de configuración.
5. Examinar `libavoc-managed.so` y el API .NET relacionado.
6. Comparar con bibliotecas del firmware ARM32 real; la imagen x86 no sustituye esa comparación.
7. Solo después de establecer el contrato, probar la llamada desde una aplicación Tizen nativa y medir por separado el retorno AVOC y el estado real de Game Mode.

Comandos para obtener los cuerpos de las funciones:

```sh
LIB="/mnt/tizen60-rootfs/usr/lib/libavoc.so"
objdump -d -Mintel --start-address=0x84140 --stop-address=0x842a0 "$LIB"
objdump -d -Mintel --start-address=0x842a0 --stop-address=0x84310 "$LIB"
objdump -d -Mintel --start-address=0x8ee00 --stop-address=0x8ef50 "$LIB"
objdump -d -Mintel --start-address=0x7b080 --stop-address=0x7b1e0 "$LIB"
```

## 11. Mantenimiento

Al añadir resultados, registrar versión/Build ID, arquitectura, comando, evidencia, conclusión, incógnitas y si el dato procede del emulador x86 o del firmware real. No trasladar conclusiones entre versiones, arquitecturas o builds sin comprobarlas.
