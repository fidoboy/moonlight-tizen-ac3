---
layout: docs-page
lang: fr
title: "Guide de dépannage"
description: "Résoudre les problèmes courants de connexion, d’audio et de streaming dans Moonlight Tizen."
---

# Guide de dépannage

## Apps2Samsung n'affiche pas le téléviseur dans la liste

1. Vérifiez que le **Developer Mode (mode développeur)** est activé sur le téléviseur Samsung. Appuyez sur **Home**, ouvrez **Apps**, puis **App Settings** (généralement l'icône en forme d'engrenage). Sur certains anciens modèles, le code peut être saisi lorsque l'écran Apps est ouvert.
2. Saisissez **12345** avec les touches numériques de la télécommande. Si votre Smart Remote n'a pas de touches numériques, ouvrez le clavier à l'écran avec le bouton **123**, puis saisissez les chiffres. Lorsque la boîte de dialogue **Developer Mode** apparaît, activez le mode développeur (**On**).
3. Dans **Host PC IP**, saisissez l'adresse IPv4 locale de l'ordinateur qui exécute Apps2Samsung. Elle doit correspondre exactement à l'adresse actuelle de cet ordinateur. Utilisez l'IPv4 de son adaptateur Wi-Fi ou Ethernet actif, et non l'adresse IP du téléviseur, la passerelle du routeur, `127.0.0.1` ou votre adresse Internet publique. Enregistrez le réglage et redémarrez le téléviseur.
4. Vérifiez que le téléviseur et l'ordinateur sont sur le même réseau local, puis relancez la recherche du téléviseur dans Apps2Samsung. Le Wi-Fi invité ou l'isolation des clients du routeur peut bloquer la communication.

Consultez le [Guide d'installation](Installation-Guide-fr.html) et le [guide officiel Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) pour plus de détails.

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
2. Vérifiez que l’hôte utilise la [version expérimentale de Sunshine](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826) correspondante, compilée avec l’encodeur Dolby facultatif de FFmpeg. Dans Sunshine, ouvrez **Settings → Audio/Video** et sélectionnez **AC-3 (Dolby Digital)** ou **E-AC-3 (Dolby Digital Plus)** dans la liste déroulante du format audio du flux.
3. Démarrez un nouveau flux après avoir modifié les paramètres audio de l’hôte.
4. Vérifiez dans le journal de l’hôte que le codec et le débit AC-3 ou E-AC-3 attendus sont indiqués.
5. Si Sunshine ne propose pas Dolby ou ne le sélectionne pas, OPUS est le repli de compatibilité attendu.

L’activation du paramètre ne prouve pas, à elle seule, qu’un flux Dolby a été négocié. La ligne des statistiques audio indique le format réellement utilisé pendant la session.

## Recueillir des informations de diagnostic utiles

Notez la version du projet Moonlight, le modèle du téléviseur et la version de Tizen, la version et la branche de Sunshine, le codec et la disposition des canaux affichés dans les statistiques, les réglages de résolution/FPS/débit et indiquez si le problème se reproduit avec OPUS. Ensuite, [ouvrez un ticket sur GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues) en incluant les informations pertinentes. Ne publiez pas d'adresses IP publiques, de codes PIN, de clés privées ni d'autres secrets.
