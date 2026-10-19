---
layout: docs-page
lang: es
title: "Guía de actualización"
description: "Cómo actualizar Moonlight Tizen y pasar desde otras compilaciones."
---

# Guía de actualización

## Actualizar a una versión más reciente del proyecto

1. Abre la [página de versiones](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Descarga el `Moonlight.wgt` más reciente o `Moonlight-ForceGM.wgt` si utilizas específicamente esa variante.
3. Instálalo con el mismo método que usaste anteriormente (Apps2Samsung, Tizen Studio o la herramienta correspondiente al dispositivo).
4. Inicia Moonlight y comprueba que sigan presentes los ajustes guardados y los hosts emparejados.

Utiliza la misma variante del paquete y el mismo método de firma/instalación siempre que sea posible. Si el televisor rechaza la actualización por un conflicto de versión o certificado, consulta la [Guía de instalación](Installation-Guide-es.html).

## Pasar del paquete 1.18.x de Brightcraft a la serie 1.0.x de este proyecto

Este proyecto inicia una secuencia de versiones independiente en 1.0.0. Como ese número es inferior a la versión 1.18.x de la aplicación original, algunos televisores podrían no permitir instalarlo como actualización directa. En ese caso:

1. Anota los ajustes que necesitas restaurar.
2. Desinstala la aplicación anterior con el administrador de aplicaciones del televisor o con la herramienta que utilizaste para instalarla.
3. Instala el paquete de este proyecto y vuelve a emparejar/configurar los hosts si es necesario.

La desinstalación puede eliminar datos locales de la aplicación. Esta limitación se debe a que se inicia una secuencia de versiones distinta manteniendo la misma identidad de aplicación de Tizen; no significa que el WGT se haya compilado mal.

## Actualizar compilaciones experimentales

Los WGT experimentales de GitHub Actions son artefactos temporales de prueba. Descarga el artefacto desde la ejecución de flujo correspondiente, en lugar de usar una URL antigua almacenada en caché, y revisa el SHA del commit antes de instalarlo. No des por hecho que un artefacto experimental equivale a una versión estable etiquetada.
