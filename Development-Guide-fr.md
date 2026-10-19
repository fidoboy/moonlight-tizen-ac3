---
layout: docs-page
lang: fr
title: "Guide de développement"
description: "Compilation locale, artefacts CI et publications GitHub de Moonlight Tizen."
---

# Guide de développement

## Dépôt et dépendances

Clonez ce dépôt avant de compiler :

    git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
    cd moonlight-tizen-ac3

Le dépôt actuel ne contient aucun sous-module Git actif : les sources des dépendances nécessaires sont directement versionnées dans le dépôt. Un clonage normal suffit ; la commande `git submodule update --init --recursive` n'est pas requise.

## Compiler avec Docker

Le Dockerfile du dépôt inclut l'environnement de compilation et empaquette le widget Tizen. Depuis la racine du dépôt, compilez la variante standard :

    docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
    container_id=$(docker create moonlight-tizen-ac3:standard)
    docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
    docker rm "$container_id"

Pour compiler le paquet ForceGM, relancez la compilation avec `FORCE_GAME_MODE=true` et extrayez `/home/moonlight/Moonlight-ForceGM.wgt`.

## Intégration continue

Le workflow **Build WGT (CI)** vérifie le JavaScript de démarrage, la cohérence des traductions et les pages de documentation requises, puis construit les variantes standard et ForceGM du paquet. Il s'exécute lors des modifications de la branche `master` et des pull requests ; il peut aussi être lancé manuellement. Les artefacts CI sont des builds de test temporaires, pas des versions publiques numérotées.

## Publier une version publique

Le projet utilise sa propre séquence de versions sémantiques, à partir de **1.0.0**. La version du widget Tizen dans `res/config.xml` fait foi.

1. Mettez à jour la version dans `res/config.xml` (par exemple `1.0.1` pour la prochaine version corrective).
2. Ajoutez les notes de version en haut de `CHANGELOG.md`.
3. Committez les modifications et fusionnez-les dans `master`.
4. Ouvrez Actions → **Release WGTs**, lancez le workflow sur `master` et saisissez la même version. Le workflow valide la version, refuse d'écraser une publication publique existante, construit les deux variantes WGT et publie une GitHub Release étiquetée `vVERSION`.

Vous pouvez aussi pousser une étiquette Git comme `v1.0.1` après avoir défini la version correspondante dans `res/config.xml`. Le même workflow compile les paquets et les joint automatiquement à la publication. Les versions stables utilisent l'étiquette sémantique simple ; les préversions utilisent le suffixe `-dev`.

## Notes sur le développement audio

Le passthrough Dolby exige le client Tizen et un hôte Sunshine expérimental compatible. Il est facultatif et ne doit jamais désactiver le chemin OPUS par défaut pour les hôtes qui ne proposent pas AC-3/E-AC-3. Lors des tests, vérifiez la négociation et la sortie réelles par le chemin optique prévu du téléviseur, et pas seulement le réglage sélectionné.

Gardez les pull requests ciblées, conservez les mentions de licence et documentez les comportements dépendant du matériel ainsi que les conditions de test.
