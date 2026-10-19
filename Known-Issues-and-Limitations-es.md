---
layout: docs-page
lang: es
title: "Problemas conocidos y limitaciones"
description: "Limitaciones conocidas del audio Dolby, Tizen y la transmisión en Moonlight Tizen."
---

# Problemas conocidos y limitaciones

## Audio Dolby por salida óptica

- El passthrough Dolby es una extensión opcional y requiere la implementación experimental compatible de Sunshine. Un host estándar que envíe OPUS seguirá siendo compatible, pero continuará utilizando OPUS.
- AC-3 está limitado a 5.1 canales. El codificador experimental compatible actual admite estéreo y 5.1, no 7.1.
- El passthrough E-AC-3 por salida óptica depende del modelo de televisor, el firmware, la configuración de salida y el receptor. No des por hecho que todos los televisores pueden enviar E-AC-3 por TOSLINK.
- La canalización de audio nativa del televisor debe aceptar el formato comprimido. Si rechaza la inicialización de la pista, no se podrá reproducir un flujo Dolby a través de esa ruta.
- Esta función se ha probado con un televisor Samsung y una cadena de audio concretos; no se ha establecido la compatibilidad con todas las combinaciones de televisor y receptor.
- La tasa de bits de audio mostrada en la superposición es una medición aproximada de la recepción, no un campo de negociación del códec ni un objetivo de codificación garantizado.

## Limitaciones de Tizen y del televisor

- El cliente está destinado a televisores Samsung compatibles con Tizen 5.5 o posterior, pero las capacidades varían según el modelo y el firmware.
- El sistema operativo o las capacidades del televisor pueden limitar Game Mode y las opciones de frecuencia de actualización alta, aunque aparezca el ajuste.
- Algunos televisores tienen un puerto Ethernet de 100 Mbps. A altas resoluciones o tasas de bits, el tráfico de fotogramas en ráfagas puede provocar pérdida de paquetes por Ethernet. Probar una conexión Wi-Fi de 5 GHz fiable puede ayudar a distinguirlo de un problema del host.
- La resolución de vídeo, la frecuencia de imagen, HDR, AV1 y las tasas de bits altas dependen del decodificador del televisor y del codificador de la GPU del host. Las combinaciones no compatibles pueden usar una alternativa o no llegar a iniciar.

## Proyecto independiente y estado de las versiones

Este proyecto se mantiene de forma independiente e incluye funciones que dependen del hardware. Su secuencia de versiones comienza en 1.0.0 y es distinta de las versiones del proyecto base [Brightcraft](https://github.com/brightcraft/moonlight-tizen). Las notas de las versiones públicas y los cambios conocidos están disponibles en la [página de versiones](https://github.com/fidoboy/moonlight-tizen-ac3/releases) y en el [historial de cambios](../CHANGELOG.md).

Al informar de un problema, incluye la versión exacta del proyecto, el modelo del televisor y su versión de Tizen, la versión/rama de Sunshine, los ajustes de vídeo, el backend de audio, los canales seleccionados y los registros relevantes.
