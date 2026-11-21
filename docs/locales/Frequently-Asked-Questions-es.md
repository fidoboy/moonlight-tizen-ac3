---
layout: docs-page
lang: es
title: "Preguntas frecuentes"
description: "Respuestas sobre compatibilidad, audio Dolby y configuración de Moonlight Tizen."
---

# Preguntas frecuentes


## ¿Cómo actualizo la aplicación cuando hay una nueva versión disponible?

La propia aplicación del televisor le avisará cuando haya una nueva versión disponible. Si ha utilizado el método de instalación recomendado, mediante Apps2Samsung, solo tiene que volver a abrir Apps2Samsung y seleccionar **Moonlight** con la variante **fidoboy · Enhanced · Dolby** para descargar la última versión. Si prefiere instalarla manualmente, descargue el nuevo paquete WGT desde la [página de la última versión](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) e instálelo en el televisor.

## ¿Cómo puedo conseguir una mejor calidad de imagen o configurar Moonlight para obtener una retransmisión más estable?

Lo recomendable es mantener activada la optimización automática del bitrate durante las primeras conexiones. Después de cada nueva conexión, Moonlight vuelve a calcular el bitrate recomendado teniendo en cuenta los ajustes y las características negociadas que afectan al consumo de ancho de banda, para determinar un valor equilibrado para su configuración. Cuando ese valor deje de variar porque la configuración del host y de Moonlight se mantiene igual, puede utilizarlo como punto de partida para realizar ajustes manuales: desactive la optimización automática y aumente progresivamente el bitrate para intentar mejorar la calidad de imagen, a costa de utilizar más ancho de banda de la red, o redúzcalo ligeramente si las condiciones de la red son menos favorables, a costa de sacrificar algo de calidad de imagen. Hasta dónde puede ajustarlo dependerá de las capacidades del hardware en todos los extremos de la retransmisión, así como del ancho de banda disponible. A partir de cierto punto, aumentar el bitrate puede dejar de producir una mejora perceptible en la calidad de imagen, incluso aunque la red pueda transportarlo.

## ¿Funciona este proyecto con Sunshine u otros hosts compatibles con GameStream?

Sí. Este cliente de Moonlight debería funcionar correctamente tanto con el antiguo [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update) como con software de host moderno compatible, como [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) o cualquier otro servidor que utilice el mismo protocolo. Se recomienda utilizar Vibeshine porque ofrece funciones avanzadas y compatibilidad nativa con audio Dolby Digital. Si Dolby Digital está activado en los ajustes de Moonlight, pero el host no ofrece compatibilidad nativa con Dolby Digital, Moonlight intentará proporcionarlo mediante codificación por software cuando sea posible; en caso contrario, aplicará una estrategia de mejor esfuerzo. Si no es posible utilizar Dolby Digital durante una retransmisión, Moonlight mantendrá la compatibilidad con versiones anteriores y recurrirá al audio OPUS estándar.

## ¿Cómo consigo Dolby Digital 5.1 por las salidas óptica o HDMI del televisor?

Para utilizar Dolby Digital a través de las salidas de audio del televisor, necesita lo siguiente:

- Este proyecto con **Enable Dolby Digital** activado.
- Un dispositivo de audio externo conectado al televisor si desea utilizarlo, especialmente para disfrutar de sonido envolvente 5.1.
- Un televisor capaz de transmitir el audio a través de su salida óptica o de una conexión HDMI ARC/eARC. El resultado puede variar según el modelo del televisor y la versión de Tizen que utilice.
- Un receptor o sistema de sonido externo capaz de decodificar Dolby Digital (AC-3) o Dolby Digital Plus (E-AC-3), si el televisor envía el audio en alguno de esos formatos.

No es necesario que el host proporcione un flujo de audio Dolby Digital de forma nativa. Moonlight puede proporcionar Dolby Digital mediante su propio procesamiento de audio, por lo que el resultado dependerá principalmente de las capacidades y los ajustes de audio del televisor. Se admiten tanto las conexiones ópticas como HDMI ARC/eARC.

Para la configuración inicial, seleccione 5.1 y compruebe la línea **Audio stream** de la superposición de estadísticas. Puede dejar las estadísticas activadas desde el apartado **Ajustes avanzados** de Moonlight o mostrarlas manualmente durante la retransmisión: abra el menú de la retransmisión con **Play/Pause** en el mando del televisor o manteniendo pulsado el botón **Select** del gamepad y, a continuación, seleccione la opción de estadísticas. Si hay un teclado conectado al televisor, puede mostrar u ocultar las estadísticas directamente con **Ctrl+Alt+Shift+S**.

## ¿Activar Dolby Digital fuerza Dolby en todos los hosts?

No. La opción solicita el códec opcional durante la negociación. Si Dolby no está disponible o el host no lo selecciona, Moonlight utiliza OPUS. La forma fiable de comprobar qué recibe la sesión es consultar el códec activo en la superposición de estadísticas.

## ¿Dolby Digital Plus funciona siempre por TOSLINK?

No. La compatibilidad con E-AC-3 depende del televisor Samsung concreto, su firmware, el modo de salida de sonido y el equipo receptor. Algunas salidas ópticas solo admiten un subconjunto de formatos de flujo de bits. Utilice AC-3 si el equipo no acepta E-AC-3.

## ¿El passthrough Dolby puede transportar audio 7.1?

La implementación actual está limitada a estéreo y 5.1 canales. E-AC-3 admite teóricamente 7.1, pero la ruta del codificador de FFmpeg utilizada en esta versión todavía no ofrece esa opción. Si FFmpeg incorpora compatibilidad en el futuro, quizá sea posible seleccionar 7.1 para E-AC-3. AC-3 sigue limitado a 5.1. La transmisión OPUS estándar puede ofrecer otras distribuciones de canales si el host y el cliente las admiten.

## ¿Cómo veo el códec de audio activo?

Si hay un teclado conectado al televisor, pulse **Ctrl+Alt+Shift+S** para mostrar u ocultar la superposición de estadísticas. También puede pulsar el botón **Play/Pause** o **Volver** del mando del televisor para abrir el menú de la retransmisión y elegir la opción para mostrar las estadísticas. La línea de audio indica el códec negociado, la distribución, el número de canales y la tasa de bits aproximada.

## ¿Qué diferencia hay entre Moonlight.wgt y Moonlight-ForceGM.wgt?

`Moonlight.wgt` es el paquete estándar. `Moonlight-ForceGM.wgt` incluye metadatos adicionales de Game Mode para los casos en los que resulta útil esa variante. No puede superar la falta de compatibilidad con Game Mode de la plataforma.

## ¿Dónde encuentro información del televisor y de la aplicación?

En la aplicación, abra Settings y después About/System Information. Al diagnosticar un problema, anote el modelo del televisor, la versión de Tizen, la versión del cliente y del host, y los ajustes de vídeo/audio seleccionados.

## ¿Qué mandos puedo usar?

La compatibilidad del mando depende del modelo del televisor, de la versión de Tizen y de cómo esté conectado. Lo recomendable es empezar con un mando Bluetooth o USB que el propio televisor reconozca. Si un mando no funciona en Moonlight, compruebe primero que el televisor lo detecte y consulte la [Guía de solución de problemas](../Troubleshooting-Guide.html).
