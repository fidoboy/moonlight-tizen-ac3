---
layout: docs-page
lang: undefined
title: "Guide de mise à jour"
description: "Comment mettre à jour Moonlight Tizen sur un Samsung Smart TV et choisir la bonne variante du paquet."
---

# Guide de mise à jour

## Mettre à jour vers une version plus récente du projet

1. Ouvrez la [page des versions](https://github.com/fidoboy/moonlight-tizen-ac3/releases).

2. Téléchargez le dernier fichier **Moonlight.wgt**, ou **Moonlight-ForceGM.wgt** si vous utilisez précisément cette variante.

3. Installez-le avec la même méthode qu’auparavant (Apps2Samsung, Tizen Studio ou l’outil adapté à l’appareil).

4. Lancez Moonlight et vérifiez que vos paramètres enregistrés et vos hôtes associés sont toujours présents.

Dans la mesure du possible, conservez la même variante du paquet et la même méthode de signature et d’installation. Si le téléviseur refuse la mise à jour en raison d’un conflit de version ou de certificat, consultez le [guide d’installation](Installation-Guide-fr.html).

## Passer du paquet Brightcraft 1.18.x à la série 1.0.x de ce projet

Ce projet démarre une série de versions distincte à 1.0.0. Ce numéro étant inférieur à la version 1.18.x du paquet d’origine, certains téléviseurs peuvent refuser une mise à jour directe. Dans ce cas :

1. Notez les paramètres que vous souhaitez restaurer.

2. Désinstallez l’ancienne application depuis le gestionnaire d’applications du téléviseur ou avec l’outil d’installation utilisé précédemment.

3. Installez le nouveau paquet du projet et associez/configurez de nouveau les hôtes si nécessaire.

La désinstallation peut supprimer les données locales de l’application. Cette limitation vient du lancement d’une série de versions distincte avec la même identité d’application Tizen ; elle ne signifie pas que le WGT a été mal compilé.

## Mettre à jour les versions expérimentales

Les WGT expérimentaux produits par GitHub Actions sont des artefacts de test temporaires. Téléchargez l’artefact depuis l’exécution du workflow concerné plutôt qu’à partir d’une ancienne URL mise en cache, et vérifiez le SHA du commit avant l’installation. Ne supposez pas qu’un artefact expérimental équivaut à une version stable étiquetée.
