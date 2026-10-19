---
layout: docs-page
lang: it
title: "Domande frequenti"
description: "Risposte sulla compatibilità degli host, l'audio Dolby e le impostazioni di Moonlight Tizen."
---

# Domande frequenti

## Questo progetto funziona con Sunshine o altri host compatibili con GameStream?

Sì. Questo client Moonlight dovrebbe funzionare correttamente con il precedente NVIDIA GameStream, Sunshine, Apollo, Punktfunk e altri server compatibili con lo stesso protocollo. L'estensione Dolby è facoltativa. Se l'host non annuncia o non seleziona AC-3/E-AC-3, il client mantiene il normale percorso OPUS. Non sono necessarie modifiche specifiche Dolby all'host per uno streaming solo OPUS.

## Come ottenere Dolby Digital 5.1 tramite l'uscita ottica o HDMI del televisore?

Sono necessari tutti questi elementi:

- Questo progetto con **Enable Dolby Digital** abilitato.
- Una build Sunshine corrispondente con l'implementazione `ac3-audio`, un encoder Dolby disponibile e il formato audio (AC-3 o E-AC-3) selezionato nella pagina delle impostazioni audio.
- Un televisore in grado di inoltrare il bitstream Dolby selezionato tramite l'uscita ottica o HDMI.
- Impostazioni audio del televisore configurate in una modalità passthrough/bitstream compatibile.
- Un ricevitore o sistema audio che supporti AC-3 e la disposizione dei canali inviata.

Per la configurazione iniziale, scegli 5.1 e controlla la riga **Audio stream** nell'overlay delle statistiche. Se è collegata una tastiera al televisore, premi **Ctrl+Alt+Shift+S** per mostrare le statistiche. In alternativa, premi **Play/Pause** o **Indietro** sul telecomando per aprire il menu dello streaming, quindi scegli l'opzione per mostrare le statistiche.

## L'attivazione di Dolby Digital forza Dolby su tutti gli host?

No. L'opzione richiede il codec opzionale durante la negoziazione. Se Dolby non viene offerto o selezionato dall'host, Moonlight usa OPUS. Il codec attivo mostrato nell'overlay delle statistiche è il modo affidabile per verificare cosa riceve la sessione.

## Dolby Digital Plus funziona sempre su TOSLINK?

No. Il supporto E-AC-3 dipende dal modello di televisore Samsung, dal firmware, dalla modalità di uscita audio e dall'apparecchiatura ricevente. Alcune uscite ottiche dei televisori supportano solo una parte dei formati bitstream. Usa AC-3 se l'apparecchiatura non accetta E-AC-3.

## Il passthrough Dolby può trasportare audio 7.1?

L'implementazione attuale è limitata a stereo e 5.1 canali. E-AC-3 supporta teoricamente il 7.1, ma il percorso di codifica FFmpeg usato da questa build al momento non offre questa opzione. Se FFmpeg aggiungerà il supporto in futuro, potrebbe diventare possibile selezionare il 7.1 per E-AC-3. AC-3 resta limitato a 5.1. Lo streaming OPUS standard può offrire altre disposizioni dei canali se supportate da host e client.

## Come visualizzo il codec audio attivo?

Se è collegata una tastiera al televisore, premi **Ctrl+Alt+Shift+S** per mostrare o nascondere l'overlay delle statistiche. In alternativa, premi **Play/Pause** o **Indietro** sul telecomando per aprire il menu dello streaming, quindi scegli l'opzione per mostrare le statistiche. La riga audio indica il codec negoziato, la disposizione, il numero di canali e il bitrate approssimativo.

## Qual è la differenza tra Moonlight.wgt e Moonlight-ForceGM.wgt?

`Moonlight.wgt` è il pacchetto standard. `Moonlight-ForceGM.wgt` include metadati Game Mode aggiuntivi utili in alcuni casi. Non può aggiungere il supporto Game Mode se la piattaforma non lo prevede.

## Dove trovo le informazioni sul televisore e sull'app?

Nell'app apri Settings e poi About/System Information. Per diagnosticare un problema, annota modello del televisore, versione di Tizen, versione del client e dell'host e impostazioni audio/video selezionate.

## Quali controller posso usare?

La compatibilità dipende dal modello del televisore, dalla versione di Tizen e dal tipo di connessione. Un controller Bluetooth o USB riconosciuto dal televisore è il punto di partenza consigliato. Se non funziona in Moonlight, verifica prima che il televisore lo riconosca e consulta la [Guida alla risoluzione dei problemi](../Troubleshooting-Guide.html).
