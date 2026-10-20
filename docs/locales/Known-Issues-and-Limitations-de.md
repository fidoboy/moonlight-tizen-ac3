---
layout: docs-page
lang: undefined
title: "Bekannte Probleme und Einschränkungen"
description: "Bekannte Kompatibilitätsprobleme und technische Einschränkungen von Moonlight Tizen mit Dolby-Audio-Unterstützung."
---

# Bekannte Probleme und Einschränkungen

## Dolby-Audio über den optischen Ausgang

- Dolby-Passthrough ist eine optionale Erweiterung und erfordert die passende experimentelle Sunshine-Implementierung. Ein Standard-Host, der OPUS sendet, wird weiterhin unterstützt und verwendet weiterhin OPUS.

- AC-3 ist auf 5.1-Kanäle begrenzt. Der passende experimentelle Encoder unterstützt derzeit Stereo und 5.1, aber kein 7.1.

- Die Durchleitung von E-AC-3 über den optischen Ausgang hängt vom TV-Modell, der Firmware, der Ausgangskonfiguration und dem Receiver ab. Gehe nicht davon aus, dass jeder Fernseher E-AC-3 über TOSLINK ausgeben kann.

- Die native Audiopipeline des Fernsehers muss das komprimierte Format akzeptieren. Wenn sie die Initialisierung der Tonspur ablehnt, kann ein Dolby-Stream über diesen Pfad nicht wiedergegeben werden.

- Diese Funktion wurde mit einem bestimmten Samsung-Fernseher und einer bestimmten Audiokette getestet; die Kompatibilität mit allen Kombinationen aus Fernseher und Receiver ist nicht bestätigt.

- Die im Overlay angezeigte Audio-Bitrate ist eine ungefähre gemessene Empfangsrate, weder ein Codec-Aushandlungsfeld noch ein garantierter Encoder-Zielwert.

## Einschränkungen von Tizen und Fernsehern

- Der Client ist für unterstützte Samsung-Fernseher mit Tizen 5.5 oder neuer vorgesehen; die Möglichkeiten unterscheiden sich jedoch je nach Modell und Firmware.

- Game Mode und Optionen für hohe Bildwiederholraten können durch das Betriebssystem oder die Fähigkeiten des Fernsehers eingeschränkt sein, auch wenn eine Einstellung sichtbar ist.

- Einige Fernseher verfügen nur über einen 100-Mbit/s-Ethernetanschluss. Bei hohen Auflösungen oder Bitraten kann stoßweise Frame-Übertragung über kabelgebundenes Ethernet Paketverluste verursachen. Ein zuverlässiges 5-GHz-WLAN kann helfen, Netzwerkprobleme von Host-Problemen zu unterscheiden.

- Videoauflösung, Bildrate, HDR, AV1 und hohe Bitraten hängen vom TV-Decoder und dem Encoder der Host-GPU ab. Nicht unterstützte Kombinationen können auf eine Alternative zurückfallen oder den Start verhindern.

## Unabhängiges Projekt und Release-Status

Dies ist ein unabhängig gepflegtes Projekt mit Funktionen, deren Verhalten von der Hardware abhängt. Die Versionsreihe beginnt bei 1.0.0 und ist unabhängig von den Versionen des [Brightcraft-Basisprojekts](https://github.com/brightcraft/moonlight-tizen). Öffentliche Release-Notizen und bekannte Änderungen findest du auf der [Releases-Seite](https://github.com/fidoboy/moonlight-tizen-ac3/releases) und im [Changelog](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Wenn du ein Problem meldest, gib die genaue Projektversion, das TV-Modell und die Tizen-Version, die Sunshine-Version bzw. den Branch, die Videoeinstellungen, das Audio-Backend, die Kanalauswahl und relevante Protokolle an.
