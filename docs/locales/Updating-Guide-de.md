---
layout: docs-page
lang: undefined
title: "Aktualisierungsanleitung"
description: "So aktualisierst du Moonlight Tizen auf einem Samsung Smart TV und wählst die richtige Paketvariante."
---

# Aktualisierungsanleitung

## Auf eine neuere Projektversion aktualisieren

1. Öffne die [Releases-Seite](https://github.com/fidoboy/moonlight-tizen-ac3/releases).

2. Lade die neueste Version von **Moonlight.wgt** herunter oder **Moonlight-ForceGM.wgt**, wenn du ausdrücklich diese Variante verwendest.

3. Installiere sie mit derselben Methode wie zuvor (Apps2Samsung, Tizen Studio oder dem verwendeten Gerätewerkzeug).

4. Starte Moonlight und prüfe, ob deine gespeicherten Einstellungen und gekoppelten Hosts weiterhin vorhanden sind.

Verwende nach Möglichkeit dieselbe Paketvariante und dieselbe Signier- bzw. Installationsmethode. Wenn der Fernseher ein Update wegen eines Versions- oder Zertifikatskonflikts ablehnt, lies die [Installationsanleitung](Installation-Guide-de.html).

## Von Brightcraft 1.18.x auf die Versionen 1.0.x dieses Projekts wechseln

Dieses Projekt beginnt eine eigene Versionsreihe bei 1.0.0. Da diese Versionsnummer niedriger ist als die ursprüngliche Version 1.18.x, erlauben manche Fernseher möglicherweise keine Aktualisierung direkt über die vorhandene Installation. In diesem Fall:

1. Notiere die Einstellungen, die du wiederherstellen möchtest.

2. Deinstalliere die alte App über die App-Verwaltung des Fernsehers oder das zuvor verwendete Installationswerkzeug.

3. Installiere das neue Paket dieses Projekts und kopple bzw. konfiguriere die Hosts bei Bedarf erneut.

Durch die Deinstallation können lokal gespeicherte App-Daten verloren gehen. Diese Einschränkung ergibt sich aus der neuen, getrennten Versionsreihe bei gleichbleibender Tizen-Anwendungsidentität; sie bedeutet nicht, dass das WGT fehlerhaft erstellt wurde.

## Experimentelle Builds aktualisieren

Experimentelle WGTs aus GitHub Actions sind temporäre Testartefakte. Lade das Artefakt aus dem jeweiligen Workflow-Lauf herunter, nicht über eine alte zwischengespeicherte URL, und prüfe vor der Installation die Commit-SHA. Gehe nicht davon aus, dass ein experimentelles Artefakt einer stabilen, getaggten Version entspricht.
