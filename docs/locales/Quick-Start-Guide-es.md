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

Descarga el paquete estándar `Moonlight.wgt` desde la [página de versiones](https://github.com/fidoboy/moonlight-tizen-ac3/releases). Elige el paquete ForceGM solo si necesitas específicamente los metadatos alternativos de Game Mode.

Sigue la [Guía de instalación](Installation-Guide-es.html) para instalarlo con Apps2Samsung, Tizen Studio u otro método compatible.

## 3. Configura el host y empareja

1. Instala e inicia Sunshine en el PC host.
2. Asegúrate de que el PC y el televisor puedan comunicarse en la misma red y que el cortafuegos del host permita las conexiones de transmisión.
3. Inicia Moonlight en el televisor y selecciona el host cuando aparezca.
4. Moonlight mostrará un PIN. Abre la interfaz web de Sunshine en el PC, introduce el PIN en la sección de emparejamiento y confirma.
5. Selecciona un juego o el escritorio para iniciar la transmisión.

En una instalación nueva, empieza con valores conservadores de resolución, frecuencia de imagen y tasa de bits. Auméntalos cuando hayas confirmado que la transmisión es estable.

## 4. Activa la salida óptica Dolby (opcional)

El passthrough Dolby requiere la [compilación experimental ac3-audio de Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondiente; puedes descargar la versión de Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) o [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). También necesitas una ruta de audio compatible en el televisor y un receptor o sistema de sonido que admita el formato.

1. Conecta la salida óptica del televisor al receptor o sistema de sonido.
2. En los ajustes de sonido del televisor, elige un modo de salida que transmita un flujo Dolby compatible en lugar de forzar PCM estéreo. Los nombres exactos varían según el modelo.
3. En Settings de Moonlight, activa **Enable Dolby Digital** y selecciona estéreo o 5.1.
4. Inicia una transmisión y abre la superposición de rendimiento con **Ctrl+Alt+Shift+S**. Comprueba si la línea de audio activa indica OPUS, AC-3 o E-AC-3 y la distribución de canales esperada.

Si el host solo ofrece OPUS, la transmisión seguirá usando OPUS. Activar un interruptor en el cliente no hace que un host que solo ofrece OPUS envíe audio Dolby.

## 5. Ajusta la transmisión

Cuando funcione la primera transmisión, ajusta la resolución, la frecuencia de imagen, la tasa de bits, el códec de vídeo y el audio según las capacidades del televisor y de la red. Consulta el [Resumen de funciones](Features-Overview-es.html) y las [Preguntas frecuentes](../Frequently-Asked-Questions.html) para más detalles.
