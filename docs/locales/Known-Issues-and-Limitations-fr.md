---
layout: docs-page
lang: undefined
title: "Problèmes connus et limitations"
description: "Problèmes de compatibilité connus et limitations techniques de Moonlight Tizen avec prise en charge audio Dolby."
---

# Problèmes connus et limitations

## Audio Dolby par sortie optique

- Le passthrough Dolby est une extension facultative qui nécessite l’implémentation expérimentale correspondante de Sunshine. Les hôtes standard qui envoient OPUS restent pris en charge et continueront d’utiliser OPUS.

- AC-3 est limité à 5.1 canaux. L’encodeur expérimental correspondant prend actuellement en charge la stéréo et le 5.1, pas le 7.1.

- Le passthrough E-AC-3 par sortie optique dépend du modèle du téléviseur, du micrologiciel, de la configuration de sortie et du récepteur. Ne supposez pas que tous les téléviseurs peuvent transmettre l’E-AC-3 via TOSLINK.

- La chaîne audio native du téléviseur doit accepter le format compressé. Si elle refuse l’initialisation de la piste, un flux Dolby ne peut pas être lu par cette voie.

- Cette fonctionnalité a été testée avec un téléviseur Samsung et une chaîne audio spécifiques ; la compatibilité avec toutes les combinaisons de téléviseurs et de récepteurs n’est pas établie.

- Le débit audio affiché dans l’overlay est une estimation du débit reçu et mesuré, et non un champ de négociation du codec ni une cible garantie de l’encodeur.

## Limitations de Tizen et des téléviseurs

- Le client cible les téléviseurs Samsung pris en charge exécutant Tizen 5.5 ou une version ultérieure, mais les fonctionnalités varient selon le modèle et le micrologiciel.

- Le Game Mode et les options de fréquence de rafraîchissement élevée peuvent être limités par le système d’exploitation ou les capacités du téléviseur, même lorsqu’un réglage est visible.

- Certains téléviseurs disposent d’un port Ethernet limité à 100 Mbit/s. À haute résolution ou à débit élevé, les rafales de trames peuvent provoquer des pertes de paquets par Ethernet filaire. Tester une connexion Wi-Fi 5 GHz fiable peut aider à distinguer un problème réseau d’un problème côté hôte.

- La résolution vidéo, la fréquence d’images, le HDR, l’AV1 et les débits élevés dépendent du décodeur du téléviseur et de l’encodeur du GPU de l’hôte. Les combinaisons non prises en charge peuvent entraîner un repli ou empêcher le démarrage.

## Projet indépendant et état des versions

Ce projet est maintenu indépendamment et comprend des fonctionnalités dépendantes du matériel. Sa série de versions commence à 1.0.0 et est distincte de celle du [projet de base Brightcraft](https://github.com/brightcraft/moonlight-tizen). Les notes de version publiques et les modifications connues sont disponibles sur la [page des versions](https://github.com/fidoboy/moonlight-tizen-ac3/releases) et dans le [journal des modifications](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Pour signaler un problème, indiquez la version exacte du projet, le modèle du téléviseur et la version de Tizen, la version et la branche de Sunshine, les paramètres vidéo, le moteur audio, la disposition des canaux et les journaux pertinents.
