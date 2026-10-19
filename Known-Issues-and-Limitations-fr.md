---
layout: docs-page
lang: fr
title: "Problèmes connus et limitations"
description: "Limitations connues de l'audio Dolby, de Tizen et du streaming Moonlight Tizen."
---

# Problèmes connus et limitations

## Audio Dolby par sortie optique

- Le passthrough Dolby est une extension facultative qui nécessite l'implémentation expérimentale correspondante de Sunshine. Un hôte standard qui envoie OPUS reste pris en charge, mais continuera à utiliser OPUS.
- AC-3 est limité à 5.1 canaux. L'encodeur expérimental correspondant prend actuellement en charge la stéréo et le 5.1, pas le 7.1.
- Le passthrough E-AC-3 par sortie optique dépend du modèle, du micrologiciel, de la configuration de sortie et du récepteur. Ne supposez pas que tous les téléviseurs peuvent envoyer E-AC-3 sur TOSLINK.
- La chaîne audio native du téléviseur doit accepter le format compressé. Si elle refuse l'initialisation de la piste, le flux Dolby ne peut pas être lu par ce chemin.
- Cette fonctionnalité a été testée avec un téléviseur Samsung et une chaîne audio spécifiques ; la compatibilité de toutes les combinaisons téléviseur/récepteur n'est pas établie.
- Le débit audio affiché dans l'overlay est un taux de réception mesuré approximatif, pas un champ de négociation du codec ni une cible d'encodeur garantie.

## Limitations de Tizen et du téléviseur

- Le client cible les téléviseurs Samsung pris en charge sous Tizen 5.5 ou ultérieur, mais les capacités varient selon le modèle et le micrologiciel.
- Game Mode et les options de fréquence de rafraîchissement élevée peuvent être limités par le système ou les capacités du téléviseur, même si un réglage est visible.
- Certains téléviseurs disposent d'un port Ethernet à 100 Mbit/s. À haute résolution ou à débit élevé, des rafales de trames peuvent provoquer des pertes de paquets en Ethernet. Tester un Wi-Fi 5 GHz fiable peut aider à distinguer ce problème d'un problème de l'hôte.
- La résolution, la fréquence d'images, le HDR, AV1 et les débits élevés dépendent du décodeur du téléviseur et de l'encodeur GPU de l'hôte. Les combinaisons non prises en charge peuvent basculer vers une solution de repli ou échouer au démarrage.

## Projet indépendant et état des versions

Ce projet est maintenu indépendamment et inclut des fonctionnalités dépendantes du matériel. Sa série de versions commence à 1.0.0 et est distincte de celle du projet [Brightcraft](https://github.com/brightcraft/moonlight-tizen). Les notes des versions publiques et les modifications connues se trouvent sur la [page des versions](https://github.com/fidoboy/moonlight-tizen-ac3/releases) et dans le [journal des modifications](../CHANGELOG.md).

Lors d'un signalement, indiquez la version exacte du projet, le modèle et la version Tizen du téléviseur, la version/branche de Sunshine, les réglages vidéo, le moteur audio, les canaux sélectionnés et les journaux pertinents.
