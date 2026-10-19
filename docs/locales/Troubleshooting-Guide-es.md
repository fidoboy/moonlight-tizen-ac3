---
layout: docs-page
lang: es
title: "Guía de solución de problemas"
description: "Solución de problemas habituales de conexión, audio y transmisión en Moonlight Tizen."
---

# Guía de solución de problemas

## Moonlight no encuentra el host

1. Comprueba que Sunshine esté ejecutándose y que el televisor y el PC estén accesibles en la misma red.
2. Revisa el cortafuegos del host y los ajustes de aislamiento del router.
3. Prueba **Añadir host** con la dirección IPv4, IPv6 o el nombre DNS del PC.
4. Si el host utiliza puertos personalizados, confirma que estén configurados de forma coherente.
5. Si la detección funciona de forma intermitente, prueba a conectar el televisor mediante una conexión Wi-Fi de 5 GHz fiable o Ethernet.

## Falla el emparejamiento

- Comprueba que el PIN se introduzca en la interfaz web de Sunshine del host correcto.
- Elimina las entradas de emparejamiento antiguas solo si después puedes volver a emparejar el cliente.
- Verifica la hora del sistema y que el cortafuegos no bloquee la comunicación entre el televisor y el PC.

## La transmisión empieza, pero el vídeo se congela, se queda en negro o pierde fotogramas

- Empieza con una resolución menor, 60 FPS y una tasa de bits moderada.
- Comprueba que tanto el televisor como la GPU del host sean compatibles con el códec de vídeo seleccionado.
- Actualiza los controladores de la GPU y Sunshine si el problema también ocurre con otros clientes.
- Si Ethernet por cable es inestable con tasas de bits altas, prueba otra conexión de red. Algunos televisores tienen puertos Fast Ethernet aunque el host esté conectado a Gigabit Ethernet.

## No hay audio o la distribución de canales es incorrecta

- Comprueba la salida de audio del televisor, la entrada del receptor, el volumen y el silencio.
- Prueba primero la ruta OPUS predeterminada. Si funciona, activa la salida óptica solo al probar Dolby.
- Empieza con estéreo y pasa a 5.1 cuando hayas confirmado que toda la cadena de televisor y receptor lo admite.
- Recuerda que la implementación actual del host Dolby admite estéreo y 5.1. No selecciones 7.1 para la ruta del codificador Dolby.

## Las estadísticas muestran OPUS en lugar de AC-3 o E-AC-3

1. Confirma que **Enable Dolby Digital** esté activado en Moonlight.
2. Comprueba que el host utilice la [rama experimental ac3-audio de Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondiente y se haya compilado con el codificador Dolby opcional de FFmpeg disponible.
3. Inicia una nueva transmisión después de cambiar los ajustes de audio del host.
4. Verifica que el registro del host indique el códec y la tasa de bits AC-3 o E-AC-3 esperados.
5. Si Sunshine no ofrece Dolby o no lo selecciona, OPUS es la alternativa de compatibilidad esperada.

Que la opción esté activada no garantiza que se haya negociado un flujo Dolby. La línea de estadísticas de audio refleja el formato activo durante la sesión.
