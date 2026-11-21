---
layout: docs-page
lang: de
title: "Häufig gestellte Fragen"
description: "Antworten zu Host-Kompatibilität, Dolby-Audio und Moonlight-Tizen-Einstellungen."
---

# Häufig gestellte Fragen


## Wie aktualisiere ich die App, wenn eine neue Version verfügbar ist?

Die App auf Ihrem Fernseher benachrichtigt Sie, sobald eine neue Version verfügbar ist. Wenn Sie die empfohlene Installationsmethode über Apps2Samsung verwendet haben, öffnen Sie Apps2Samsung einfach erneut und wählen Sie **Moonlight** mit der Variante **fidoboy · Enhanced · Dolby**, um die neueste Version herunterzuladen. Wenn Sie die App lieber manuell installieren, laden Sie das neue WGT-Paket von der [Seite mit der neuesten Veröffentlichung](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) herunter und installieren Sie es auf Ihrem Fernseher.

## Wie kann ich eine bessere Bildqualität erzielen oder Moonlight für einen stabileren Stream konfigurieren?

Am besten lassen Sie die automatische Bitratenoptimierung während der ersten Verbindungen aktiviert. Nach jeder neuen Verbindung berechnet Moonlight die empfohlene Bitrate anhand der Einstellungen und ausgehandelten Eigenschaften neu, die den Bandbreitenbedarf beeinflussen. So kann ein ausgewogener Wert für Ihre Konfiguration ermittelt werden. Sobald sich dieser Wert nicht mehr ändert, weil die Konfigurationen von Host und Moonlight gleich bleiben, können Sie ihn als Ausgangspunkt für manuelle Anpassungen verwenden: Deaktivieren Sie die automatische Optimierung und erhöhen Sie die Bitrate schrittweise, um die Bildqualität zu verbessern und dafür mehr Netzwerkbandbreite zu nutzen, oder verringern Sie sie etwas, wenn die Netzwerkbedingungen ungünstiger sind, wobei Sie eine gewisse Einbuße bei der Bildqualität in Kauf nehmen müssen. Wie weit Sie die Bitrate anpassen können, hängt von den Fähigkeiten der Hardware an allen beteiligten Endpunkten sowie von der verfügbaren Netzwerkbandbreite ab. Ab einem bestimmten Punkt führt eine weitere Erhöhung möglicherweise zu keiner wahrnehmbaren Verbesserung der Bildqualität mehr, selbst wenn das Netzwerk die höhere Bitrate übertragen kann.

## Funktioniert dieses Projekt mit Sunshine oder anderen GameStream-kompatiblen Hosts?

Ja. Dieser Moonlight-Client sollte sowohl mit dem älteren [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update) als auch mit moderner kompatibler Host-Software wie [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) oder jedem anderen Server funktionieren, der dasselbe Protokoll verwendet. Vibeshine wird empfohlen, da es erweiterte Funktionen und native Dolby-Digital-Audiounterstützung bietet. Wenn Dolby Digital in den Moonlight-Einstellungen aktiviert ist, der Host jedoch keine native Dolby-Digital-Unterstützung bietet, versucht Moonlight, Dolby Digital nach Möglichkeit per Software-Encoding bereitzustellen; andernfalls wird eine Best-Effort-Strategie verwendet. Kann Dolby Digital bei einer Übertragung nicht verwendet werden, bleibt Moonlight abwärtskompatibel und wechselt zum standardmäßigen OPUS-Audio.

## Wie bekomme ich Dolby Digital 5.1 über den optischen oder HDMI-Ausgang des Fernsehers?

Um Dolby Digital über die Audioausgänge des Fernsehers zu nutzen, benötigen Sie Folgendes:

- Dieses Projekt mit aktiviertem **Enable Dolby Digital**.
- Ein externes Audiogerät, das an den Fernseher angeschlossen ist, wenn Sie ein solches verwenden möchten – insbesondere für 5.1-Surround-Sound.
- Einen Fernseher, der Audio über seinen optischen Ausgang oder HDMI ARC/eARC durchleiten kann. Das Ergebnis kann je nach TV-Modell und verwendeter Tizen-Version unterschiedlich ausfallen.
- Einen externen Receiver oder ein Soundsystem, das Dolby Digital (AC-3) oder Dolby Digital Plus (E-AC-3) decodieren kann, falls der Fernseher das Audiosignal in einem dieser Formate ausgibt.

Der Host muss keinen nativen Dolby-Digital-Audiostream bereitstellen. Moonlight kann Dolby Digital über seine eigene Audioverarbeitung bereitstellen. Das Ergebnis hängt daher hauptsächlich von den Fähigkeiten und Audioeinstellungen des Fernsehers ab. Optische Verbindungen sowie HDMI ARC/eARC werden unterstützt.

Wählen Sie für die Ersteinrichtung 5.1 und prüfen Sie in der Statistik-Einblendung die Zeile **Audio stream**. Sie können die Statistiken in den **Erweiterten Einstellungen** von Moonlight dauerhaft aktivieren oder sie während einer Übertragung manuell einblenden: Öffnen Sie das Streaming-Menü mit **Play/Pause** auf der TV-Fernbedienung oder indem Sie die **Select**-Taste des Gamepads gedrückt halten, und wählen Sie anschließend die Statistik-Anzeige. Wenn eine Tastatur mit dem Fernseher verbunden ist, können Sie die Statistiken direkt mit **Ctrl+Alt+Shift+S** ein- oder ausblenden.

## Erzwingt die Aktivierung von Dolby Digital Dolby auf jedem Host?

Nein. Die Option fordert Dolby Digital bei der Aushandlung des Streams an, zwingt jedoch nicht jeden Host dazu, dieses Format bereitzustellen. Wenn Dolby Digital nicht angeboten wird oder der Host es nicht auswählen bzw. bereitstellen kann, verwendet Moonlight OPUS oder den bestmöglichen kompatiblen Audioausgabepfad. Die Statistik-Einblendung liefert die ausführlichsten Informationen zum für den Stream ausgehandelten Audioformat und kann optional aktiviert werden. Noch zuverlässiger lässt sich die tatsächliche Ausgabe am externen Receiver oder Soundsystem überprüfen, sofern dieses über ein Display oder eine Anzeige-LED verfügt, die bei Empfang eines Dolby-Digital-Signals aufleuchtet. So können Sie feststellen, ob die tatsächlich ausgegebene Audioübertragung den in Moonlight gewählten Einstellungen entspricht. Letztlich hängt der Erfolg vom Zusammenspiel der Fähigkeiten des Hosts, des TV-Modells und seiner Audioverarbeitung sowie der Eigenschaften des externen Audiogeräts ab.

## Funktioniert Dolby Digital Plus immer über TOSLINK?

Nein. E-AC-3 hängt vom Samsung-TV-Modell, der Firmware, dem Audio-Ausgabemodus und dem Empfangsgerät ab. Manche optischen TV-Ausgänge unterstützen nur eine Teilmenge von Bitstream-Formaten. Nutze AC-3, wenn das Gerät E-AC-3 nicht annimmt.

## Kann Dolby-Passthrough 7.1-Audio übertragen?

Die aktuelle Implementierung ist auf Stereo und 5.1-Kanäle begrenzt. E-AC-3 unterstützt theoretisch 7.1, aber der in diesem Build verwendete FFmpeg-Encoderpfad bietet diese Option derzeit nicht an. Falls FFmpeg die Unterstützung künftig ergänzt, könnte 7.1 für E-AC-3 auswählbar werden. AC-3 bleibt auf 5.1 begrenzt. Standardmäßiges OPUS-Streaming kann andere Kanalbelegungen anbieten, wenn Host und Client sie unterstützen.

## Wie sehe ich den aktiven Audiocodec?

Wenn eine Tastatur mit dem Fernseher verbunden ist, drücken Sie **Ctrl+Alt+Shift+S**, um die Statistik-Einblendung ein- oder auszublenden. Alternativ öffnen Sie mit **Play/Pause** oder **Zurück** auf der TV-Fernbedienung das Streaming-Menü und wählen dort die Option zum Anzeigen der Statistiken. Die Audiozeile zeigt den ausgehandelten Codec, die Kanalbelegung, Kanalanzahl und ungefähre Bitrate.

## Was ist der Unterschied zwischen Moonlight.wgt und Moonlight-ForceGM.wgt?

`Moonlight.wgt` ist das Standardpaket. `Moonlight-ForceGM.wgt` enthält zusätzliche Game-Mode-Metadaten für Fälle, in denen diese Variante nützlich ist. Sie kann fehlende Game-Mode-Unterstützung der Plattform nicht umgehen.

## Wo finde ich Informationen zum Fernseher und zur App?

Öffne in der App Settings und dann About/System Information. Notiere bei der Fehlersuche TV-Modell, Tizen-Version, Client- und Host-Version sowie die ausgewählten Video-/Audioeinstellungen.

## Welche Controller kann ich verwenden?

Die Controller-Kompatibilität hängt vom TV-Modell, der Tizen-Version und der Verbindung ab. Ein Bluetooth- oder USB-Gamepad, das vom Fernseher erkannt wird, ist der beste Ausgangspunkt. Wenn ein Controller in Moonlight nicht funktioniert, prüfe zuerst, ob der Fernseher ihn erkennt, und lies den [Leitfaden zur Fehlerbehebung](../Troubleshooting-Guide.html).
