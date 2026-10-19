---
layout: docs-page
lang: fr
title: "Guide de dépannage"
description: "Résolution des problèmes courants de connexion, d'audio et de streaming dans Moonlight Tizen."
---

# Guide de dépannage

## Moonlight ne trouve pas l'hôte

1. Vérifiez que Sunshine est en cours d'exécution et que le téléviseur et le PC sont accessibles sur le même réseau.
2. Vérifiez le pare-feu de l'hôte et les paramètres d'isolation du routeur.
3. Essayez Add Host avec l'adresse IPv4, l'adresse IPv6 ou le nom DNS du PC.
4. Si l'hôte utilise des ports personnalisés, vérifiez que leur configuration est cohérente.
5. Si la découverte est intermittente, testez le téléviseur sur un Wi-Fi 5 GHz fiable ou Ethernet.

## L'association échoue

- Vérifiez que le PIN est saisi dans l'interface Web Sunshine du bon hôte.
- Supprimez les anciennes entrées d'association uniquement si vous pourrez associer à nouveau le client.
- Vérifiez l'heure système et l'absence de règle de pare-feu bloquant la communication entre le téléviseur et le PC.

## Le flux démarre, mais la vidéo se fige, devient noire ou perd des images

- Commencez par une résolution plus faible, 60 FPS et un débit prudent.
- Vérifiez que le codec vidéo choisi est pris en charge par le téléviseur et le GPU hôte.
- Mettez à jour les pilotes GPU et Sunshine si le problème se produit aussi avec d'autres clients.
- Si Ethernet filaire est instable à débit élevé, essayez un autre chemin réseau. Certains téléviseurs ont des ports Fast Ethernet même si l'hôte est connecté en Gigabit.

## Aucun son ou disposition des canaux incorrecte

- Vérifiez la sortie audio du téléviseur, l'entrée du récepteur, le volume et la mise en sourdine.
- Testez d'abord le chemin OPUS par défaut. S'il fonctionne, activez la sortie optique uniquement pour tester Dolby.
- Commencez en stéréo, puis passez au 5.1 après avoir confirmé la compatibilité de la chaîne téléviseur/récepteur.
- L'implémentation hôte Dolby actuelle prend en charge la stéréo et le 5.1. Ne sélectionnez pas le 7.1 pour le chemin de l'encodeur Dolby.

## Les statistiques affichent OPUS au lieu d'AC-3 ou E-AC-3

1. Vérifiez que **Enable Dolby Digital** est activé dans Moonlight.
2. Vérifiez que l'hôte utilise la branche expérimentale [Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondante, compilée avec l'encodeur Dolby FFmpeg facultatif disponible.
3. Démarrez un nouveau flux après avoir modifié les réglages audio de l'hôte.
4. Vérifiez que le journal de l'hôte indique le codec AC-3 ou E-AC-3 attendu et le débit correspondant.
5. Si Sunshine ne propose pas Dolby ou ne le sélectionne pas, OPUS est le repli de compatibilité attendu.

Un réglage activé ne prouve pas à lui seul qu'un flux Dolby a été négocié. La ligne de statistiques audio reflète la session active.

## La manette ou la télécommande ne fonctionne pas

- Vérifiez que le téléviseur reconnaît la manette dans ses propres paramètres.
- Reconnectez la manette avant de lancer Moonlight.
- Testez la navigation de base dans la liste des hôtes et les paramètres avant de démarrer un flux.
- Si le problème ne survient que dans un jeu, comparez avec une autre application pour isoler les mappages propres au jeu.

## Collecter des informations de diagnostic utiles

Notez la version du projet Moonlight, le modèle du téléviseur et la version Tizen, la version et la branche Sunshine, le codec et la disposition des canaux affichés dans les statistiques, les réglages résolution/FPS/débit et si le problème apparaît aussi avec OPUS. Ne publiez pas d'adresses IP publiques, de PIN, de clés privées ou d'autres secrets.
