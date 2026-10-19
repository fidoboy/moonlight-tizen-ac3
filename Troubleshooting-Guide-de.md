---
layout: docs-page
lang: de
title: "Leitfaden zur Fehlerbehebung"
description: "Lösungen für häufige Verbindungs-, Audio- und Streamingprobleme in Moonlight Tizen."
---

# Leitfaden zur Fehlerbehebung

## Moonlight findet den Host nicht

1. Prüfe, ob Sunshine läuft und Fernseher und PC im selben Netzwerk erreichbar sind.
2. Prüfe Host-Firewall und Router-Isolationseinstellungen.
3. Versuche Add Host mit der IPv4-Adresse, IPv6-Adresse oder dem DNS-Hostnamen des PCs.
4. Wenn der Host benutzerdefinierte Ports verwendet, stelle sicher, dass diese auf beiden Seiten konsistent konfiguriert sind.
5. Bei unzuverlässiger Erkennung teste eine stabile 5-GHz-WLAN-Verbindung oder Ethernet am Fernseher.

## Die Kopplung schlägt fehl

- Stelle sicher, dass die PIN in die Sunshine-Weboberfläche des richtigen Hosts eingegeben wird.
- Entferne alte Kopplungseinträge nur, wenn du den Client anschließend erneut koppeln kannst.
- Prüfe die Systemzeit und ob eine Firewall-Regel die Kommunikation zwischen Fernseher und PC blockiert.

## Der Stream startet, aber das Video friert ein, bleibt schwarz oder verliert Frames

- Beginne mit niedrigerer Auflösung, 60 FPS und konservativer Bitrate.
- Prüfe, ob der gewählte Videocodec sowohl vom Fernseher als auch von der Host-GPU unterstützt wird.
- Aktualisiere GPU-Treiber und Sunshine, wenn das Problem auch bei anderen Clients auftritt.
- Ist kabelgebundenes Ethernet bei hohen Bitraten instabil, teste einen anderen Netzwerkpfad. Manche Fernseher besitzen Fast-Ethernet-Ports, obwohl der Host mit Gigabit verbunden ist.

## Kein Audio oder falsche Kanalbelegung

- Prüfe TV-Audioausgang, Receiver-Eingang, Lautstärke und Stummschaltung.
- Teste zuerst den standardmäßigen OPUS-Pfad. Funktioniert er, aktiviere den optischen Ausgang nur zum Dolby-Test.
- Beginne mit Stereo und wechsle erst zu 5.1, wenn die TV-/Receiver-Kette dies unterstützt.
- Die aktuelle Dolby-Host-Implementierung unterstützt Stereo und 5.1. Wähle für den Dolby-Encoderpfad nicht 7.1.

## Die Statistiken zeigen OPUS statt AC-3 oder E-AC-3

1. Prüfe, ob **Enable Dolby Digital** in Moonlight aktiviert ist.
2. Stelle sicher, dass der Host den passenden experimentellen [Sunshine-ac3-audio-Branch](https://github.com/fidoboy/Sunshine/tree/ac3-audio) ausführt und mit verfügbarem optionalem FFmpeg-Dolby-Encoder gebaut wurde.
3. Starte nach einer Änderung der Audioeinstellungen am Host einen neuen Stream.
4. Prüfe im Host-Log, ob der erwartete AC-3- oder E-AC-3-Codec und die Bitrate gemeldet werden.
5. Wenn Sunshine Dolby nicht anbietet oder auswählt, ist OPUS der erwartete Kompatibilitäts-Fallback.

Eine aktivierte Einstellung allein beweist nicht, dass Dolby ausgehandelt wurde. Die Audiozeile in den Statistiken zeigt die aktive Sitzung an.

## Controller oder Fernbedienung funktioniert nicht

- Prüfe, ob der Fernseher den Controller in seinen eigenen Einstellungen erkennt.
- Verbinde den Controller erneut, bevor du Moonlight startest.
- Teste die grundlegende Navigation mit der Fernbedienung in der Hostliste und den Einstellungen, bevor du einen Stream startest.
- Treten Eingabeprobleme nur in einem Spiel auf, vergleiche ein anderes Spiel oder eine andere Anwendung, um spielspezifische Belegungen einzugrenzen.

## Nützliche Diagnoseinformationen sammeln

Notiere Projektversion von Moonlight, TV-Modell/Tizen-Version, Sunshine-Version und Branch, den in den Statistiken angezeigten Codec und die Kanalbelegung, Auflösung/FPS/Bitrate sowie, ob das Problem mit OPUS ebenfalls auftritt. Veröffentliche keine öffentlichen IP-Adressen, PINs, privaten Schlüssel oder andere Geheimnisse.
