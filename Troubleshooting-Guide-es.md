---
layout: docs-page
lang: es
title: "Guía de solución de problemas"
description: "Soluciones a problemas habituales de conexión, audio y transmisión en Moonlight Tizen."
---

# Guía de solución de problemas

## Moonlight no encuentra el host

1. Comprueba que Sunshine esté en ejecución y que el televisor y el PC sean accesibles en la misma red.
2. Comprueba el cortafuegos del host y los ajustes de aislamiento del router.
3. Prueba Add Host con la dirección IPv4, la dirección IPv6 o el nombre DNS del PC.
4. Si el host utiliza puertos personalizados, confirma que estén configurados de la misma manera en ambos lados.
5. Si el descubrimiento falla de forma intermitente, prueba a conectar el televisor por una red Wi-Fi de 5 GHz fiable o por Ethernet.

## Falla el emparejamiento

- Asegúrate de introducir el PIN en la interfaz web de Sunshine del host correcto.
- Elimina las entradas de emparejamiento antiguas solo si después puedes emparejar el cliente de nuevo.
- Comprueba la hora del sistema y que no haya una regla del cortafuegos que impida la comunicación entre el televisor y el PC.

## La transmisión empieza, pero el vídeo se congela, queda negro o pierde fotogramas

- Empieza con una resolución más baja, 60 FPS y una tasa de bits conservadora.
- Comprueba que el códec de vídeo seleccionado sea compatible tanto con el televisor como con la GPU del host.
- Actualiza los controladores de la GPU y Sunshine si el problema también ocurre con otros clientes.
- Si Ethernet por cable es inestable con tasas de bits altas, prueba otra conexión de red. Algunos televisores tienen puertos Fast Ethernet aunque el host esté conectado a Gigabit Ethernet.

## No hay audio o la distribución de canales es incorrecta

- Comprueba la salida de audio del televisor, la entrada del receptor, el volumen y el silencio.
- Prueba primero la ruta OPUS predeterminada. Si funciona, activa la salida óptica solo para probar Dolby.
- Empieza en estéreo y pasa a 5.1 tras confirmar que la cadena de televisor y receptor es compatible.
- Recuerda que la implementación Dolby actual en el host admite estéreo y 5.1. No selecciones 7.1 para la ruta del codificador Dolby.

## Las estadísticas muestran OPUS en vez de AC-3 o E-AC-3

1. Comprueba que **Enable Dolby Digital** esté activado en Moonlight.
2. Confirma que el host utilice la rama experimental [Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondiente y esté compilado con el codificador Dolby opcional de FFmpeg disponible.
3. Inicia una nueva transmisión después de cambiar los ajustes de audio del host.
4. Comprueba que el registro del host indique el códec AC-3 o E-AC-3 esperado y su tasa de bits.
5. Si Sunshine no ofrece Dolby o no lo selecciona, OPUS es la alternativa de compatibilidad esperada.

Tener activado el ajuste no demuestra que se haya negociado una transmisión Dolby. La línea de estadísticas de audio refleja la sesión activa.

## No funciona el mando o la entrada del mando a distancia

- Comprueba que el televisor reconozca el mando en sus propios ajustes.
- Vuelve a conectar el mando antes de iniciar Moonlight.
- Prueba la navegación básica con el mando en la lista de hosts y los ajustes antes de iniciar una transmisión.
- Si el problema de entrada solo ocurre en un juego, compáralo con otra aplicación para aislar posibles asignaciones específicas del juego.

## Recopilar información de diagnóstico útil

Anota la versión del proyecto Moonlight, el modelo y la versión de Tizen del televisor, la versión y rama de Sunshine, el códec y la distribución de canales que indican las estadísticas, los ajustes de resolución/FPS/tasa de bits y si el problema también aparece usando OPUS. No publiques direcciones IP públicas, PIN, claves privadas ni otros datos secretos.
