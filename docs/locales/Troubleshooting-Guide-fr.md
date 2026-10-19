---
layout: docs-page
lang: fr
title: "Guide de dépannage"
description: "Résoudre les problèmes courants de connexion, d’audio et de streaming dans Moonlight Tizen."
---

# Guide de dépannage

## Moonlight ne trouve pas l’hôte

1. Vérifiez que Sunshine est en cours d’exécution et que le téléviseur et le PC sont accessibles sur le même réseau.
2. Vérifiez le pare-feu de l’hôte et les paramètres d’isolation du routeur.
3. Essayez d’ajouter l’hôte avec l’adresse IPv4, l’adresse IPv6 ou le nom DNS du PC.
4. Si l’hôte utilise des ports personnalisés, vérifiez qu’ils sont configurés de façon cohérente.
5. Si la détection est intermittente, essayez une connexion Wi-Fi 5 GHz fiable ou Ethernet sur le téléviseur.

## L’association échoue

- Vérifiez que le code PIN est saisi dans l’interface Web Sunshine du bon hôte.
- Supprimez les anciennes entrées d’association uniquement si vous pouvez ensuite associer de nouveau le client.
- Vérifiez l’heure du système et l’absence de règle de pare-feu bloquant la communication entre le téléviseur et le PC.

## Le flux démarre, mais la vidéo se fige, devient noire ou perd des images

- Commencez par une résolution plus faible, 60 FPS et un débit modéré.
- Vérifiez que le codec vidéo sélectionné est pris en charge par le téléviseur et le GPU de l’hôte.
- Mettez à jour les pilotes du GPU et Sunshine si le problème se produit également avec d’autres clients.
- Si Ethernet est instable à débit élevé, essayez un autre chemin réseau. Certains téléviseurs sont équipés de ports Fast Ethernet, même si l’hôte est connecté en Gigabit Ethernet.

## Aucun son ou disposition des canaux incorrecte

- Vérifiez la sortie audio du téléviseur, l’entrée du récepteur, le volume et la coupure du son.
- Essayez d’abord le chemin OPUS par défaut. S’il fonctionne, n’activez la sortie optique que pour tester Dolby.
- Commencez en stéréo, puis passez au 5.1 après avoir confirmé la compatibilité de toute la chaîne téléviseur/récepteur.
- L’implémentation Dolby actuelle côté hôte prend en charge la stéréo et le 5.1. Ne sélectionnez pas le 7.1 pour le chemin de l’encodeur Dolby.

## Les statistiques affichent OPUS au lieu de AC-3 ou E-AC-3

1. Vérifiez que **Enable Dolby Digital** est activé dans Moonlight.
2. Vérifiez que l’hôte utilise la [branche expérimentale ac3-audio de Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondante, compilée avec l’encodeur Dolby FFmpeg facultatif disponible.
3. Démarrez un nouveau flux après avoir modifié les paramètres audio de l’hôte.
4. Vérifiez dans le journal de l’hôte que le codec et le débit AC-3 ou E-AC-3 attendus sont indiqués.
5. Si Sunshine ne propose pas Dolby ou ne le sélectionne pas, OPUS est le repli de compatibilité attendu.

L’activation du paramètre ne prouve pas, à elle seule, qu’un flux Dolby a été négocié. La ligne des statistiques audio indique le format réellement utilisé pendant la session.
