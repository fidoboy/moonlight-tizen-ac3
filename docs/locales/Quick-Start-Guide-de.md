---
layout: docs-page
lang: de
title: "Schnellstartleitfaden"
description: "Erste Schritte mit Moonlight Tizen und GameStream-kompatiblen Hosts."
---

# Schnellstartleitfaden

Dieser Leitfaden beschreibt den kürzesten Weg von der Installation zu einem funktionierenden Stream auf einem Samsung Smart TV.

## 1. Einrichtung prüfen

Du benötigst:

- Einen Samsung Smart TV mit Tizen 5.5 oder neuer.
- Einen PC mit Sunshine oder einem anderen GameStream-kompatiblen Host.
- Eine Host-GPU mit Hardware-Encoding-Unterstützung.
- Eine stabile Netzwerkverbindung zwischen Fernseher und PC. Als Ausgangspunkt empfehlen sich Ethernet am Host und zuverlässiges 5-GHz-WLAN oder Ethernet am Fernseher.
- Ein kompatibles Gamepad, wenn du mit Controller spielen möchtest.

Weitere Informationen findest du unter [Voraussetzungen in der README](../#compatibility).

## 2. Client installieren

Lade das Standardpaket `Moonlight.wgt` von der [Release-Seite](https://github.com/fidoboy/moonlight-tizen-ac3/releases) herunter. Wähle das ForceGM-Paket nur, wenn du ausdrücklich die alternativen Game-Mode-Metadaten benötigst.

Folge der [Installationsanleitung](Installation-Guide-de.html) für Apps2Samsung, Tizen Studio oder eine andere unterstützte Installationsmethode.

## 3. Host konfigurieren und koppeln

1. Installiere und starte Sunshine auf dem Host-PC.
2. Stelle sicher, dass PC und Fernseher im selben Netzwerk kommunizieren können und die Host-Firewall Streamingverbindungen zulässt.
3. Starte Moonlight am Fernseher und wähle den Host aus, sobald er erscheint.
4. Moonlight zeigt eine PIN an. Öffne die Sunshine-Weboberfläche am PC, gib die PIN im Kopplungsbereich ein und bestätige.
5. Wähle ein Spiel oder den Desktop, um das Streaming zu starten.

Beginne bei einer neuen Einrichtung mit vorsichtigen Standardwerten für Auflösung, Bildrate und Bitrate. Erhöhe sie erst, wenn der Stream stabil läuft.

## 4. Dolby-Ausgabe über optischen Anschluss aktivieren (optional)

Dolby-Passthrough benötigt den passenden experimentellen [Sunshine-ac3-audio-Build](https://github.com/fidoboy/Sunshine/tree/ac3-audio). Du kannst den Windows-Build für [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) oder [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip) direkt herunterladen. Zusätzlich sind ein kompatibler TV-Audiopfad und ein Receiver oder Soundsystem erforderlich, das das Format unterstützt.

1. Verbinde den optischen Ausgang des Fernsehers mit dem Receiver oder Soundsystem.
2. Wähle in den TV-Audioeinstellungen einen Ausgabemodus, der einen unterstützten Dolby-Bitstream durchleitet, statt Stereo-PCM zu erzwingen. Die genaue Bezeichnung variiert nach Modell.
3. Aktiviere in den Moonlight-Einstellungen **Enable Dolby Digital** und wähle Stereo oder 5.1.
4. Starte einen Stream und öffne die Leistungsanzeige mit **Ctrl+Alt+Shift+S**. Prüfe, ob die aktive Audiozeile OPUS, AC-3 oder E-AC-3 und die erwartete Kanalbelegung meldet.

Bietet der Host nur OPUS an, verwendet der Stream weiterhin OPUS. Ein aktivierter Client-Schalter kann einen OPUS-only-Host nicht dazu bringen, Dolby-Audio zu senden.

## 5. Stream optimieren

Sobald der erste Stream funktioniert, passe Auflösung, Bildrate, Bitrate, Videocodec und Audioeinstellungen an die Fähigkeiten von Fernseher und Netzwerk an. Weitere Informationen stehen in der [Funktionsübersicht](Features-Overview-de.html) und den [Häufig gestellten Fragen](../Frequently-Asked-Questions.html).
