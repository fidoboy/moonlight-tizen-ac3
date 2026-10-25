---
layout: docs-page
lang: de
title: "Häufig gestellte Fragen"
description: "Antworten zu Host-Kompatibilität, Dolby-Audio und Moonlight-Tizen-Einstellungen."
---

# Häufig gestellte Fragen

## Funktioniert dieses Projekt mit Sunshine oder anderen GameStream-kompatiblen Hosts?

Ja. Dieser Moonlight-Client sollte mit dem älteren [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update), [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) und anderen Servern, die dasselbe Protokoll unterstützen, ordnungsgemäß funktionieren. Die Dolby-Erweiterung ist optional. Wenn der Host AC-3/E-AC-3 weder anbietet noch auswählt, bleibt der normale OPUS-Audiopfad des Clients erhalten. Für reine OPUS-Streams ist keine Dolby-spezifische Änderung am Host nötig.

## Wie bekomme ich Dolby Digital 5.1 über den optischen oder HDMI-Ausgang des Fernsehers?

Du benötigst alle folgenden Voraussetzungen:

- Dieses Projekt mit aktiviertem **Enable Dolby Digital**.
- Einen passenden Sunshine-Build mit der `ac3-audio`-Implementierung, einem verfügbaren Dolby-Encoder und dem auf der Audioeinstellungsseite ausgewählten Audioformat (AC-3 oder E-AC-3).
- Einen Fernseher, der den ausgewählten Dolby-Bitstream über seinen optischen oder HDMI-Ausgang durchreichen kann.
- TV-Audioeinstellungen in einem kompatiblen Passthrough-/Bitstream-Modus.
- Einen Receiver oder ein Soundsystem, das AC-3 und die gesendete Kanalbelegung unterstützt.

Wähle für die Ersteinrichtung 5.1 und prüfe in der Statistik-Einblendung die Zeile **Audio stream**. Wenn eine Tastatur mit dem Fernseher verbunden ist, drücke **Ctrl+Alt+Shift+S**, um die Statistik anzuzeigen. Alternativ öffnest du mit **Play/Pause** oder **Zurück** auf der TV-Fernbedienung das Streaming-Menü und wählst dort die Option zum Anzeigen der Statistiken.

## Erzwingt die Aktivierung von Dolby Digital Dolby auf jedem Host?

Nein. Die Option fordert den optionalen Codec bei der Aushandlung an. Wird Dolby nicht angeboten oder vom Host nicht ausgewählt, verwendet Moonlight OPUS. Die aktive Codec-Anzeige in der Statistik-Einblendung ist die zuverlässige Prüfung für die tatsächlich empfangene Sitzung.

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
