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

## Wie sehe ich die aktiven Video- und Audiocodecs?

Wenn eine Tastatur mit dem Fernseher verbunden ist, drücken Sie **Ctrl+Alt+Shift+S**, um die Statistik-Einblendung ein- oder auszublenden. Alternativ können Sie **Play/Pause** auf der TV-Fernbedienung drücken oder die **Select**-Taste des Gamepads eine Sekunde lang gedrückt halten und anschließend loslassen, um das Streaming-Menü zu öffnen. Wählen Sie dort die Option zum Anzeigen der Statistiken.

Die Stream-Zeilen in der Einblendung zeigen mehr als nur die ausgehandelten Codec-Namen:

- **Video-Stream:** Zeigt die Stream-Auflösung und Bildrate sowie den ausgehandelten Videocodec. Bei H.264 kann zusätzlich das Level angegeben sein (zum Beispiel **H.264 L4.1**). Dabei handelt es sich um das für Auflösung und Bildrate des Streams ausgewählte H.264-Level, nicht um das H.264-Baseline-Profil. Wenn HDR aktiviert und erfolgreich mit dem Host ausgehandelt wurde, erscheint **HEVC 10-bit HDR** oder **AV1 10-bit HDR**. Wird der entsprechende 10-Bit-Codec als **SDR** angezeigt, wurde HDR für diesen Stream nicht ausgehandelt.
- **Audio-Stream:** Zeigt den ausgehandelten Audiocodec (OPUS, AC-3 oder E-AC-3), das Kanal-Layout und die Kanalanzahl sowie die aktuell empfangene Bitrate. Diese wird während des Streams gemessen und kann schwanken; sie muss nicht dauerhaft dem anfangs mit dem Host ausgehandelten Wert entsprechen. Die Kennzeichnung **[Hardware]** oder **[Software]** gibt den aktiven Audioverarbeitungspfad an. **[Hardware]** bedeutet, dass der Fernseher die Dekodierung mit seiner nativen Hardware-Unterstützung übernimmt. Dies ist in der Regel vorzuziehen, da Moonlight dadurch keine Softwaredekodierung ausführen muss und die Latenz möglichst gering bleibt. **[Software]** bedeutet, dass Moonlight vor der Ausgabe an den Fernseher eine softwarebasierte Dekodierung oder Formatkonvertierung/Transkodierung durchführt, wodurch zusätzliche Verarbeitungslatenz entstehen kann.
- **HQ-Anzeige:** Wenn Audio in hoher Qualität angefordert wurde, kann neben dem Codec ein hochgestelltes **HQ** erscheinen. Grün bedeutet, dass der Host den aktiven Hochqualitätsmodus bestätigt hat. Weiß bedeutet, dass die Anforderung gesendet wurde, Moonlight anhand der Host-Antwort jedoch nicht bestätigen konnte, dass dieser Modus tatsächlich verwendet wird.
- **Audioeingang / Audiotranscodierung:** Wenn Moonlight Audiodaten vor der Ausgabe an den Fernseher per Software verarbeitet oder in ein anderes Format umwandelt, zeigen zusätzliche Zeilen die Bitrate des eingehenden Audiostreams und die durchschnittliche Verarbeitungsdauer pro Audiosegment an. Dies kann vorkommen, wenn der Fernseher das Eingangsformat nicht nativ unterstützt, wenn Moonlight OPUS in PCM, AC-3 oder E-AC-3 umwandelt oder wenn eingehendes AC-3 bzw. E-AC-3 aufgrund der Fähigkeiten des Fernsehers oder der gewählten Audioeinstellungen in ein anderes Format, beispielsweise PCM, umgewandelt wird. Die angegebene Zeit zeigt die Verarbeitungsverzögerung dieses softwarebasierten Audiopfads.
- **Audio-FEC:** Zeigt, wie viele Audiopakete im letzten Messintervall wiederhergestellt wurden, wie viele FEC-Blöcke fehlgeschlagen sind und wie viele Pakete in falscher Reihenfolge eingetroffen sind.

Die Zeile **Bildraten** gibt zusätzlich die pro Sekunde empfangenen, dekodierten und vom Renderer akzeptierten Frames an. **Eingehende Netzwerk-Bitrate** zeigt die tatsächlich über das Netzwerk eingehende Gesamtbitrate. Dieser Wert kann während des Streams schwanken und muss nicht dem anfangs ausgehandelten Wert entsprechen. Weitere Statistiken zeigen die Netzwerklatenz, fehlende Frames, die durchschnittliche Dekodierungszeit, die Verzögerung in der Frame-Warteschlange und die Zeit für die Übergabe an den Renderer.

## Wo finde ich Informationen zum Fernseher und zur App?

Öffne in der App Einstellungen und dann Über > Systeminformationen. Notiere bei der Fehlersuche TV-Modell, Tizen-Version, Client- und Host-Version sowie die ausgewählten Video-/Audioeinstellungen.

Wenn du ein Problem melden oder einen Vorschlag einreichen möchtest, verwende den [GitHub-Issue-Tracker](https://github.com/fidoboy/moonlight-tizen-ac3/issues).

## Welche Controller kann ich verwenden?

Die Controller-Kompatibilität hängt vom TV-Modell, der Tizen-Version und der Verbindung ab. Ein Bluetooth- oder USB-Gamepad, das vom Fernseher erkannt wird, ist der beste Ausgangspunkt. Wenn ein Controller in Moonlight nicht funktioniert, prüfe zuerst, ob der Fernseher ihn erkennt, und lies den [Leitfaden zur Fehlerbehebung](../Troubleshooting-Guide.html).
