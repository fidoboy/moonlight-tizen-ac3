---
layout: docs-page
lang: de
title: "Aktualisierungsleitfaden"
description: "Moonlight Tizen aktualisieren und von anderen Builds wechseln."
---

# Aktualisierungsleitfaden

## Auf ein neueres Projekt-Release aktualisieren

1. Öffne die [Release-Seite](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Lade das neueste `Moonlight.wgt` herunter oder `Moonlight-ForceGM.wgt`, wenn du ausdrücklich diese Variante verwendest.
3. Installiere es mit derselben Methode wie zuvor (Apps2Samsung, Tizen Studio oder dem passenden Gerätewerkzeug).
4. Starte Moonlight und prüfe, ob gespeicherte Einstellungen und gekoppelte Hosts noch vorhanden sind.

Verwende nach Möglichkeit dieselbe Paketvariante und Signatur-/Installationsmethode. Verweigert der Fernseher ein Update aufgrund eines Versions- oder Zertifikatskonflikts, lies die [Installationsanleitung](Installation-Guide-de.md).

## Von Brightcrafts Paket 1.18.x auf die 1.0.x-Reihe dieses Projekts wechseln

Dieses Projekt beginnt eine separate Versionsreihe bei 1.0.0. Da diese Nummer unter der Version 1.18.x des ursprünglichen Pakets liegt, erlauben manche Fernseher möglicherweise kein direktes Update. In diesem Fall:

1. Notiere Einstellungen, die du wiederherstellen möchtest.
2. Deinstalliere die alte App mit dem App-Manager des Fernsehers oder dem Installationswerkzeug.
3. Installiere das Paket dieses Projekts und kopple/konfiguriere Hosts bei Bedarf erneut.

Bei einer Deinstallation können lokale App-Daten verloren gehen. Diese Einschränkung ergibt sich aus einer eigenen Versionsreihe bei gleichbleibender Tizen-Anwendungsidentität; sie bedeutet nicht, dass der WGT-Build fehlgeschlagen ist.

## Experimentelle Builds aktualisieren

Experimentelle WGTs aus GitHub Actions sind temporäre Testartefakte. Lade das Artefakt aus dem betreffenden Workflow-Lauf herunter, statt eine alte zwischengespeicherte URL zu verwenden, und prüfe vor der Installation die Commit-SHA. Gehe nicht davon aus, dass ein experimentelles Artefakt einem stabilen, getaggten Release entspricht.
