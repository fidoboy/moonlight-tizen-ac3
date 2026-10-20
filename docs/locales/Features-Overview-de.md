---
layout: docs-page
lang: de
title: "Funktionsübersicht"
description: "Moonlight-Tizen-Funktionen, Dolby-Audio-Unterstützung und Konfiguration."
---

# Funktionsübersicht

Diese Seite beschreibt das Projekt des Moonlight-Clients für Tizen. Die Verfügbarkeit hängt vom TV-Modell, der Tizen-Version, der Host-Konfiguration, dem Netzwerk und angeschlossenen Peripheriegeräten ab.

## Wichtigste Zusatzfunktion gegenüber anderen Clients: Dolby-Audio über digitalen Audioausgang

Das zentrale Merkmal dieses Projekts ist die optionale Durchleitung von Dolby Digital und Dolby Digital Plus bei kompatiblen Samsung-Fernsehern, die über den optischen Ausgang (TOSLINK) oder HDMI mit einem Receiver oder Soundsystem verbunden sind.

- **AC-3 (Dolby Digital):** Komprimiertes Stereo- oder 5.1-Audio kann an Tizens nativen EMSS-Audio-Renderer gesendet werden, wenn der Host AC-3 erfolgreich aushandelt.
- **E-AC-3 (Dolby Digital Plus):** Wird unterstützt, wenn Host, TV-Firmware, Audioausgabe-Konfiguration und Empfangsgerät das Format annehmen. E-AC-3 über optische Verbindung ist nicht bei jedem Fernseher garantiert.
- **Stereo und 5.1:** Der passende experimentelle Sunshine-Encoder unterstützt Stereo und 5.1. AC-3 ist auf 5.1 begrenzt. 7.1 bleibt über den normalen Audiopfad verfügbar, sofern unterstützt, gehört aber nicht zum aktuellen Dolby-Encoderpfad.
- **Optionale Aushandlung:** Aktiviere **Enable Dolby Digital**, um den Dolby-Pfad anzufordern. Dolby-Audio wird nur verwendet, wenn der Host ein unterstütztes Format anbietet und auswählt.
- **OPUS-Kompatibilität:** Sendet ein Host nur OPUS, kündigt er die optionale Dolby-Erweiterung nicht an oder wählt kein Dolby-Format, verwendet der Client weiterhin den normalen OPUS-Pfad. Hosts, die nur OPUS unterstützen, müssen nicht geändert werden.
- **Kompatibler Host:** Für Dolby-Passthrough wird derzeit der passende experimentelle Branch [fidoboy/Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) benötigt. Ohne diese Host-Funktion bleibt der normale Audio-Pfad verfügbar.

Der optische Audiopfad wurde vollständig mit einem experimentellen Sunshine-Build, einem Samsung-Fernseher und einem kompatiblen optisch angeschlossenen Soundsystem getestet. Ergebnisse können je nach TV-Modell, Firmware und Receiver abweichen. Siehe [Bekannte Probleme und Einschränkungen](Known-Issues-and-Limitations-de.html#dolby-optical-audio).

## Statistiken zum Audiostream

Die Leistungsanzeige lässt sich mit **Ctrl+Alt+Shift+S** öffnen, wenn eine Tastatur am Fernseher angeschlossen ist. Alternativ kannst du auf der TV-Fernbedienung **Play/Pause** oder **Zurück** drücken, um das Streaming-Menü zu öffnen und die Statistik-Option auszuwählen. Die Anzeige zeigt den ausgehandelten Audiocodec, Kanalbelegung und Kanalanzahl sowie eine ungefähre gemessene Audio-Bitrate zusammen mit Video- und Streamingstatistiken an. Die Codec-Anzeige spiegelt die aktive Sitzung wider, nicht nur die ausgewählte Präferenz.

## Weitere projektspezifische Verbesserungen

- **Lokalisierte Benutzeroberfläche:** Die Oberfläche ist auf Englisch, Spanisch, Deutsch, Französisch, Italienisch, Russisch und brasilianischem Portugiesisch verfügbar.
- **Per Fernbedienung erreichbares Streaming-Menü:** Öffne mit **Play/Pause** oder **Zurück** auf der TV-Fernbedienung das Streaming-Menü, um Streaming-Steuerungen und Statistiken ohne Tastatur aufzurufen.
- **Verbessertes Echtzeit-Statistik-Overlay:** Enthält Live-Diagramme für Host-Latenz und Verbindungsqualität/Durchsatz, die helfen, Latenzspitzen, beeinträchtigten Empfang, unzureichende Bandbreite und andere Kommunikationsprobleme zu erkennen.
- **Direktstart-Verknüpfungen im Smart Hub:** Starte konfigurierte Anwendungen auf dem Remote-Host direkt über Smart Hub und überspringe dabei die übliche Moonlight-Oberfläche, die Updateprüfung und die Host-Erkennung.
- **Host-App bei Verbindungsende schließen:** Optionale bestmögliche Anforderung, die laufende Host-Anwendung nach einer normalen Trennung zu schließen. Unerwartete Verbindungsfehler lösen sie nicht aus.
- **Animierter nativer Startbildschirm:** Ergänzt einen animierten Begrüßungsbildschirm für unterstützte Tizen-Startabläufe.
- **Verbesserungen der Einstellungen für die digitale Audioausgabe:** Optimiert Einstellungsstatus, Kanalauswahl und Fernbedienungsnavigation bei aktivierter Dolby-Option.
- **Startverhalten:** Verbessert den Übergang vom nativen Startbildschirm zur Hostliste und vermeidet eine unnötige Vollbild-Ladeanzeige.
- **Eingabe- und UI-Verbesserungen:** Optimierungen für Tastatur, Fokus und Navigation in den Einstellungen.


## Geerbte Kernfunktionen des Community-Projekts Moonlight Tizen

- Spiele, Anwendungen und den gesamten Desktop von NVIDIA-GameStream-kompatiblen Installationen oder Sunshine streamen.
- Unterstützung für Samsung-Fernseher mit unterstützten Tizen-Versionen (5.5 und neuer).
- H.264-, HEVC- und AV1-Videodekodierung, sofern TV und Host-GPU dies unterstützen.
- HDR-Streaming und konfigurierbare Auflösung, Bildrate, Bitrate und Farbbereich innerhalb der Hardwaregrenzen.
- Automatische Host-Erkennung und Kopplung mit IPv4, IPv6, DNS-Hostnamen und optionalen benutzerdefinierten Ports.
- Wake-on-LAN, Online-/Offline-Status des Hosts, Sortierung von Apps und Hostverwaltung.
- Tastatur-, Maus- und Gamepad-Eingabe, einschließlich Mehrspieler-Gamepads, Gamepad-Navigation und optionaler Maussimulation.
- EMSS- und Web-Audio-Wiedergabe-Backends; die Audioeinstellungen hängen vom ausgewählten Backend ab.
- Smart-Hub-Preview-Unterstützung, sofern die Tizen-Version dies ermöglicht.
- Streamingstatistiken, Verbindungshinweise und latenzbezogene Optionen wie Game Mode, soweit unterstützt.

## Kompatibilitätshinweis

Dolby ist eine optionale Erweiterung und ersetzt das allgemeine OPUS-Streamingprotokoll nicht. Der passende Sunshine-Host muss ebenfalls mit verfügbarem Dolby-Encoder gebaut und für AC-3 oder E-AC-3 konfiguriert sein. Beginne mit dem [Schnellstartleitfaden](Quick-Start-Guide-de.html).
