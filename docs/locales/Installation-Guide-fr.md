---
layout: docs-page
lang: fr
title: "Guide d'installation"
description: "Méthodes d'installation de Moonlight Tizen sur les téléviseurs Samsung Smart TV."
---

# Guide d'installation

Le client est fourni sous forme de widget Tizen signé (`.wgt`). Choisissez une méthode adaptée à votre téléviseur, votre ordinateur et aux outils de développement Samsung installés.

## Méthode A : installation avec Apps2Samsung

### Avant de commencer

- Téléchargez et lancez la version d'[Apps2Samsung](https://apps2samsung.com/#download) adaptée à votre ordinateur.
- Connectez le téléviseur et l'ordinateur au **même réseau local**. Wi-Fi ou Ethernet convient, à condition que les appareils puissent communiquer.

### 1. Trouver l'adresse IP locale de l'ordinateur

Le téléviseur a besoin de l'adresse IP de l'ordinateur qui exécutera Apps2Samsung. Sous Windows :

1. Appuyez sur **Win + R**, saisissez `cmd`, puis validez.
2. Dans l'invite de commandes, exécutez :

       ipconfig

3. Pour l'adaptateur réseau réellement utilisé (Wi-Fi ou Ethernet), notez **Adresse IPv4**, par exemple `192.168.1.37`.

Utilisez l'adresse IPv4 de l'ordinateur, **pas** la passerelle par défaut, l'adresse IP du téléviseur, `127.0.0.1` ou l'adresse Internet publique. Sous macOS, consultez l'adresse de l'adaptateur actif dans **Réglages Système → Réseau** ; sous Linux, lancez `ip addr` et recherchez l'adresse `inet` de l'interface active. Gardez cette adresse pour l'étape suivante.

### 2. Ouvrir les réglages cachés du mode développeur sur le téléviseur

1. Allumez le téléviseur et appuyez sur **Home** (ou **Smart Hub**) de la télécommande.
2. Ouvrez **Apps**.
3. Sur les interfaces récentes, accédez à **App Settings** (généralement une icône d'engrenage en bas de l'écran Apps) et ouvrez-la. Sur certains modèles plus anciens, le code peut être saisi directement depuis l'écran Apps.
4. Lorsque Apps/App Settings est affiché, saisissez exactement la séquence suivante :

   **1 → 2 → 3 → 4 → 5**

   **Saisir les chiffres**

   - **Télécommande avec pavé numérique physique :** appuyez successivement sur les touches 1, 2, 3, 4 et 5.
   - **Samsung Smart Remote sans touches numériques :** appuyez sur **123** (parfois nommé **123/Color** ou symbolisé par **…**) pour afficher le pavé numérique à l'écran. Utilisez la bague directionnelle pour sélectionner chaque chiffre et appuyez au centre sur **OK/Select**. Répétez jusqu'à saisir 12345.

   Le schéma ci-dessous montre les deux méthodes. Cinq touches numériques physiques ne sont pas nécessaires avec le clavier à l'écran.

   ![Saisie du code du mode développeur avec une télécommande standard ou une Samsung Smart Remote](../assets/developer-mode-number-pad.svg)

5. Une boîte de dialogue **Developer Mode** doit apparaître. Réglez **Developer Mode** sur **On**.
6. Dans **Host PC IP** (ou un champ au nom similaire), saisissez l'adresse IPv4 de l'ordinateur relevée à l'étape 1.
7. Sélectionnez **OK** et acceptez le redémarrage du téléviseur.

> [!IMPORTANT]
> Cette procédure concerne les **Samsung Smart TV sous Tizen**. D'autres fabricants utilisent aussi des plateformes TV basées sur Tizen, mais leurs menus et leur prise en charge de l'installation en mode développeur peuvent différer.

> [!TIP]
> Après le redémarrage, retournez dans **Apps**. De nombreux téléviseurs Samsung affichent un indicateur **Develop Mode** en haut de l'écran, confirmant son activation. Pour des captures propres au modèle, consultez le [guide officiel Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) ; la [FAQ d'Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv) explique également la saisie du code avec une Smart Remote.

### 3. Installer Moonlight depuis le catalogue Apps2Samsung

1. Ouvrez Apps2Samsung sur l'ordinateur.
2. Sélectionnez le téléviseur lorsqu'il apparaît dans les résultats de recherche. S'il n'est pas détecté automatiquement, saisissez son adresse IP manuellement si l'option est disponible.
3. Ouvrez le catalogue d'applications et recherchez **Moonlight**.
4. Sélectionnez **Moonlight**, puis la variante **fidoboy · Enhanced · Dolby** ou, si votre modèle de téléviseur l'exige, **fidoboy · Enhanced · Dolby · ForceGM**.
5. Lancez l'installation avec **Download & Install** et attendez la confirmation de réussite d'Apps2Samsung. L'outil télécharge et prépare lui-même le paquet.
6. Ouvrez l'écran **Apps** du téléviseur et lancez Moonlight.

**C'est la méthode recommandée.** Il n'est pas nécessaire de visiter GitHub Releases ni de télécharger `Moonlight.wgt` manuellement. Lors de la première utilisation, Apps2Samsung peut demander une connexion au compte Samsung afin de créer un certificat de signature. Suivez les indications et laissez la sélection du certificat en mode automatique/par défaut, sauf si l'outil exige un autre type. Il n'est pas nécessaire de configurer manuellement les certificats dans Seller Office.

> [!WARNING]
> **N'installez un WGT manuellement que si la méthode du catalogue échoue.** Téléchargez `Moonlight.wgt` depuis la [dernière version stable](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest). Dans Apps2Samsung, choisissez **Custom WGT / TPK**, sélectionnez le fichier téléchargé et lancez l'installation. N'utilisez cette solution de repli qu'en cas de besoin. Pour la variante ForceGM, téléchargez plutôt `Moonlight-ForceGM.wgt` depuis la même page.

### Dépannage

- **La boîte de dialogue Developer Mode n'apparaît pas :** assurez-vous d'être sur l'écran Apps ou App Settings si votre modèle le propose. Saisissez `12345` à cet endroit, pas dans les réglages habituels du téléviseur. Sur une Smart Remote, affichez d'abord le pavé à l'écran avec **123** ou la touche virtuelle équivalente.
- **Apps2Samsung ne trouve pas le téléviseur ou ne peut pas s'y connecter :** vérifiez que Developer Mode est activé, que les appareils sont sur le même réseau local et que Host PC IP correspond exactement à l'adresse IPv4 actuelle de l'ordinateur. Un Wi-Fi invité ou l'isolation des clients du routeur peut empêcher la communication.
- **Toujours aucune connexion après redémarrage :** débranchez complètement le téléviseur, attendez 10 à 15 secondes, rebranchez-le et réessayez. Cela peut aider sur les modèles où la connexion développeur ne s'est pas correctement ouverte.
- **Échec dû à une incompatibilité de signature/certificat :** suivez le message d'Apps2Samsung. Si vous passez de l'application de base Brightcraft, consultez [Passer depuis l'application de base Brightcraft](#passer-depuis-lapplication-de-base-brightcraft) ci-dessous avant de désinstaller quoi que ce soit.

## Méthode B : Tizen Studio

Tizen Studio est l'environnement officiel de développement Samsung/Tizen, utile aux développeurs et aux diagnostics avancés.

1. Installez Tizen Studio et les outils TV correspondant à la version Tizen cible.
2. Activez Developer Mode sur le téléviseur et notez son adresse IP.
3. Dans Device Manager, connectez-vous au téléviseur.
4. Configurez un profil de certificat accepté par le téléviseur et signez le WGT comme demandé par Tizen Studio.
5. Installez le paquet via les outils Tizen de packaging/déploiement ou l'IDE.

Consultez la documentation Samsung actuelle pour installer Tizen Studio et configurer les certificats TV, car les procédures varient selon le SDK et le système d'exploitation.

## Compiler le paquet

Le [Guide de développement](Development-Guide-fr.html) décrit la compilation du WGT avec le Dockerfile fourni. Les builds Docker sont utiles pour tester une révision exacte du code source ou les deux variantes du paquet.

## Passer depuis l'application de base Brightcraft

La série de versions indépendante commence à 1.0.0, tandis que l'application de base utilisait une version supérieure, 1.18.x. Tizen peut donc refuser un retour en arrière direct ou traiter différemment la signature du paquet. En cas d'échec, désinstallez l'application précédente avant d'installer ce projet. La désinstallation peut supprimer les données locales de l'application ; notez donc vos réglages et hôtes au préalable. Pour plus de détails, consultez le [guide de mise à jour](Updating-Guide-fr.html).

## Premier lancement

Lancez Moonlight depuis l'écran Apps du téléviseur, autorisez la découverte sur le réseau local puis associez l'hôte PC. S'il n'apparaît pas automatiquement, utilisez Add Host et saisissez son adresse IP ou son nom DNS. Consultez le [Guide de démarrage rapide](Quick-Start-Guide-fr.html).
