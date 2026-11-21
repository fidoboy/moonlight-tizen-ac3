---
layout: docs-page
lang: fr
title: "Présentation des fonctionnalités"
description: "Fonctionnalités de Moonlight Tizen, prise en charge audio Dolby et configuration."
---

# Présentation des fonctionnalités

Cette page décrit le projet client Moonlight pour Tizen. La disponibilité dépend du modèle de téléviseur, de la version de Tizen, de la configuration de l'hôte, du réseau et des périphériques connectés.

## Fonction principale par rapport aux autres clients : audio Dolby par sortie numérique

La caractéristique principale de ce projet est la sortie audio facultative Dolby Digital et Dolby Digital Plus sur les téléviseurs Samsung compatibles reliés à un récepteur ou à un système audio par une sortie optique (TOSLINK) ou HDMI. Contrairement aux versions précédentes, l'hôte n'a pas besoin de fournir un flux audio Dolby natif.

- **AC-3 (Dolby Digital) :** l'audio compressé stéréo ou 5.1 peut être envoyé au moteur audio EMSS natif de Tizen lorsque le format est disponible et pris en charge par le téléviseur et les appareils connectés.
- **E-AC-3 (Dolby Digital Plus) :** pris en charge lorsque le micrologiciel du téléviseur, la configuration de sortie audio et l'équipement récepteur acceptent ce format. La transmission E-AC-3 par sortie optique n'est pas garantie sur tous les téléviseurs.
- **Prise en charge Dolby côté hôte (recommandée) :** si l'hôte peut fournir nativement de l'AC-3 ou de l'E-AC-3, Moonlight peut utiliser directement ce flux. Cette configuration est vivement recommandée, car elle évite la conversion audio en temps réel sur le client TV et réduit ainsi la latence supplémentaire de traitement audio, ce qui améliore la réactivité des commandes et du son.
- **Conversion OPUS vers Dolby :** si l'hôte ne fournit pas d'audio Dolby, il peut continuer à envoyer de l'OPUS. Moonlight pour Tizen tentera de convertir en temps réel l'audio OPUS reçu en Dolby Digital, selon le modèle du téléviseur, les capacités audio de Tizen, les paramètres sélectionnés et les appareils audio connectés. Cela élargit la compatibilité avec les hôtes GameStream et les différentes configurations de téléviseurs et d'équipements audio, même si la conversion logicielle peut ajouter de la latence.
- **Stéréo et son surround :** la disposition des canaux et le format Dolby disponibles dépendent du flux reçu, du chemin de conversion et des capacités du téléviseur et du récepteur. La sortie AC-3 est limitée à 5.1 canaux.

Le chemin audio Dolby a été testé avec des téléviseurs Samsung compatibles et des équipements audio externes. Les résultats peuvent varier selon le modèle du téléviseur, la version du micrologiciel et le récepteur. Consultez [Problèmes connus et limitations](Known-Issues-and-Limitations-fr.html#dolby-optical-audio).

## Statistiques du flux audio

L'overlay de performances peut être affiché avec **Ctrl+Alt+Shift+S** si un clavier est connecté au téléviseur. Vous pouvez également appuyer sur **Play/Pause** ou **Retour** sur la télécommande pour ouvrir le menu de streaming et choisir l'option des statistiques. Il indique le codec audio négocié, la disposition et le nombre de canaux ainsi qu'un débit audio mesuré approximatif, en plus du codec vidéo et des statistiques de streaming existantes. Le codec affiché correspond à la session active, pas seulement à la préférence sélectionnée.

## Autres améliorations propres à ce projet

- **Localisation de l’interface :** l’interface est disponible en anglais, espagnol, allemand, français, italien, russe et portugais brésilien.
- **Menu de streaming accessible depuis la télécommande :** ouvrez le menu de streaming avec **Play/Pause** ou **Retour** sur la télécommande du téléviseur. Vous pouvez également maintenir **Select** enfoncé pendant une seconde sur une manette de jeu, puis le relâcher, pour accéder aux commandes et aux statistiques sans clavier.
- **Superposition de statistiques en temps réel améliorée :** comprend des graphiques en direct de la latence de l’hôte et de la qualité/débit de la connexion, afin d’aider à repérer les pics de latence, une réception dégradée, une bande passante insuffisante et d’autres problèmes de communication.
- **Raccourcis de lancement direct depuis Smart Hub :** lancez directement depuis Smart Hub les applications configurées sur l’hôte distant, sans passer par l’interface habituelle de Moonlight, la vérification des mises à jour ni la découverte des hôtes.
- **Fermer l'application hôte à la déconnexion :** demande facultative, au mieux des possibilités, de fermer l'application hôte après une déconnexion normale. Les échecs de connexion inattendus ne déclenchent pas cette action.
- **Écran de lancement natif animé :** ajoute un écran d'accueil animé pour les démarrages Tizen compatibles.
- **Améliorations des réglages de sortie numérique :** améliore l’état des réglages, le choix des canaux et la navigation à la télécommande lorsque l’option Dolby est activée.
- **Démarrage :** améliore la transition entre l'écran de lancement natif et la liste des hôtes et évite un overlay de chargement plein écran inutile.
- **Améliorations de saisie et d'interface :** améliore la gestion du clavier, le focus et la navigation des paramètres.

- **Thèmes et décorations de l'interface :** permet de choisir différents jeux de couleurs et décorations pour l'interface.
- **Écran de veille :** lorsque le téléviseur reste allumé sans recevoir de flux, un simple logo animé s'affiche afin d'économiser de l'énergie et de protéger l'écran. Le mouvement évite qu'une même forme statique reste illuminée trop longtemps au même endroit.
- **Fonds d'écran animés :** ces arrière-plans facultatifs offrent une apparence et une expérience similaires à celles des consoles de jeux vidéo. Ils donnent à l'interface un aspect de console, même si Moonlight peut aussi servir à d'autres usages, comme des démonstrations commerciales ou un écran secondaire sans fil connecté à un ordinateur. Les fonds animés peuvent être désactivés.
- **Améliorations du traitement audio :** ce projet améliore la gestion des différents codecs audio et permet aussi bien la lecture native que le traitement ou la conversion logicielle, selon les capacités de chaque téléviseur. Cela élargit la compatibilité à davantage de modèles et de configurations audio, même si les résultats et l'expérience finale peuvent varier selon chaque installation.

## Fonctionnalités de base héritées du projet communautaire Moonlight Tizen

- Diffusion de jeux, d'applications et du bureau complet depuis des installations compatibles NVIDIA GameStream ou Sunshine.
- Prise en charge des téléviseurs Samsung exécutant Tizen 5.5 ou ultérieur.
- Décodage vidéo H.264, HEVC et AV1 lorsque le téléviseur et le GPU hôte le permettent.
- Streaming HDR et réglage de la résolution, de la fréquence d'images, du débit et de la plage de couleurs, dans les limites matérielles.
- Découverte et association automatiques des hôtes, avec IPv4, IPv6, noms DNS et ports personnalisés facultatifs.
- Wake-on-LAN, état en ligne/hors ligne des hôtes, tri des applications et gestion des hôtes.
- Saisie clavier, souris et manette, y compris plusieurs manettes, navigation à la manette et émulation facultative de la souris.
- Moteurs de lecture audio EMSS et Web Audio ; les réglages dépendent du moteur choisi.
- Prise en charge de Smart Hub Preview lorsque la version de Tizen le permet.
- Statistiques de streaming, avertissements de connexion et options liées à la latence comme Game Mode lorsque disponible.

## Remarque sur la compatibilité

Moonlight pour Tizen est compatible avec les logiciels hôtes qui utilisent le protocole GameStream ; l'hôte n'a pas besoin de fournir de l'audio Dolby Digital. Toutefois, si vous souhaitez utiliser Dolby Digital, il est préférable que l'hôte puisse fournir nativement de l'AC-3 ou de l'E-AC-3. Une sortie Dolby native évite la conversion OPUS vers Dolby en temps réel sur le client TV, réduit la latence supplémentaire de traitement audio et offre généralement une expérience plus réactive. Si l'hôte ne fournit que de l'OPUS, Moonlight tentera une conversion en temps réel lorsque le téléviseur et les appareils audio connectés le permettent. Pour l'installation, commencez par le [Guide de démarrage rapide](Quick-Start-Guide-fr.html).
