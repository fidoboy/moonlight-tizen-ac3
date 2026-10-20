---
layout: docs-page
lang: undefined
title: "Guía de actualización"
description: "Cómo actualizar Moonlight Tizen en un Samsung Smart TV y elegir la variante de paquete correcta."
---

# Guía de actualización

## Actualizar a una versión más reciente del proyecto

1. Abre la [página de versiones](https://github.com/fidoboy/moonlight-tizen-ac3/releases).

2. Descarga el último **Moonlight.wgt**, o **Moonlight-ForceGM.wgt** si utilizas específicamente esa variante.

3. Instálalo con el mismo método que utilizaste anteriormente (Apps2Samsung, Tizen Studio o la herramienta correspondiente para el dispositivo).

4. Inicia Moonlight y comprueba que tus ajustes guardados y los hosts emparejados sigan presentes.

Siempre que sea posible, utiliza la misma variante del paquete y el mismo método de firma e instalación. Si el televisor rechaza la actualización por un conflicto de versión o certificado, consulta la [Guía de instalación](Installation-Guide-es.html).

## Pasar del paquete Brightcraft 1.18.x a la serie 1.0.x de este proyecto

Este proyecto inicia una serie de versiones independiente en 1.0.0. Como ese número es inferior a la versión 1.18.x del paquete original, algunos televisores podrían no permitir la instalación como actualización directa. En ese caso:

1. Anota los ajustes que necesitas restaurar.

2. Desinstala la aplicación antigua desde el administrador de aplicaciones del televisor o mediante la herramienta que usaste para instalarla.

3. Instala el nuevo paquete de este proyecto y vuelve a emparejar o configurar los hosts si es necesario.

La desinstalación puede borrar los datos locales de la aplicación. Esta limitación se debe al inicio de una serie de versiones independiente con la misma identidad de aplicación de Tizen; no significa que el WGT se haya compilado incorrectamente.

## Actualizar compilaciones experimentales

Los WGT experimentales de GitHub Actions son artefactos temporales de prueba. Descarga el artefacto desde la ejecución de workflow correspondiente, no desde una URL antigua almacenada en caché, y comprueba el SHA del commit antes de instalarlo. No des por hecho que un artefacto experimental equivale a una versión estable etiquetada.
