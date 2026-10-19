---
layout: docs-page
lang: fr
title: "Présentation des fonctionnalités"
description: "Fonctionnalités de Moonlight Tizen, prise en charge audio Dolby et configuration."
---

# Présentation des fonctionnalités

Cette page décrit le projet client Moonlight pour Tizen. La disponibilité dépend du modèle de téléviseur, de la version de Tizen, de la configuration de l'hôte, du réseau et des périphériques connectés.

## Fonction principale par rapport aux autres clients : audio Dolby par sortie optique

La caractéristique principale de ce projet est le passthrough facultatif du Dolby Digital et du Dolby Digital Plus sur les téléviseurs Samsung compatibles reliés à un récepteur ou à un système audio par une connexion optique (TOSLINK).

- **AC-3 (Dolby Digital) :** l'audio compressé stéréo ou 5.1 peut être envoyé au moteur audio EMSS natif de Tizen lorsque l'hôte négocie correctement AC-3.
- **E-AC-3 (Dolby Digital Plus) :** pris en charge lorsque l'hôte, le micrologiciel du téléviseur, la configuration de sortie et l'équipement récepteur acceptent le format. La transmission E-AC-3 par sortie optique n'est pas garantie sur tous les téléviseurs.
- **Stéréo et 5.1 :** l'encodeur expérimental Sunshine correspondant prend en charge la stéréo et le 5.1. AC-3 est limité au 5.1. La sélection 7.1 reste disponible via le chemin audio normal lorsqu'il est pris en charge, mais ne fait pas partie du chemin actuel de l'encodeur Dolby.
- **Négociation facultative :** activez l'option **Enable Dolby Digital** pour demander le chemin Dolby. L'audio Dolby n'est utilisé que si l'hôte annonce et sélectionne un format compatible.
- **Compatibilité OPUS :** si l'hôte n'envoie que de l'OPUS, n'annonce pas l'extension Dolby facultative ou ne sélectionne pas de format Dolby, le client conserve son chemin OPUS habituel. Les hôtes OPUS uniquement n'ont pas besoin de modification.
- **Hôte compatible :** le passthrough Dolby nécessite actuellement la branche expérimentale correspondante [fidoboy/Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio). Le chemin audio normal reste disponible en l'absence de cette fonctionnalité côté hôte.

Le chemin audio optique a été testé de bout en bout avec une version expérimentale de Sunshine, un téléviseur Samsung et un système audio compatible relié en optique. Les résultats peuvent varier selon le modèle, le micrologiciel et le récepteur. Consultez [Problèmes connus et limitations](../Known-Issues-and-Limitations.html#dolby-optical-audio).

## Statistiques du flux audio

L'overlay de performances peut être affiché avec **Ctrl+Alt+Shift+S** si un clavier est connecté au téléviseur. Vous pouvez également appuyer sur **Play/Pause** ou **Retour** sur la télécommande pour ouvrir le menu de streaming et choisir l'option des statistiques. Il indique le codec audio négocié, la disposition et le nombre de canaux ainsi qu'un débit audio mesuré approximatif, en plus du codec vidéo et des statistiques de streaming existantes. Le codec affiché correspond à la session active, pas seulement à la préférence sélectionnée.

## Autres améliorations propres à ce projet

- **Localisation espagnole :** ajoute une traduction d'interface `es-ES` aux langues déjà présentes.
- **Fermer l'application hôte à la déconnexion :** demande facultative, au mieux des possibilités, de fermer l'application hôte après une déconnexion normale. Les échecs de connexion inattendus ne déclenchent pas cette action.
- **Écran de lancement natif animé :** ajoute un écran d'accueil animé pour les démarrages Tizen compatibles.
- **Améliorations des réglages de sortie optique :** améliore l'état des réglages, le choix des canaux et la navigation à la télécommande lorsque Dolby est activé.
- **Démarrage :** améliore la transition entre l'écran de lancement natif et la liste des hôtes et évite un overlay de chargement plein écran inutile.
- **Améliorations de saisie et d'interface :** améliore la gestion du clavier, le focus et la navigation des paramètres.

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

Dolby est une extension facultative et ne remplace pas le protocole de streaming OPUS général. L'hôte Sunshine correspondant doit également être compilé avec l'encodeur Dolby disponible et configuré pour sélectionner AC-3 ou E-AC-3. Pour l'installation, commencez par le [Guide de démarrage rapide](Quick-Start-Guide-fr.html).
