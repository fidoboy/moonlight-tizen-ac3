---
layout: docs-page
lang: es
title: "Guía de inicio rápido"
description: "Primeros pasos con Moonlight Tizen y hosts compatibles con GameStream."
---

# Guía de inicio rápido

Esta guía explica el camino más corto desde la instalación hasta tener una transmisión funcionando en un televisor Samsung Smart TV.

## 1. Comprueba la configuración

Necesitarás:

- Un Samsung Smart TV con Tizen 5.5 o posterior.
- Un PC con Sunshine u otro host compatible con GameStream.
- Una GPU del host compatible con codificación por hardware.
- Una conexión de red estable entre el televisor y el PC. Para empezar, se recomienda Ethernet en el host y una conexión Wi-Fi de 5 GHz fiable o Ethernet en el televisor.
- Un mando compatible si quieres jugar con un controlador.

Consulta los [requisitos previos del README](../#compatibility) para obtener más información.

## 2. Instala el cliente

**Método recomendado: instalarlo desde el sitio oficial de [Apps2Samsung](https://apps2samsung.com/).** Descarga y ejecuta Apps2Samsung en el ordenador, selecciona el televisor, busca **Moonlight** en su catálogo de aplicaciones y elige la variante `fidoboy · Enhanced · Dolby`. Es la opción más sencilla porque Apps2Samsung prepara y firma el paquete por ti.

**Alternativa: instalación manual del WGT.** Descarga `Moonlight.wgt` desde la [última versión estable](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) e instálalo con uno de estos métodos:

- **Apps2Samsung:** selecciona **Custom WGT / TPK** y elige el archivo descargado.
- **Tizen Studio:** conecta el televisor con el modo desarrollador activado e instala el paquete con las herramientas de despliegue de Tizen y un perfil de certificados aceptado por el televisor. Consulta la [Guía de instalación](Installation-Guide-es.html) para más detalles.

Utiliza `Moonlight-ForceGM.wgt` solo si tu televisor necesita específicamente los metadatos alternativos de Game Mode.
## 3. Configura el host y empareja

1. Instala e inicia en el PC cualquier servidor anfitrión compatible con GameStream. Algunos ejemplos son [Sunshine](https://app.lizardbyte.dev/Sunshine/), [Vibeshine](https://github.com/Nonary/vibeshine/releases), [Apollo](https://github.com/ClassicOldSong/Apollo/releases) y [Punktfunk](https://docs.punktfunk.unom.io/docs/install). También pueden funcionar otros programas anfitriones compatibles.
2. Asegúrate de que el PC y el televisor puedan comunicarse en la misma red y que el cortafuegos del host permita las conexiones de transmisión.
3. Inicia Moonlight en el televisor y selecciona el host cuando aparezca.
4. Moonlight mostrará un PIN. Abre la interfaz web del servidor anfitrión en el PC, introduce el PIN en la sección de emparejamiento y confirma.
5. Selecciona un juego o el escritorio para iniciar la transmisión.

En una instalación nueva, empieza con valores conservadores de resolución, frecuencia de imagen y tasa de bits. Auméntalos cuando hayas confirmado que la transmisión es estable.

## 4. Activa la salida óptica Dolby (opcional)

El passthrough Dolby requiere la [compilación experimental ac3-audio de Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondiente; puedes descargar la versión de Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) o [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). También necesitas una ruta de audio compatible en el televisor y un receptor o sistema de sonido que admita el formato.

Como alternativa, el passthrough Dolby también está disponible en la [compilación nightly 2.0.2 de Vibeshine](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d).

1. Conecta la salida óptica del televisor al receptor o sistema de sonido.
2. En los ajustes de sonido del televisor, elige un modo de salida que transmita un flujo Dolby compatible en lugar de forzar PCM estéreo. Los nombres exactos varían según el modelo.
3. En Settings de Moonlight, activa **Enable Dolby Digital** y selecciona estéreo o 5.1.
4. Inicia una transmisión y abre la superposición de rendimiento con **Ctrl+Alt+Shift+S**. Comprueba si la línea de audio activa indica OPUS, AC-3 o E-AC-3 y la distribución de canales esperada.

Si el host solo ofrece OPUS, la transmisión seguirá usando OPUS. Activar un interruptor en el cliente no hace que un host que solo ofrece OPUS envíe audio Dolby.

## 5. Ajusta la transmisión

Cuando funcione la primera transmisión, ajusta la resolución, la frecuencia de imagen, la tasa de bits, el códec de vídeo y el audio según las capacidades del televisor y de la red. Consulta el [Resumen de funciones](Features-Overview-es.html) y las [Preguntas frecuentes](../Frequently-Asked-Questions.html) para más detalles.
