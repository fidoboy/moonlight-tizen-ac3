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

Oui. Ce client Moonlight devrait fonctionner correctement avec l’ancien [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update), ainsi qu’avec les logiciels hôtes modernes compatibles tels que [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) ou tout autre serveur utilisant le même protocole. L’utilisation de Vibeshine est recommandée, car ce logiciel propose des fonctionnalités avancées et prend en charge nativement l’audio Dolby Digital. Si Dolby Digital est activé dans les paramètres de Moonlight, mais que l’hôte ne prend pas en charge Dolby Digital nativement, Moonlight tentera de le fournir par encodage logiciel lorsque cela sera possible ; sinon, il adoptera une approche au mieux. Si Dolby Digital ne peut pas être utilisé pendant une session, Moonlight conservera la rétrocompatibilité et reviendra à l’audio OPUS standard.

## Comment obtenir du Dolby Digital 5.1 par les sorties optique ou HDMI du téléviseur ?

Pour utiliser le Dolby Digital via les sorties audio du téléviseur, vous avez besoin des éléments suivants :

- Ce projet avec **Enable Dolby Digital** activé.
- Un appareil audio externe connecté au téléviseur si vous souhaitez en utiliser un, notamment pour profiter du son surround 5.1.
- Un téléviseur capable de transmettre le son via sa sortie optique ou une connexion HDMI ARC/eARC. Le résultat peut varier selon le modèle du téléviseur et la version de Tizen qu’il utilise.
- Un récepteur ou système audio externe capable de décoder le Dolby Digital (AC-3) ou le Dolby Digital Plus (E-AC-3), si le téléviseur lui transmet le son dans l’un de ces formats.

L’hôte n’a pas besoin de fournir nativement un flux audio Dolby Digital. Moonlight peut fournir le Dolby Digital grâce à son propre traitement audio ; le résultat dépend donc principalement des capacités et des réglages audio du téléviseur. Les connexions optiques ainsi que HDMI ARC/eARC sont prises en charge.

Pour la configuration initiale, choisissez 5.1 et vérifiez la ligne **Audio stream** dans l’overlay des statistiques. Vous pouvez laisser les statistiques activées dans les **Paramètres avancés** de Moonlight ou les afficher manuellement pendant une session : ouvrez le menu de streaming avec **Play/Pause** sur la télécommande du téléviseur ou en maintenant le bouton **Select** de la manette, puis choisissez l’option d’affichage des statistiques. Si un clavier est connecté au téléviseur, vous pouvez afficher ou masquer directement les statistiques avec **Ctrl+Alt+Shift+S**.

## Activer Dolby Digital force-t-il Dolby sur tous les hôtes ?

Non. L’option demande le Dolby Digital lors de la négociation du flux, mais elle ne contraint pas tous les hôtes à le fournir. Si le Dolby Digital n’est pas proposé ou si l’hôte ne peut pas le sélectionner ou le fournir, Moonlight utilise OPUS ou la voie audio compatible disponible. L’overlay des statistiques fournit les informations les plus détaillées sur le format audio négocié pour la session et peut être activé en option. Vous pouvez également vérifier plus sûrement la sortie réelle sur le récepteur ou le système audio externe, s’il dispose d’un écran ou d’un voyant LED qui s’allume lorsqu’il reçoit un signal Dolby Digital. Cela permet de confirmer que le son effectivement obtenu correspond aux paramètres sélectionnés dans Moonlight. En définitive, le résultat dépend de la combinaison des capacités de l’hôte, du modèle du téléviseur et de son traitement audio, ainsi que des caractéristiques de l’équipement audio externe.

## Le Dolby Digital Plus fonctionne-t-il toujours sur TOSLINK ?

Non. La prise en charge E-AC-3 dépend du téléviseur Samsung, de son micrologiciel, du mode de sortie audio et du récepteur. Certaines sorties optiques ne prennent en charge qu'une partie des formats bitstream. Utilisez AC-3 si l'équipement n'accepte pas E-AC-3.

## Le passthrough Dolby peut-il transporter du 7.1 ?

L’implémentation actuelle est limitée à la stéréo et au 5.1. E-AC-3 prend théoriquement en charge le 7.1, mais le chemin d’encodage FFmpeg utilisé par cette version ne propose pas encore cette option. Si FFmpeg ajoute cette prise en charge à l’avenir, il pourrait devenir possible de sélectionner le 7.1 pour E-AC-3. AC-3 reste limité au 5.1. Le streaming OPUS standard peut proposer d’autres dispositions de canaux si l’hôte et le client les prennent en charge.

## Comment voir les codecs vidéo et audio actifs ?

Si un clavier est connecté au téléviseur, appuyez sur **Ctrl+Alt+Shift+S** pour afficher ou masquer l’overlay de statistiques. Vous pouvez également appuyer sur **Play/Pause** sur la télécommande du téléviseur, ou maintenir le bouton **Select** de la manette enfoncé pendant une seconde puis le relâcher, pour ouvrir le menu de streaming. Choisissez ensuite l’option d’affichage des statistiques.

Les lignes relatives aux flux dans l’overlay fournissent davantage d’informations que les seuls noms des codecs négociés :

- **Video stream :** indique la résolution et la fréquence d’images du flux, puis le codec vidéo négocié. Avec H.264, son niveau peut également être indiqué (par exemple **H.264 L4.1**). Il s’agit du niveau H.264 sélectionné en fonction de la résolution et de la fréquence d’images du flux, et non du profil H.264 Baseline. Lorsque le HDR a été activé et correctement négocié avec l’hôte, le codec est indiqué comme **HEVC 10-bit HDR** ou **AV1 10-bit HDR**. Si le codec 10 bits correspondant est indiqué comme **SDR**, le HDR n’a pas été négocié pour ce flux.
- **Audio stream :** indique le codec audio négocié (OPUS, AC-3 ou E-AC-3), la disposition et le nombre de canaux, ainsi que le débit actuellement reçu. Ce débit est mesuré pendant le streaming et peut varier ; il n’est pas nécessairement égal en permanence à celui négocié initialement avec l’hôte. L’indication **[Hardware]** ou **[Software]** précise le chemin de traitement audio actif. **[Hardware]** signifie que le téléviseur effectue le décodage avec sa prise en charge matérielle native. Cette solution est généralement préférable, car elle évite le décodage logiciel dans Moonlight et contribue à réduire la latence. **[Software]** signifie que Moonlight effectue un décodage logiciel ou une conversion/transcodification avant d’envoyer le son au téléviseur, ce qui peut ajouter de la latence de traitement.
- **Indicateur HQ :** lorsqu’un son de haute qualité a été demandé, un exposant **HQ** peut apparaître à côté du codec. En vert, il indique que l’hôte a confirmé l’activation du mode haute qualité. En blanc, la demande a été envoyée, mais Moonlight n’a pas pu confirmer à partir de la réponse de l’hôte que ce mode est effectivement utilisé.
- **Audio input / Audio transcode :** lorsque Moonlight traite l’audio ou convertit son format par logiciel avant de le transmettre au téléviseur, des lignes supplémentaires indiquent le débit du flux audio entrant et le temps moyen consacré au traitement de chaque segment audio. Cela peut se produire lorsque le téléviseur ne prend pas en charge nativement le format reçu, lorsque Moonlight convertit OPUS en PCM, AC-3 ou E-AC-3, ou lorsque le flux AC-3 ou E-AC-3 reçu est converti dans un autre format, tel que PCM, en raison des capacités du téléviseur ou des paramètres audio sélectionnés. Le temps indiqué correspond au délai de traitement ajouté par cette chaîne audio logicielle.
- **Audio FEC :** indique le nombre de paquets audio récupérés, le nombre de blocs FEC en échec et le nombre de paquets arrivés dans le désordre pendant le dernier intervalle de mesure.

La ligne **Frame rates** indique séparément le nombre d’images reçues, décodées et acceptées par seconde. **Incoming bitrate from network** indique le débit total réellement reçu depuis le réseau. Il peut varier pendant le streaming et ne reste pas nécessairement égal à la valeur négociée au départ. Les autres statistiques indiquent notamment la latence réseau, les images manquantes, le temps moyen de décodage, le délai dans la file d’attente des images et le temps de soumission au moteur de rendu.

## Où trouver les informations sur le téléviseur et l'application ?

Dans l'application, ouvrez Paramètres, puis À propos > Informations système. Pour diagnostiquer un problème, notez le modèle du téléviseur, la version de Tizen, celles du client et de l'hôte, ainsi que les réglages vidéo/audio.

Pour signaler un problème ou envoyer une suggestion, utilisez le [suivi des problèmes GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues).

## Quelles manettes puis-je utiliser ?

La compatibilité dépend du modèle du téléviseur, de la version de Tizen et du mode de connexion. Une manette USB ou Bluetooth reconnue par le téléviseur est le meilleur point de départ. Si elle ne fonctionne pas dans Moonlight, vérifiez d'abord qu'elle est reconnue par le téléviseur et consultez le [Guide de dépannage](../Troubleshooting-Guide.html).
