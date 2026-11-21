---
layout: docs-page
lang: es
title: "Resumen de funciones"
description: "Funciones de Moonlight Tizen, compatibilidad con audio Dolby y configuración."
---

# Resumen de funciones

Esta página describe el proyecto del cliente Moonlight para Tizen. La disponibilidad de las funciones depende del modelo de televisor, la versión de Tizen, la configuración del host, la red y los periféricos conectados.

## Función principal frente a otros clientes: audio Dolby por salida digital

La característica distintiva de este proyecto es la salida opcional de audio Dolby Digital y Dolby Digital Plus en televisores Samsung compatibles conectados a un receptor o sistema de sonido mediante la salida óptica (TOSLINK) o HDMI. A diferencia de versiones anteriores, no es necesario que el host proporcione un flujo de audio Dolby nativo.

- **AC-3 (Dolby Digital):** se puede enviar audio comprimido estéreo o de 5.1 canales al renderizador de audio EMSS nativo de Tizen cuando el formato está disponible y es compatible con el televisor y los dispositivos conectados.
- **E-AC-3 (Dolby Digital Plus):** está disponible cuando el firmware del televisor, la configuración de salida de audio y el equipo receptor admiten el formato. No se garantiza E-AC-3 por salida óptica en todos los televisores.
- **Compatibilidad Dolby en el host (recomendable):** si el host puede proporcionar AC-3 o E-AC-3 de forma nativa, Moonlight puede utilizar directamente ese flujo. Es muy recomendable porque evita la conversión de audio en tiempo real en el cliente del televisor y, por tanto, reduce la latencia adicional de procesamiento de audio, mejorando la respuesta a los controles y al sonido.
- **Conversión de OPUS a Dolby:** si el host no proporciona audio Dolby, puede seguir enviando OPUS. Moonlight para Tizen intentará convertir el audio OPUS recibido a Dolby Digital en tiempo real, siempre que lo permitan el modelo de televisor, las capacidades de audio de Tizen, los ajustes seleccionados y los dispositivos de sonido conectados. Esto amplía la compatibilidad con anfitriones GameStream y con distintas configuraciones de televisores y equipos de sonido, aunque la conversión por software puede añadir latencia.
- **Estéreo y sonido envolvente:** la distribución de canales y el formato Dolby disponibles dependen del flujo recibido, de la ruta de conversión y de las capacidades del televisor y del receptor. La salida AC-3 está limitada a 5.1 canales.

La ruta de audio Dolby se ha probado con televisores Samsung compatibles y equipos de sonido externos. Los resultados pueden variar según el modelo de televisor, la versión del firmware y el receptor. Consulta [Problemas conocidos y limitaciones](Known-Issues-and-Limitations-es.html#dolby-optical-audio).

## Estadísticas del flujo de audio

El panel de rendimiento puede mostrarse con **Ctrl+Alt+Shift+S** si hay un teclado conectado al televisor. También puedes pulsar **Play/Pause** o **Volver** en el mando del televisor para abrir el menú de la retransmisión y seleccionar la opción de estadísticas. El panel indica el códec de audio negociado, la distribución y el número de canales y una tasa de bits de audio medida aproximada, junto con el códec de vídeo y las estadísticas de transmisión existentes. La etiqueta del códec refleja la sesión activa, no solo la preferencia seleccionada.

## Otras mejoras específicas de este proyecto

- **Localización de la interfaz:** la interfaz está disponible en inglés, español, alemán, francés, italiano, ruso y portugués brasileño.
- **Menú de retransmisión accesible desde el mando:** abre el menú de retransmisión con **Play/Pause** o **Volver** en el mando del televisor para acceder a los controles y las estadísticas sin necesitar un teclado.
- **Panel de estadísticas en tiempo real mejorado:** incluye gráficos en directo de la latencia del host y de la calidad de conexión/caudal, que ayudan a identificar picos de latencia, recepción degradada, ancho de banda insuficiente y otros problemas de comunicación.
- **Accesos directos de inicio desde Smart Hub:** inicia directamente desde Smart Hub las aplicaciones configuradas en el host remoto, omitiendo la interfaz habitual de Moonlight, la comprobación de actualizaciones y la búsqueda de hosts.
- **Cerrar la aplicación del host al desconectar:** solicitud opcional de mejor esfuerzo para cerrar la aplicación del host en ejecución tras una desconexión normal. Los fallos inesperados de conexión no la activan.
- **Pantalla de inicio animada nativa:** añade una pantalla de bienvenida animada para los comportamientos de inicio compatibles con Tizen.
- **Mejoras en los ajustes de salida digital:** mejora el estado de los ajustes, las opciones de canales y la navegación con el mando cuando se habilita Dolby.
- **Inicio de la aplicación:** mejora la transición desde la pantalla nativa de inicio a la lista de hosts y evita una superposición de carga a pantalla completa innecesaria.
- **Mejoras de entrada e interfaz:** incluye mejoras en el manejo del teclado, el enfoque y la navegación por ajustes.

- **Temas y decoraciones de la interfaz (versión 1.2.4):** permite elegir entre distintos esquemas de color y decoraciones para la interfaz.
- **Protector de pantalla (versión 1.2.4):** se muestra mientras no se está recibiendo ninguna retransmisión.
- **Fondos de pantalla animados (versión 1.2.4):** incorpora opciones de fondos animados para la interfaz.
- **Mejoras en el manejo del audio (versión 1.2.4):** mejora el procesamiento y la conversión de los distintos formatos de audio admitidos.

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

Moonlight para Tizen es compatible con cualquier software de host que utilice el protocolo GameStream; no es necesario que el host proporcione audio Dolby Digital. Sin embargo, si desea utilizar Dolby Digital, es preferible que el host pueda proporcionar AC-3 o E-AC-3 de forma nativa. La salida Dolby nativa evita la conversión en tiempo real de OPUS a Dolby en el cliente del televisor, reduce la latencia adicional de procesamiento de audio y, por lo general, ofrece una experiencia más rápida y fluida. Si el host solo proporciona OPUS, Moonlight intentará convertirlo en tiempo real cuando el televisor y los dispositivos de sonido conectados lo permitan. Para instalarlo, empiece por la [Guía de inicio rápido](Quick-Start-Guide-es.html).
