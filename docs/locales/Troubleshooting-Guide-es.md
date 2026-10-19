---
layout: docs-page
lang: es
title: "Guía de solución de problemas"
description: "Solución de problemas habituales de conexión, audio y transmisión en Moonlight Tizen."
---

# Guía de solución de problemas

## Apps2Samsung no muestra el televisor en la lista

1. Comprueba que el **Developer Mode (modo de desarrollador)** esté activado en el televisor Samsung. Pulsa **Home**, abre **Apps** y entra en **App Settings** (normalmente, el icono de engranaje). En algunos modelos antiguos, puedes introducir el código con la pantalla de Apps abierta.
2. Introduce **12345** con las teclas numéricas del mando. Si tu Smart Remote no tiene teclas numéricas, abre el teclado en pantalla con el botón **123** e introduce los dígitos ahí. Cuando aparezca el diálogo **Developer Mode**, actívalo (**On**).
3. En **Host PC IP**, introduce la dirección IPv4 local del ordenador donde se ejecuta Apps2Samsung. Debe coincidir exactamente con la dirección actual de ese ordenador. Utiliza la IPv4 del adaptador Wi-Fi o Ethernet activo; no la IP del televisor, la puerta de enlace del router, `127.0.0.1` ni la dirección pública de Internet. Guarda el ajuste y reinicia el televisor.
4. Comprueba que el televisor y el ordenador estén en la misma red local y vuelve a buscar el televisor en Apps2Samsung. Una red Wi-Fi de invitados o el aislamiento de clientes del router pueden impedir la comunicación.

Consulta la [Guía de instalación](Installation-Guide-es.html) y la [guía oficial de Samsung para dispositivos TV](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) para obtener más detalles.

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

## Recopilar información útil para el diagnóstico

Anota la versión del proyecto Moonlight, el modelo del televisor y la versión de Tizen, la versión y rama de Sunshine, el códec y la distribución de canales que muestran las estadísticas, los ajustes de resolución/FPS/tasa de bits y si el problema también ocurre con OPUS. Después, [abre una incidencia en GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues) e incluye la información relevante. No publiques direcciones IP públicas, PIN, claves privadas ni otros datos secretos.
