---
layout: docs-page
lang: fr
title: "Guide de démarrage rapide"
description: "Premiers pas avec Moonlight Tizen et les hôtes compatibles GameStream."
---

# Guide de démarrage rapide

Ce guide présente le chemin le plus court entre l'installation et un flux fonctionnel sur un Samsung Smart TV.

## 1. Vérifier la configuration

Vous aurez besoin de :

- Un Samsung Smart TV exécutant Tizen 5.5 ou ultérieur.
- Un PC exécutant Sunshine ou un autre hôte compatible GameStream.
- Un GPU hôte capable d'encoder matériellement.
- Une connexion réseau stable entre le téléviseur et le PC. Ethernet pour l'hôte et un Wi-Fi 5 GHz fiable ou Ethernet pour le téléviseur constituent un bon point de départ.
- Une manette compatible si vous voulez jouer avec une manette.

Consultez les [prérequis du README](../#compatibility) pour plus de détails.

## 2. Installer le client

Téléchargez le paquet standard `Moonlight.wgt` depuis la [page des versions](https://github.com/fidoboy/moonlight-tizen-ac3/releases). Choisissez le paquet ForceGM uniquement si vous avez spécifiquement besoin des métadonnées Game Mode alternatives.

Suivez le [Guide d'installation](Installation-Guide-fr.html) pour Apps2Samsung, Tizen Studio ou une autre méthode prise en charge.

## 3. Configurer l'hôte et l'associer

1. Installez et démarrez Sunshine sur le PC hôte.
2. Vérifiez que le PC et le téléviseur peuvent communiquer sur le même réseau et que le pare-feu de l'hôte autorise les connexions de streaming.
3. Lancez Moonlight sur le téléviseur et sélectionnez l'hôte lorsqu'il apparaît.
4. Moonlight affiche un PIN. Ouvrez l'interface Web de Sunshine sur le PC, saisissez ce PIN dans la section d'association et confirmez.
5. Sélectionnez un jeu ou le bureau pour commencer le streaming.

Pour une nouvelle installation, commencez avec une résolution, une fréquence d'images et un débit prudents. Augmentez-les une fois la stabilité confirmée.

## 4. Activer la sortie optique Dolby (facultatif)

Le passthrough Dolby nécessite la [version expérimentale Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondante. Téléchargez directement la version Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) ou [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). Il faut aussi un chemin audio compatible sur le téléviseur et un récepteur ou système audio prenant en charge le format.

1. Reliez la sortie optique du téléviseur au récepteur ou au système audio.
2. Dans les paramètres audio du téléviseur, choisissez un mode qui transmet un bitstream Dolby compatible au lieu d'imposer le PCM stéréo. Les libellés varient selon le modèle.
3. Dans Settings de Moonlight, activez **Enable Dolby Digital** et sélectionnez stéréo ou 5.1.
4. Démarrez un flux et affichez l'overlay de performances avec **Ctrl+Alt+Shift+S**. Vérifiez si la ligne audio indique OPUS, AC-3 ou E-AC-3 et la disposition de canaux attendue.

Si l'hôte ne propose que OPUS, le flux continuera à utiliser OPUS. Un réglage activé côté client ne peut pas faire envoyer du Dolby à un hôte OPUS uniquement.

## 5. Ajuster le streaming

Une fois le premier flux fonctionnel, ajustez résolution, fréquence d'images, débit, codec vidéo et réglages audio selon les capacités du téléviseur et du réseau. Consultez la [Présentation des fonctionnalités](Features-Overview-fr.html) et la [FAQ](../Frequently-Asked-Questions.html).
