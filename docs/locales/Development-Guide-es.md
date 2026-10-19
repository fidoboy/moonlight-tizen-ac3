---
layout: docs-page
lang: es
title: "Guía de desarrollo"
description: "Compilaciones locales, artefactos de CI y publicaciones de Moonlight Tizen."
---

# Guía de desarrollo

## Repositorio y dependencias

Clona este repositorio antes de compilar:

    git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
    cd moonlight-tizen-ac3

El repositorio actual no tiene submódulos Git activos: el código fuente de las dependencias necesarias está incluido directamente en el repositorio. Basta con una clonación normal; no es necesario ejecutar `git submodule update --init --recursive`.

## Compilar con Docker

El Dockerfile del repositorio incluye el entorno de compilación y empaqueta el widget de Tizen. Desde la raíz del repositorio, compila la variante estándar:

    docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
    container_id=$(docker create moonlight-tizen-ac3:standard)
    docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
    docker rm "$container_id"

Para compilar el paquete ForceGM, repite la compilación con `FORCE_GAME_MODE=true` y extrae `/home/moonlight/Moonlight-ForceGM.wgt`.

## Integración continua

El flujo **Build WGT (CI)** valida el JavaScript de inicio, la coherencia de las traducciones y las páginas de documentación requeridas; después compila las variantes estándar y ForceGM del paquete. Se ejecuta cuando hay cambios en la rama `master` y en solicitudes de cambios, y también se puede iniciar manualmente. Los artefactos de CI son compilaciones temporales de prueba, no versiones públicas etiquetadas.

## Publicar una versión estable

El proyecto utiliza su propia secuencia de versiones semánticas, que comienza en **1.0.0**. La versión del widget de Tizen en `res/config.xml` es la fuente de verdad.

1. Actualiza la versión en `res/config.xml` (por ejemplo, `1.0.1` para la siguiente versión correctiva).
2. Añade las notas de publicación al principio de `CHANGELOG.md`.
3. Confirma los cambios de la publicación y fusiónalos en `master`.
4. Abre Actions → **Release WGTs**, ejecútalo en `master` e introduce la misma versión. El flujo valida la versión, evita sobrescribir una publicación pública existente, compila ambas variantes WGT y publica una GitHub Release con la etiqueta `vVERSION`.

Como alternativa, después de establecer la versión correspondiente en `res/config.xml`, envía una etiqueta Git como `v1.0.1`. El mismo flujo compila los paquetes y los adjunta automáticamente a la publicación. Las versiones estables utilizan la etiqueta semántica sin sufijos; las compilaciones preliminares usan el sufijo `-dev`.

## Notas de desarrollo de audio

El passthrough Dolby requiere el cliente Tizen y un host Sunshine experimental compatible. Es opcional y nunca debe deshabilitar la ruta OPUS predeterminada en hosts que no ofrecen AC-3/E-AC-3. Durante las pruebas, verifica la negociación real y la salida a través de la ruta óptica prevista del televisor; no te limites a comprobar el ajuste seleccionado.

Mantén las solicitudes de cambios centradas, conserva los avisos de licencia y documenta el comportamiento dependiente del hardware y las condiciones de prueba.
