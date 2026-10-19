---
layout: docs-page
lang: fr
title: "Guide de mise à jour"
description: "Mettre à jour Moonlight Tizen et passer d'autres builds à ce projet."
---

# Guide de mise à jour

## Mettre à jour vers une version plus récente du projet

1. Ouvrez la [page des versions](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Téléchargez le dernier `Moonlight.wgt`, ou `Moonlight-ForceGM.wgt` si vous utilisez précisément cette variante.
3. Installez-le avec la même méthode qu'auparavant (Apps2Samsung, Tizen Studio ou l'outil adapté à l'appareil).
4. Lancez Moonlight et vérifiez que vos réglages sauvegardés et hôtes associés sont toujours présents.

Utilisez si possible la même variante de paquet et la même méthode de signature/installation. Si le téléviseur refuse la mise à jour à cause d'un conflit de version ou de certificat, consultez le [Guide d'installation](Installation-Guide-fr.md).

## Passer du paquet Brightcraft 1.18.x à la série 1.0.x de ce projet

Ce projet démarre une séquence de versions indépendante à 1.0.0. Comme ce numéro est inférieur à la version 1.18.x de l'application d'origine, certains téléviseurs peuvent refuser une mise à jour directe. Dans ce cas :

1. Notez les réglages à restaurer.
2. Désinstallez l'ancienne application avec le gestionnaire d'applications du téléviseur ou l'outil utilisé pour l'installation.
3. Installez le paquet de ce projet et associez/configurez à nouveau les hôtes si nécessaire.

La désinstallation peut effacer les données locales de l'application. Cette limitation vient du démarrage d'une nouvelle séquence de versions avec la même identité d'application Tizen ; elle ne signifie pas que le WGT n'a pas été compilé correctement.

## Mettre à jour les builds expérimentaux

Les WGT expérimentaux de GitHub Actions sont des artefacts de test temporaires. Téléchargez l'artefact depuis l'exécution du workflow concerné plutôt que depuis une ancienne URL mise en cache, et vérifiez le SHA du commit avant l'installation. Ne supposez pas qu'un artefact expérimental équivaut à une version stable étiquetée.
