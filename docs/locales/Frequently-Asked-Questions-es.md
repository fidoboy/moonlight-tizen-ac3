---
layout: docs-page
lang: es
title: "Preguntas frecuentes"
description: "Respuestas sobre compatibilidad, audio Dolby y configuración de Moonlight Tizen."
---

# Preguntas frecuentes

## ¿Funciona este proyecto con instalaciones normales de Sunshine?

Sí. La extensión Dolby es opcional. Si el host no anuncia ni selecciona AC-3/E-AC-3, el cliente conserva la ruta OPUS habitual. No hace falta modificar el host para una transmisión que solo utilice OPUS.

## ¿Cómo consigo Dolby Digital 5.1 por salida óptica?

Necesitas todo lo siguiente:

- Este proyecto con **Enable Dolby Digital** activado.
- Una compilación compatible de Sunshine con la implementación `ac3-audio` y un codificador Dolby disponible.
- Un televisor capaz de transmitir el flujo Dolby seleccionado por su conexión óptica.
- Los ajustes de sonido del televisor configurados en un modo de passthrough/flujo de bits compatible.
- Un receptor o sistema de sonido que admita AC-3 y la distribución de canales enviada.

Para la configuración inicial, selecciona 5.1 y comprueba la línea **Audio stream** de la superposición de estadísticas (`Ctrl+Alt+Shift+S`).

## ¿Activar Dolby Digital fuerza Dolby en todos los hosts?

No. La opción solicita el códec opcional durante la negociación. Si Dolby no está disponible o el host no lo selecciona, Moonlight utiliza OPUS. La forma fiable de comprobar qué recibe la sesión es consultar el códec activo en la superposición de estadísticas.

## ¿Dolby Digital Plus funciona siempre por TOSLINK?

No. La compatibilidad con E-AC-3 depende del televisor Samsung concreto, su firmware, el modo de salida de sonido y el equipo receptor. Algunas salidas ópticas solo admiten un subconjunto de formatos de flujo de bits. Usa AC-3 si el equipo no acepta E-AC-3.

## ¿El passthrough Dolby puede transportar audio 7.1?

La ruta actual del codificador experimental de Sunshine está pensada para estéreo o 5.1. El propio AC-3 está limitado a 5.1. La transmisión OPUS normal puede ofrecer otras distribuciones de canales cuando las admiten el host y el cliente.

## ¿Cómo veo el códec de audio activo?

Durante la transmisión, pulsa **Ctrl+Alt+Shift+S** para mostrar u ocultar la superposición de estadísticas. La línea de audio indica el códec negociado, la distribución, el número de canales y la tasa de bits aproximada.

## ¿Qué diferencia hay entre Moonlight.wgt y Moonlight-ForceGM.wgt?

`Moonlight.wgt` es el paquete estándar. `Moonlight-ForceGM.wgt` incluye metadatos adicionales de Game Mode para los casos en los que resulta útil esa variante. No puede superar la falta de compatibilidad con Game Mode de la plataforma.

## ¿Dónde encuentro información del televisor y de la aplicación?

En la aplicación, abre Settings y después About/System Information. Al diagnosticar un problema, anota el modelo del televisor, la versión de Tizen, la versión del cliente y del host, y los ajustes de vídeo/audio seleccionados.

## ¿Qué mandos puedo usar?

La compatibilidad del mando depende del modelo del televisor, de la versión de Tizen y de cómo esté conectado. Lo recomendable es empezar con un mando Bluetooth o USB que el propio televisor reconozca. Si un mando no funciona en Moonlight, comprueba primero que el televisor lo detecte y consulta la [Guía de solución de problemas](../Troubleshooting-Guide.html).
