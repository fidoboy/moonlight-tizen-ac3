---
layout: docs-page
lang: de
title: "Leitfaden zur Fehlerbehebung"
description: "Lösungen für häufige Verbindungs-, Audio- und Streamingprobleme mit Moonlight Tizen."
---

# Leitfaden zur Fehlerbehebung

## Apps2Samsung zeigt den Fernseher nicht in der Liste an

1. Prüfen Sie, ob der **Developer Mode (Entwicklermodus)** am Samsung-Fernseher aktiviert ist. Drücken Sie **Home**, öffnen Sie **Apps** und anschließend **App Settings** (meist das Zahnradsymbol). Bei einigen älteren Modellen können Sie den Code eingeben, während der Apps-Bildschirm geöffnet ist.
2. Geben Sie **12345** über die Zifferntasten der Fernbedienung ein. Hat Ihre Smart Remote keine Zifferntasten, öffnen Sie mit der Taste **123** die Bildschirmtastatur und geben Sie die Ziffern dort ein. Wenn der Dialog **Developer Mode** erscheint, schalten Sie den Entwicklermodus **On**.
3. Geben Sie unter **Host PC IP** die lokale IPv4-Adresse des Computers ein, auf dem Apps2Samsung läuft. Sie muss exakt mit der aktuellen Adresse dieses Computers übereinstimmen. Verwenden Sie die IPv4-Adresse des aktiven WLAN- oder Ethernet-Adapters—nicht die IP-Adresse des Fernsehers, das Router-Gateway, `127.0.0.1` oder die öffentliche Internetadresse. Speichern Sie die Einstellung und starten Sie den Fernseher neu.
4. Vergewissern Sie sich, dass Fernseher und Computer im selben lokalen Netzwerk sind, und suchen Sie in Apps2Samsung erneut nach dem Fernseher. Gast-WLAN oder Client-Isolation im Router können die Verbindung verhindern.

Weitere Informationen finden Sie in der [Installationsanleitung](Installation-Guide-de.html) und in Samsungs [offizieller TV-Device-Anleitung](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

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
2. Stellen Sie sicher, dass auf dem Host der passende [experimentelle Sunshine-Build](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826) mit dem optionalen Dolby-Encoder von FFmpeg läuft. Öffnen Sie in Sunshine **Settings → Audio/Video** und wählen Sie im Dropdown für das Streaming-Audioformat **AC-3 (Dolby Digital)** oder **E-AC-3 (Dolby Digital Plus)** aus. Wenn Sie stattdessen Vibeshine verwenden, nutzen Sie die [Vibeshine-Nightly-Version](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d) oder eine neuere Nightly-Version.
3. Starten Sie nach Änderungen an den Audioeinstellungen des Hosts einen neuen Stream.
4. Prüfen Sie im Host-Protokoll, ob der erwartete AC-3- oder E-AC-3-Codec und die Bitrate gemeldet werden.
5. Wenn Sunshine Dolby nicht anbietet oder auswählt, ist OPUS der erwartete Kompatibilitäts-Fallback.

Eine aktivierte Einstellung allein beweist nicht, dass ein Dolby-Stream ausgehandelt wurde. Die Audio-Statistik zeigt das in der Sitzung tatsächlich verwendete Format.

## Nützliche Diagnoseinformationen sammeln

Die Moonlight-App-Version, das TV-Modell und die Tizen-OS-Version werden in Moonlight unter **Einstellungen → Info** (*Settings → About*) angezeigt. Öffnen Sie diesen Bildschirm, um diese Angaben zu erfassen. Notieren Sie außerdem die Sunshine-Version und den Branch, den in der Streaming-Statistik angezeigten Codec und die Kanalbelegung, die Auflösung/FPS/Bitrate sowie, ob das Problem auch mit OPUS auftritt. Erstellen Sie anschließend ein [GitHub-Issue](https://github.com/fidoboy/moonlight-tizen-ac3/issues) und fügen Sie die relevanten Informationen hinzu. Veröffentlichen Sie keine öffentlichen IP-Adressen, PINs, privaten Schlüssel oder andere Geheimnisse.
