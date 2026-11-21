---
layout: docs-page
lang: de
title: "Funktionsübersicht"
description: "Moonlight-Tizen-Funktionen, Dolby-Audio-Unterstützung und Konfiguration."
---

# Funktionsübersicht

Diese Seite beschreibt das Projekt des Moonlight-Clients für Tizen. Die Verfügbarkeit hängt vom TV-Modell, der Tizen-Version, der Host-Konfiguration, dem Netzwerk und angeschlossenen Peripheriegeräten ab.

## Wichtigste Zusatzfunktion gegenüber anderen Clients: Dolby-Audio über digitalen Audioausgang

Das zentrale Merkmal dieses Projekts ist die optionale Dolby-Digital- und Dolby-Digital-Plus-Audioausgabe bei kompatiblen Samsung-Fernsehern, die über den optischen Ausgang (TOSLINK) oder HDMI mit einem Receiver oder Soundsystem verbunden sind. Anders als bei früheren Versionen muss der Host keinen nativen Dolby-Audiostream bereitstellen.

- **AC-3 (Dolby Digital):** Komprimiertes Stereo- oder 5.1-Audio kann an Tizens nativen EMSS-Audio-Renderer ausgegeben werden, sofern das Format verfügbar ist und von Fernseher und angeschlossenen Geräten unterstützt wird.
- **E-AC-3 (Dolby Digital Plus):** Wird unterstützt, wenn TV-Firmware, Audioausgabe-Konfiguration und Empfangsgerät das Format akzeptieren. E-AC-3 über optische Verbindung ist nicht bei jedem Fernseher garantiert.
- **Dolby-Unterstützung auf dem Host (empfohlen):** Kann der Host AC-3 oder E-AC-3 nativ bereitstellen, kann Moonlight diesen Stream direkt verwenden. Dies wird dringend empfohlen, da dadurch eine Echtzeit-Audiokonvertierung im TV-Client entfällt und somit zusätzliche Audioverarbeitungslatenz reduziert wird. Das verbessert die Reaktionszeit bei Eingaben und die Audioausgabe.
- **Konvertierung von OPUS zu Dolby:** Stellt der Host kein Dolby-Audio bereit, kann er weiterhin OPUS senden. Moonlight für Tizen versucht dann, das eingehende OPUS-Audio in Echtzeit in Dolby Digital umzuwandeln. Dies hängt vom TV-Modell, den Tizen-Audiofunktionen, den gewählten Einstellungen und den angeschlossenen Audiogeräten ab. Dadurch wird die Kompatibilität mit GameStream-Hosts und unterschiedlichen TV-/Audiokonfigurationen erweitert, wobei die Softwarekonvertierung zusätzliche Latenz verursachen kann.
- **Stereo und Surround-Sound:** Die verfügbaren Kanalbelegungen und Dolby-Formate hängen vom eingehenden Stream, vom Konvertierungspfad und von den Fähigkeiten des Fernsehers und Receivers ab. Die AC-3-Ausgabe ist auf 5.1-Kanäle begrenzt.

Der Dolby-Audiopfad wurde mit kompatiblen Samsung-Fernsehern und externen Audiogeräten getestet. Die Ergebnisse können je nach TV-Modell, Firmwareversion und Receiver abweichen. Siehe [Bekannte Probleme und Einschränkungen](Known-Issues-and-Limitations-de.html#dolby-optical-audio).

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

- **Oberflächendesigns und Dekorationen (Version 1.2.4):** Auswahl verschiedener Farbschemata und Oberflächendekorationen.
- **Bildschirmschoner (Version 1.2.4):** zeigt einen Bildschirmschoner an, solange kein Stream empfangen wird.
- **Animierte Hintergrundbilder (Version 1.2.4):** ergänzt animierte Hintergrundoptionen für die Oberfläche.
- **Verbesserte Audioverarbeitung (Version 1.2.4):** verbessert die Verarbeitung und Konvertierung der verschiedenen unterstützten Audioformate.

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

Moonlight für Tizen ist mit Host-Software kompatibel, die das GameStream-Protokoll verwendet; der Host muss kein Dolby-Digital-Audio bereitstellen. Wenn Sie jedoch Dolby Digital nutzen möchten, ist ein Host vorzuziehen, der AC-3 oder E-AC-3 nativ ausgeben kann. Eine native Dolby-Ausgabe vermeidet die Echtzeitkonvertierung von OPUS zu Dolby im TV-Client, reduziert zusätzliche Audioverarbeitungslatenz und sorgt in der Regel für eine reaktionsschnellere Wiedergabe. Wenn der Host nur OPUS bereitstellt, versucht Moonlight die Echtzeitkonvertierung, sofern Fernseher und angeschlossene Audiogeräte dies unterstützen. Beginnen Sie mit dem [Schnellstartleitfaden](Quick-Start-Guide-de.html).
