---
layout: docs-page
lang: de
title: "Bekannte Probleme und Einschränkungen"
description: "Bekannte Einschränkungen bei Dolby-Audio, Tizen und Streaming mit Moonlight Tizen."
---

# Bekannte Probleme und Einschränkungen

## Dolby-Audio über optischen Ausgang

- Dolby-Passthrough ist eine optionale Erweiterung und benötigt die passende experimentelle Sunshine-Implementierung. Ein Standard-Host, der OPUS sendet, bleibt kompatibel, verwendet aber weiterhin OPUS.
- AC-3 ist auf 5.1 Kanäle begrenzt. Der aktuelle passende experimentelle Encoder unterstützt Stereo und 5.1, nicht 7.1.
- E-AC-3-Passthrough über optischen Ausgang hängt von TV-Modell, Firmware, Ausgabekonfiguration und Receiver ab. Gehe nicht davon aus, dass jeder Fernseher E-AC-3 über TOSLINK ausgeben kann.
- Die native Audio-Pipeline des Fernsehers muss das komprimierte Format akzeptieren. Wird die Track-Initialisierung abgelehnt, kann ein Dolby-Stream über diesen Pfad nicht wiedergegeben werden.
- Diese Funktion wurde mit einem bestimmten Samsung-Fernseher und einer bestimmten Audiokette getestet; die Kompatibilität aller TV-/Receiver-Kombinationen ist nicht nachgewiesen.
- Die in der Einblendung angezeigte Audio-Bitrate ist eine ungefähre gemessene Empfangsrate, kein Codec-Aushandlungsfeld und kein garantiertes Encoderziel.

## Tizen- und TV-Einschränkungen

- Der Client zielt auf unterstützte Samsung-Fernseher mit Tizen 5.5 oder neuer, doch die Fähigkeiten unterscheiden sich je nach Modell und Firmware.
- Game Mode und Optionen für hohe Bildwiederholraten können durch das Betriebssystem oder den Fernseher eingeschränkt sein, selbst wenn eine Einstellung sichtbar ist.
- Manche Fernseher besitzen nur einen 100-Mbit/s-Ethernetanschluss. Bei hohen Auflösungen oder Bitraten kann stoßweiser Frame-Verkehr über Ethernet Paketverluste verursachen. Ein Test mit stabilem 5-GHz-WLAN kann helfen, dies von einem Hostproblem zu unterscheiden.
- Videoauflösung, Bildrate, HDR, AV1 und hohe Bitraten hängen vom TV-Decoder und dem GPU-Encoder des Hosts ab. Nicht unterstützte Kombinationen können auf Alternativen zurückfallen oder nicht starten.

## Unabhängiges Projekt und Release-Status

Dieses Projekt wird unabhängig gepflegt und enthält hardwareabhängige Funktionen. Die eigene Versionsreihe beginnt bei 1.0.0 und unterscheidet sich von den Versionen des [Brightcraft](https://github.com/brightcraft/moonlight-tizen)-Basisprojekts. Öffentliche Release-Notizen und bekannte Änderungen findest du auf der [Release-Seite](https://github.com/fidoboy/moonlight-tizen-ac3/releases) und im [Änderungsprotokoll](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Melde bei Problemen die genaue Projektversion, das TV-Modell samt Tizen-Version, Sunshine-Version/Branch, Videoeinstellungen, Audio-Backend, Kanalauswahl und relevante Logs.
