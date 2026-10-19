---
layout: docs-page
lang: es
title: "Guía de instalación"
description: "Métodos para instalar Moonlight Tizen en televisores Samsung Smart TV."
---

# Guía de instalación

El cliente se distribuye como un widget de Tizen firmado (`.wgt`). Elige el método de instalación que encaje con tu televisor, ordenador y herramientas de desarrollo de Samsung instaladas.

## Método A: instalar con Apps2Samsung

### Antes de empezar

- Descarga y ejecuta la versión de [Apps2Samsung](https://apps2samsung.com/#download) para tu ordenador.
- Conecta el televisor y el ordenador a la **misma red local**. Pueden usar Wi-Fi o Ethernet, siempre que puedan comunicarse entre sí.

### 1. Averigua la dirección IP local del ordenador

El televisor necesita la dirección IP del ordenador que ejecutará Apps2Samsung. En Windows:

1. Pulsa **Win + R**, escribe `cmd` y pulsa Intro.
2. En el símbolo del sistema, ejecuta:

       ipconfig

3. En el adaptador de red que estés utilizando (Wi-Fi o Ethernet), anota **Dirección IPv4**, por ejemplo `192.168.1.37`.

Utiliza la dirección IPv4 del ordenador, **no** la puerta de enlace predeterminada, la dirección IP del televisor, `127.0.0.1` ni la dirección pública de Internet. En macOS, consulta la dirección del adaptador activo en **Ajustes del Sistema → Red**; en Linux, ejecuta `ip addr` y busca la dirección `inet` de la interfaz de red activa. Ten esta dirección a mano para el siguiente paso.

### 2. Abre en el televisor los ajustes ocultos del modo de desarrollador

1. Enciende el televisor y pulsa **Home** (o **Smart Hub**) en el mando.
2. Abre **Apps**.
3. En interfaces de TV recientes, ve a **App Settings** (normalmente un icono de engranaje en la parte inferior de la pantalla Apps) y ábrelo. En algunos modelos antiguos, puedes introducir el código con la pantalla Apps abierta.
4. Con Apps/App Settings en pantalla, introduce esta secuencia exacta:

   **1 → 2 → 3 → 4 → 5**

   **Cómo introducir los números**

   - **Mando con teclado numérico físico:** pulsa las cinco teclas numéricas 1, 2, 3, 4 y 5 en ese orden.
   - **Samsung Smart Remote sin teclas numéricas:** pulsa el botón marcado **123** (en algunos mandos aparece como **123/Color** o con un símbolo **…**) para mostrar el teclado numérico en pantalla. Usa el aro direccional para resaltar cada dígito y pulsa el botón central **OK/Select** para introducirlo. Repite hasta introducir 12345.

   El diagrama siguiente muestra los dos métodos. No necesitas cinco teclas numéricas físicas si tu mando utiliza el teclado en pantalla.

   ![Introducir el código del modo de desarrollador con un mando estándar o un Samsung Smart Remote](assets/developer-mode-number-pad.svg)

5. Debería aparecer un diálogo **Developer Mode**. Cambia **Developer Mode** a **On**.
6. En **Host PC IP** (o un campo con nombre parecido), introduce la dirección IPv4 del ordenador del paso 1.
7. Selecciona **OK** y acepta el reinicio del televisor.

> [!IMPORTANT]
> Este procedimiento es para **televisores Samsung Smart TV con Tizen**. Otros fabricantes también utilizan plataformas de TV basadas en Tizen, pero sus menús y la compatibilidad con la instalación en modo desarrollador pueden variar.

> [!TIP]
> Tras reiniciar, vuelve a **Apps**. En muchos televisores Samsung aparece un indicador **Develop Mode** cerca de la parte superior de la pantalla. Confirma que el modo de desarrollador está activado. Para ver capturas específicas del modelo, consulta la [guía oficial de dispositivos de TV de Samsung](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html); las [preguntas frecuentes de Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv) también explican cómo introducir el código con un Smart Remote.

### 3. Instala Moonlight desde el catálogo de Apps2Samsung

1. Abre Apps2Samsung en el ordenador.
2. Selecciona el televisor cuando aparezca en los resultados de búsqueda. Si no se detecta automáticamente, introduce manualmente su dirección IP si está disponible esa opción.
3. Abre el catálogo de aplicaciones y busca **Moonlight**.
4. Selecciona **Moonlight** y elige la variante **fidoboy · Enhanced · Dolby** o, si tu modelo de televisor lo requiere, **fidoboy · Enhanced · Dolby · ForceGM**.
5. Inicia la instalación con **Download & Install** y espera a que Apps2Samsung confirme que ha terminado correctamente. Apps2Samsung descarga y prepara el paquete por sí mismo.
6. Abre la pantalla **Apps** del televisor e inicia Moonlight.

**Este es el método recomendado.** No necesitas visitar GitHub Releases ni descargar manualmente `Moonlight.wgt`. La primera vez, Apps2Samsung puede pedirte que inicies sesión en tu cuenta Samsung para crear un certificado de firma. Sigue las indicaciones y deja la selección de certificado en la opción automática/predeterminada, salvo que la herramienta indique que hace falta otro tipo. No necesitas configurar certificados manualmente en Seller Office.

> [!WARNING]
> **Instala el WGT manualmente solo si falla el método del catálogo.** Descarga `Moonlight.wgt` desde la [última versión estable](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest). En Apps2Samsung, elige **Custom WGT / TPK**, selecciona el archivo descargado e inicia la instalación. No recurras a esta alternativa salvo que sea necesario. Si necesitas específicamente la variante ForceGM, descarga `Moonlight-ForceGM.wgt` desde la misma página de versiones.

### Solución de problemas

- **No aparece el diálogo Developer Mode:** asegúrate de estar en la pantalla Apps o en App Settings si tu modelo dispone de ese panel. Introduce `12345` ahí, no en el menú normal de ajustes del televisor. En un Smart Remote, abre primero el teclado numérico en pantalla con el botón **123** (o la tecla virtual equivalente).
- **Apps2Samsung no encuentra el televisor o no puede conectarse:** confirma que Developer Mode sigue activado, que ambos dispositivos están en la misma red local y que Host PC IP en el televisor coincide exactamente con la dirección IPv4 actual del ordenador. Las redes Wi-Fi de invitados o el aislamiento de clientes del router pueden impedir la comunicación.
- **Sigue sin conectarse tras reiniciar:** desenchufa completamente el televisor, espera entre 10 y 15 segundos, vuelve a conectarlo e inténtalo de nuevo. Puede ayudar en modelos en los que la conexión de desarrollo no se haya abierto correctamente.
- **La instalación falla por incompatibilidad de firma/certificado:** sigue el mensaje de Apps2Samsung. Si estás pasando de la aplicación base de Brightcraft, consulta abajo [Cambiar desde la aplicación base de Brightcraft](#cambiar-desde-la-aplicación-base-de-brightcraft) antes de desinstalar nada.

## Método B: Tizen Studio

Tizen Studio es el entorno oficial de desarrollo de Samsung/Tizen y resulta útil para desarrolladores y para diagnósticos más avanzados.

1. Instala Tizen Studio y las herramientas de TV adecuadas para la versión de Tizen de destino.
2. Activa Developer Mode en el televisor y anota su dirección IP.
3. En Device Manager, conecta con el televisor.
4. Configura un perfil de certificado aceptado por el televisor y firma el WGT según requiera Tizen Studio.
5. Instala el paquete con las herramientas de empaquetado/despliegue de Tizen o desde el IDE.

Consulta la documentación actual de Samsung para instalar Tizen Studio y configurar certificados de TV, ya que el procedimiento varía según el SDK y el sistema operativo.

## Compilar el paquete

La [Guía de desarrollo](Development-Guide-es.md) explica cómo compilar el WGT mediante el Dockerfile incluido. Las compilaciones con Docker son útiles para probar una revisión exacta del código fuente o las dos variantes del paquete.

## Cambiar desde la aplicación base de Brightcraft

La serie de versiones independiente comienza en 1.0.0, mientras que la aplicación base utilizaba una versión superior, 1.18.x. Por ello, Tizen puede rechazar una bajada de versión en el sitio o tratar de forma distinta la firma del paquete. Si falla la instalación, desinstala la aplicación anterior antes de instalar este proyecto. La desinstalación puede borrar los datos locales de la aplicación, así que anota primero tus ajustes y los datos de los hosts.

## Primer inicio

Inicia Moonlight desde la pantalla Apps del televisor, permite el descubrimiento en la red local y empareja con el PC host. Si no aparece automáticamente, usa Add Host e introduce la dirección IP o el nombre DNS del host. Consulta la [Guía de inicio rápido](Quick-Start-Guide-es.md).
