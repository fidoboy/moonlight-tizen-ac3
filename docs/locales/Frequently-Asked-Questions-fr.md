---
layout: docs-page
lang: fr
title: "Foire aux questions"
description: "Réponses sur la compatibilité des hôtes, l'audio Dolby et les réglages de Moonlight Tizen."
---

# Foire aux questions


## Comment mettre à jour l’application lorsqu’une nouvelle version est disponible ?

L’application sur votre téléviseur vous avertira lorsqu’une nouvelle version sera disponible. Si vous avez utilisé la méthode d’installation recommandée via Apps2Samsung, il suffit de rouvrir Apps2Samsung et de sélectionner **Moonlight** avec la variante **fidoboy · Enhanced · Dolby** pour télécharger la dernière version. Si vous préférez l’installation manuelle, téléchargez le nouveau paquet WGT depuis la [page de la dernière version](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest), puis installez-le sur le téléviseur.

## Comment obtenir une meilleure qualité d’image ou configurer Moonlight pour bénéficier d’un flux plus stable ?

Il est préférable de laisser l’optimisation automatique du débit activée pendant les premières connexions. À chaque nouvelle connexion, Moonlight recalcule le débit recommandé en fonction des paramètres et des caractéristiques négociées qui influent sur la consommation de bande passante, afin de déterminer une valeur équilibrée pour votre configuration. Lorsque cette valeur ne change plus parce que les configurations de l’hôte et de Moonlight restent identiques, vous pouvez l’utiliser comme point de départ pour effectuer des réglages manuels : désactivez l’optimisation automatique et augmentez progressivement le débit pour tenter d’améliorer la qualité d’image, au prix d’une consommation accrue de bande passante réseau, ou réduisez-le légèrement si les conditions réseau sont moins favorables, au prix d’une certaine dégradation de la qualité d’image. La marge de réglage dépend des capacités du matériel à chaque extrémité du flux ainsi que de la bande passante disponible. Au-delà d’un certain seuil, augmenter le débit peut ne plus apporter d’amélioration visible de la qualité d’image, même si le réseau est capable de le transporter.

## Ce projet fonctionne-t-il avec Sunshine ou d’autres hôtes compatibles GameStream ?

Oui. Ce client Moonlight devrait fonctionner correctement avec l’ancien [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update), ainsi qu’avec les logiciels hôtes modernes compatibles tels que [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) ou tout autre serveur utilisant le même protocole. L’utilisation de Vibeshine est recommandée, car ce logiciel propose des fonctionnalités avancées et prend en charge nativement l’audio Dolby Digital. Si Dolby Digital est activé dans les paramètres de Moonlight, mais que l’hôte ne prend pas en charge Dolby Digital nativement, Moonlight tentera de le fournir par encodage logiciel lorsque cela sera possible ; sinon, il adoptera une approche au mieux. Si Dolby Digital ne peut pas être utilisé pendant une session, Moonlight conservera la rétrocompatibilité et reviendra à l’audio OPUS standard.Ce client Moonlight devrait fonctionner correctement avec l’ancien [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update), [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) et les autres serveurs compatibles avec le même protocole. L’extension Dolby est facultative. Si l’hôte n’annonce pas ou ne sélectionne pas AC-3/E-AC-3, le client conserve le chemin audio OPUS normal. Aucune modification spécifique à Dolby n’est requise sur un hôte utilisant uniquement OPUS.

## Comment obtenir du Dolby Digital 5.1 par les sorties optique ou HDMI du téléviseur ?

Il vous faut tous les éléments suivants :

- Ce projet avec **Enable Dolby Digital** activé.
- Une version compatible de Sunshine avec l'implémentation `ac3-audio`, un encodeur Dolby disponible et le format audio (AC-3 ou E-AC-3) sélectionné dans la page des paramètres audio.
- Un téléviseur capable de transmettre le bitstream Dolby choisi par sa sortie optique ou HDMI.
- Des réglages audio du téléviseur configurés dans un mode passthrough/bitstream compatible.
- Un récepteur ou un système audio qui prend en charge AC-3 et la disposition des canaux envoyée.

Pour la configuration initiale, choisissez 5.1 et vérifiez la ligne **Audio stream** de l'overlay de statistiques. Si un clavier est connecté au téléviseur, appuyez sur **Ctrl+Alt+Shift+S** pour afficher les statistiques. Sinon, appuyez sur **Play/Pause** ou **Retour** sur la télécommande pour ouvrir le menu de streaming, puis choisissez l’option d’affichage des statistiques.

## Activer Dolby Digital force-t-il Dolby sur tous les hôtes ?

Non. L'option demande le codec facultatif pendant la négociation. Si Dolby n'est pas proposé ou sélectionné par l'hôte, Moonlight utilise OPUS. Le codec actif affiché dans l'overlay est le moyen fiable de vérifier ce que reçoit la session.

## Le Dolby Digital Plus fonctionne-t-il toujours sur TOSLINK ?

Non. La prise en charge E-AC-3 dépend du téléviseur Samsung, de son micrologiciel, du mode de sortie audio et du récepteur. Certaines sorties optiques ne prennent en charge qu'une partie des formats bitstream. Utilisez AC-3 si l'équipement n'accepte pas E-AC-3.

## Le passthrough Dolby peut-il transporter du 7.1 ?

L’implémentation actuelle est limitée à la stéréo et au 5.1. E-AC-3 prend théoriquement en charge le 7.1, mais le chemin d’encodage FFmpeg utilisé par cette version ne propose pas encore cette option. Si FFmpeg ajoute cette prise en charge à l’avenir, il pourrait devenir possible de sélectionner le 7.1 pour E-AC-3. AC-3 reste limité au 5.1. Le streaming OPUS standard peut proposer d’autres dispositions de canaux si l’hôte et le client les prennent en charge.

## Comment voir le codec audio actif ?

Si un clavier est connecté au téléviseur, appuyez sur **Ctrl+Alt+Shift+S** pour afficher ou masquer l’overlay de statistiques. Sinon, appuyez sur **Play/Pause** ou **Retour** sur la télécommande pour ouvrir le menu de streaming, puis choisissez l’option d’affichage des statistiques. La ligne audio indique le codec négocié, la disposition, le nombre de canaux et le débit approximatif.

## Quelle différence entre Moonlight.wgt et Moonlight-ForceGM.wgt ?

`Moonlight.wgt` est le paquet standard. `Moonlight-ForceGM.wgt` inclut des métadonnées Game Mode supplémentaires lorsqu'elles sont utiles. Il ne peut pas ajouter une prise en charge de Game Mode absente de la plateforme.

## Où trouver les informations sur le téléviseur et l'application ?

Dans l'application, ouvrez Settings, puis About/System Information. Pour diagnostiquer un problème, notez le modèle du téléviseur, la version de Tizen, celles du client et de l'hôte, ainsi que les réglages vidéo/audio.

## Quelles manettes puis-je utiliser ?

La compatibilité dépend du modèle du téléviseur, de la version de Tizen et du mode de connexion. Une manette USB ou Bluetooth reconnue par le téléviseur est le meilleur point de départ. Si elle ne fonctionne pas dans Moonlight, vérifiez d'abord qu'elle est reconnue par le téléviseur et consultez le [Guide de dépannage](../Troubleshooting-Guide.html).
