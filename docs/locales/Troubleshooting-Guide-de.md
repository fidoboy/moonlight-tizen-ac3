---
layout: docs-page
lang: de
title: "Leitfaden zur Fehlerbehebung"
description: "Lösungen für häufige Verbindungs-, Audio- und Streamingprobleme mit Moonlight Tizen."
---

# Leitfaden zur Fehlerbehebung

## Moonlight findet den Host nicht

1. Prüfen Sie, ob Sunshine läuft und Fernseher und PC im selben Netzwerk erreichbar sind.
2. Überprüfen Sie die Firewall des Hosts und die Isolationseinstellungen des Routers.
3. Versuchen Sie, den Host über **Host hinzufügen** mit der IPv4-Adresse, IPv6-Adresse oder dem DNS-Hostnamen des PCs hinzuzufügen.
4. Wenn der Host benutzerdefinierte Ports verwendet, stellen Sie sicher, dass diese einheitlich konfiguriert sind.
5. Wenn die Erkennung nur gelegentlich funktioniert, testen Sie eine zuverlässige 5-GHz-WLAN-Verbindung oder Ethernet am Fernseher.

## Die Kopplung schlägt fehl

- Stellen Sie sicher, dass Sie die PIN in der Sunshine-Weboberfläche des richtigen Hosts eingeben.
- Entfernen Sie veraltete Kopplungseinträge nur, wenn Sie den Client anschließend erneut koppeln können.
- Prüfen Sie die Systemzeit und ob eine Firewallregel die Kommunikation zwischen Fernseher und PC blockiert.

## Der Stream startet, aber das Video friert ein, wird schwarz oder verliert Bilder

- Beginnen Sie mit einer niedrigeren Auflösung, 60 FPS und einer moderaten Bitrate.
- Vergewissern Sie sich, dass der ausgewählte Video-Codec sowohl vom Fernseher als auch von der Host-GPU unterstützt wird.
- Aktualisieren Sie GPU-Treiber und Sunshine, falls das Problem auch bei anderen Clients auftritt.
- Wenn kabelgebundenes Ethernet bei hohen Bitraten instabil ist, testen Sie einen anderen Netzwerkpfad. Manche Fernseher haben nur Fast-Ethernet-Ports, auch wenn der Host mit Gigabit-Ethernet verbunden ist.

## Kein Ton oder falsche Kanalbelegung

- Prüfen Sie den Audioausgang des Fernsehers, den Eingang des Receivers, die Lautstärke und die Stummschaltung.
- Testen Sie zuerst den standardmäßigen OPUS-Pfad. Wenn er funktioniert, aktivieren Sie den optischen Ausgang erst beim Testen von Dolby.
- Verwenden Sie zunächst Stereo und wechseln Sie erst zu 5.1, wenn die gesamte TV-/Receiver-Kette dies unterstützt.
- Die aktuelle Dolby-Host-Implementierung unterstützt Stereo und 5.1. Wählen Sie für den Dolby-Encoderpfad nicht 7.1 aus.

## Die Statistiken zeigen OPUS statt AC-3 oder E-AC-3

1. Prüfen Sie, ob **Enable Dolby Digital** in Moonlight aktiviert ist.
2. Stellen Sie sicher, dass auf dem Host der passende [experimentelle Sunshine-Zweig ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) läuft und mit dem optionalen Dolby-Encoder von FFmpeg erstellt wurde.
3. Starten Sie nach Änderungen an den Audioeinstellungen des Hosts einen neuen Stream.
4. Prüfen Sie im Host-Protokoll, ob der erwartete AC-3- oder E-AC-3-Codec und die Bitrate gemeldet werden.
5. Wenn Sunshine Dolby nicht anbietet oder auswählt, ist OPUS der erwartete Kompatibilitäts-Fallback.

Eine aktivierte Einstellung allein beweist nicht, dass ein Dolby-Stream ausgehandelt wurde. Die Audio-Statistik zeigt das in der Sitzung tatsächlich verwendete Format.
