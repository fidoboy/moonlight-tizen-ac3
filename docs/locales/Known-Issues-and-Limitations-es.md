---
layout: docs-page
lang: undefined
title: "Problemas conocidos y limitaciones"
description: "Problemas de compatibilidad y limitaciones técnicas conocidas de Moonlight Tizen con soporte de audio Dolby."
---

# Problemas conocidos y limitaciones

## Audio Dolby por salida óptica

- El passthrough Dolby es una extensión opcional y requiere la implementación experimental correspondiente de Sunshine. Los hosts estándar que envían OPUS siguen siendo compatibles, pero continuarán utilizando OPUS.

- AC-3 está limitado a 5.1 canales. El codificador experimental correspondiente admite actualmente estéreo y 5.1, no 7.1.

- La transmisión de E-AC-3 por la salida óptica depende del modelo de televisor, el firmware, la configuración de salida y el receptor. No debe suponerse que todos los televisores pueden enviar E-AC-3 por TOSLINK.

- La cadena de audio nativa del televisor debe aceptar el formato comprimido. Si rechaza la inicialización de la pista, no se podrá reproducir audio Dolby por esa ruta.

- Esta función se ha probado con un televisor Samsung y una cadena de audio concretos; no se ha establecido la compatibilidad con todas las combinaciones de televisor y receptor.

- La tasa de bits de audio que muestra la superposición es una velocidad de recepción medida aproximada, no un campo de negociación del códec ni un objetivo garantizado del codificador.

## Limitaciones de Tizen y del televisor

- El cliente está dirigido a televisores Samsung compatibles con Tizen 5.5 o posterior, pero las capacidades varían según el modelo y el firmware.

- El sistema operativo o las capacidades del televisor pueden restringir Game Mode y las opciones de alta frecuencia de actualización aunque aparezcan disponibles en los ajustes.

- Algunos televisores tienen un puerto Ethernet de 100 Mbps. Con resoluciones o tasas de bits altas, las ráfagas de fotogramas pueden provocar pérdida de paquetes por Ethernet. Probar una conexión Wi-Fi fiable de 5 GHz puede ayudar a distinguir un problema de red de uno del host.

- La resolución de vídeo, la frecuencia de imagen, HDR, AV1 y las tasas de bits altas dependen del decodificador del televisor y del codificador de la GPU del host. Las combinaciones no compatibles pueden recurrir a otra opción o no iniciar.

## Estado del proyecto independiente y de sus versiones

Este proyecto se mantiene de forma independiente e incluye funciones cuyo comportamiento depende del hardware. Su serie de versiones comienza en 1.0.0 y es independiente de las versiones del [proyecto base de Brightcraft](https://github.com/brightcraft/moonlight-tizen). Las notas de publicación y los cambios conocidos están disponibles en la [página de versiones](https://github.com/fidoboy/moonlight-tizen-ac3/releases) y en el [registro de cambios](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Al informar de un problema, incluye la versión exacta del proyecto, el modelo de televisor y la versión de Tizen, la versión y rama de Sunshine, los ajustes de vídeo, el backend de audio, la selección de canales y los registros relevantes.
