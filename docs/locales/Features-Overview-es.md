---
layout: docs-page
lang: es
title: "Resumen de funciones"
description: "Funciones de Moonlight Tizen, compatibilidad con audio Dolby y configuración."
---

# Resumen de funciones

Esta página describe el proyecto del cliente Moonlight para Tizen. La disponibilidad de las funciones depende del modelo de televisor, la versión de Tizen, la configuración del host, la red y los periféricos conectados.

## Función principal frente a otros clientes: audio Dolby por salida óptica

La característica distintiva de este proyecto es el passthrough opcional de audio Dolby Digital y Dolby Digital Plus para televisores Samsung compatibles conectados a un receptor o sistema de sonido mediante una conexión óptica (TOSLINK).

- **AC-3 (Dolby Digital):** se puede enviar audio comprimido estéreo o de 5.1 canales al renderizador de audio EMSS nativo de Tizen cuando el host negocia AC-3 correctamente.
- **E-AC-3 (Dolby Digital Plus):** está disponible cuando el host, el firmware del televisor, la configuración de salida de audio y el equipo receptor admiten el formato. No se garantiza E-AC-3 por salida óptica en todos los televisores.
- **Estéreo y 5.1:** el codificador experimental de Sunshine compatible con esta versión admite estéreo y 5.1. AC-3 está limitado a 5.1. La selección de 7.1 sigue disponible mediante la ruta de audio normal cuando es compatible, pero no forma parte de la ruta actual del codificador Dolby.
- **Negociación opcional:** activa la opción **Enable Dolby Digital** para solicitar la ruta Dolby. El audio Dolby solo se utiliza cuando el host anuncia y selecciona un formato compatible.
- **Compatibilidad con OPUS:** si un host solo envía OPUS, no anuncia la extensión Dolby opcional o no selecciona un formato Dolby, el cliente continúa usando la ruta OPUS habitual. Los hosts que solo admiten OPUS no necesitan cambios.
- **Host compatible:** el passthrough Dolby requiere actualmente la rama experimental correspondiente de [fidoboy/Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio). La ruta de audio normal del cliente sigue disponible si esa funcionalidad no está presente en el host.

La ruta de audio óptica se ha probado de extremo a extremo con una compilación experimental de Sunshine, un televisor Samsung y un sistema de sonido compatible conectado por óptico. Los resultados pueden variar según el modelo, el firmware y el receptor. Consulta [Problemas conocidos y limitaciones](../Known-Issues-and-Limitations.html#dolby-optical-audio).

## Estadísticas del flujo de audio

El panel de rendimiento, que se muestra u oculta con **Ctrl+Alt+Shift+S**, indica el códec de audio negociado, la distribución y el número de canales y una tasa de bits de audio medida aproximada, junto con el códec de vídeo y las estadísticas de transmisión existentes. La etiqueta del códec refleja la sesión activa, no solo la preferencia seleccionada.

## Otras mejoras específicas de este proyecto

- **Localización al español:** incluye una traducción de interfaz `es-ES` junto con los demás idiomas disponibles.
- **Cerrar la aplicación del host al desconectar:** solicitud opcional de mejor esfuerzo para cerrar la aplicación del host en ejecución tras una desconexión normal. Los fallos inesperados de conexión no la activan.
- **Pantalla de inicio animada nativa:** añade una pantalla de bienvenida animada para los comportamientos de inicio compatibles con Tizen.
- **Ajustes de salida óptica:** mejora el estado de los ajustes, las opciones de canales y la navegación con el mando cuando se habilita Dolby.
- **Inicio de la aplicación:** mejora la transición desde la pantalla nativa de inicio a la lista de hosts y evita una superposición de carga a pantalla completa innecesaria.
- **Mejoras de entrada e interfaz:** incluye mejoras en el manejo del teclado, el enfoque y la navegación por ajustes.

## Funciones principales heredadas del proyecto comunitario Moonlight Tizen

- Transmite juegos, aplicaciones y todo el escritorio desde instalaciones compatibles con NVIDIA GameStream o Sunshine.
- Compatible con televisores Samsung que ejecuten versiones de Tizen admitidas (5.5 y posteriores).
- Decodificación de vídeo H.264, HEVC y AV1 cuando lo admiten el televisor y la GPU del host.
- Transmisión HDR y configuración de resolución, frecuencia de imagen, tasa de bits y rango de color dentro de los límites del hardware.
- Descubrimiento y emparejamiento automáticos del host, con IPv4, IPv6, nombres DNS y puertos personalizados opcionales.
- Wake-on-LAN, estado de host conectado/desconectado, ordenación de aplicaciones y administración de hosts.
- Entrada de teclado, ratón y mando, incluidos varios mandos, navegación con mando y emulación opcional del ratón.
- Reproducción de audio mediante EMSS y Web Audio, con ajustes que dependen del backend seleccionado.
- Compatibilidad con Smart Hub Preview cuando lo admite la versión de Tizen.
- Estadísticas de transmisión, avisos de conexión y opciones relacionadas con la latencia, como Game Mode, cuando es compatible.

## Nota sobre compatibilidad

Dolby es una extensión opcional y no sustituye al protocolo general de transmisión OPUS. El host Sunshine correspondiente también debe compilarse con el codificador Dolby disponible y estar configurado para seleccionar AC-3 o E-AC-3. Para instalarlo, empieza por la [Guía de inicio rápido](Quick-Start-Guide-es.html).
