---
layout: docs-page
lang: it
title: "Domande frequenti"
description: "Risposte sulla compatibilità degli host, l'audio Dolby e le impostazioni di Moonlight Tizen."
---

# Domande frequenti


## Come aggiorno l’app quando è disponibile una nuova versione?

L’app sul televisore La avviserà quando sarà disponibile una nuova versione. Se ha utilizzato il metodo di installazione consigliato tramite Apps2Samsung, Le basta aprire di nuovo Apps2Samsung e selezionare **Moonlight** con la variante **fidoboy · Enhanced · Dolby** per scaricare la versione più recente. Se preferisce installarla manualmente, scarichi il nuovo pacchetto WGT dalla [pagina dell’ultima versione](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) e lo installi sul televisore.

## Come posso ottenere una qualità dell’immagine migliore o configurare Moonlight per uno streaming più stabile?

È consigliabile lasciare attiva l’ottimizzazione automatica del bitrate durante le prime connessioni. Dopo ogni nuova connessione, Moonlight ricalcola il bitrate consigliato in base alle impostazioni e alle caratteristiche negoziate che influiscono sull’utilizzo della banda, così da individuare un valore equilibrato per la propria configurazione. Quando il valore smette di cambiare perché le configurazioni dell’host e di Moonlight rimangono invariate, è possibile usarlo come punto di partenza per le regolazioni manuali: disattiva l’ottimizzazione automatica e aumenta gradualmente il bitrate per provare a migliorare la qualità dell’immagine, utilizzando più banda di rete, oppure riducilo leggermente se le condizioni della rete sono meno favorevoli, accettando una certa perdita di qualità dell’immagine. Il margine di regolazione dipende dalle capacità dell’hardware a entrambe le estremità dello streaming e dalla banda disponibile. Oltre una certa soglia, aumentare il bitrate potrebbe non produrre ulteriori miglioramenti visibili della qualità dell’immagine, anche se la rete è in grado di trasportarlo.

## Questo progetto funziona con Sunshine o altri host compatibili con GameStream?

Sì. Questo client Moonlight dovrebbe funzionare correttamente sia con il precedente [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update) sia con i moderni software host compatibili, come [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) o qualsiasi altro server che utilizzi lo stesso protocollo. Si consiglia di utilizzare Vibeshine perché offre funzionalità avanzate e supporto nativo per l’audio Dolby Digital. Se Dolby Digital è attivato nelle impostazioni di Moonlight, ma l’host non offre il supporto nativo per Dolby Digital, Moonlight tenterà di fornirlo tramite codifica software, quando possibile; in caso contrario, adotterà un approccio basato sul miglior risultato possibile. Se Dolby Digital non può essere utilizzato durante una sessione, Moonlight manterrà la retrocompatibilità e passerà all’audio OPUS standard.

## Come ottenere Dolby Digital 5.1 tramite l'uscita ottica o HDMI del televisore?

Per utilizzare Dolby Digital tramite le uscite audio del televisore, sono necessari:

- Questo progetto con **Enable Dolby Digital** abilitato.
- Un dispositivo audio esterno collegato al televisore, se si desidera utilizzarlo, soprattutto per ottenere l'audio surround 5.1.
- Un televisore in grado di inoltrare l'audio tramite l'uscita ottica o una connessione HDMI ARC/eARC. Il risultato può variare in base al modello del televisore e alla versione di Tizen utilizzata.
- Un ricevitore o sistema audio esterno in grado di decodificare Dolby Digital (AC-3) o Dolby Digital Plus (E-AC-3), se il televisore invia l'audio in uno di questi formati.

Non è necessario che l'host fornisca nativamente uno stream audio Dolby Digital. Moonlight può fornire Dolby Digital tramite la propria gestione audio; il risultato dipende quindi principalmente dalle capacità e dalle impostazioni audio del televisore. Sono supportate sia le connessioni ottiche sia quelle HDMI ARC/eARC.

Per la configurazione iniziale, seleziona 5.1 e controlla la riga **Audio stream** nell'overlay delle statistiche. Puoi lasciare le statistiche attive nella sezione **Impostazioni avanzate** di Moonlight oppure mostrarle manualmente durante lo streaming: apri il menu dello streaming con **Play/Pause** sul telecomando del televisore o tenendo premuto il pulsante **Select** del gamepad, quindi seleziona l'opzione delle statistiche. Se è collegata una tastiera al televisore, puoi mostrare o nascondere direttamente le statistiche con **Ctrl+Alt+Shift+S**.

## L'attivazione di Dolby Digital forza Dolby su tutti gli host?

No. L'opzione richiede il codec opzionale durante la negoziazione. Se Dolby non viene offerto o selezionato dall'host, Moonlight usa OPUS. Il codec attivo mostrato nell'overlay delle statistiche è il modo affidabile per verificare cosa riceve la sessione.

## Dolby Digital Plus funziona sempre su TOSLINK?

No. Il supporto E-AC-3 dipende dal modello di televisore Samsung, dal firmware, dalla modalità di uscita audio e dall'apparecchiatura ricevente. Alcune uscite ottiche dei televisori supportano solo una parte dei formati bitstream. Utilizzi AC-3 se l'apparecchiatura non accetta E-AC-3.

## Il passthrough Dolby può trasportare audio 7.1?

L'implementazione attuale è limitata a stereo e 5.1 canali. E-AC-3 supporta teoricamente il 7.1, ma il percorso di codifica FFmpeg usato da questa build al momento non offre questa opzione. Se FFmpeg aggiungerà il supporto in futuro, potrebbe diventare possibile selezionare il 7.1 per E-AC-3. AC-3 resta limitato a 5.1. Lo streaming OPUS standard può offrire altre disposizioni dei canali se supportate da host e client.

## Come visualizzo il codec audio attivo?

Se è collegata una tastiera al televisore, premi **Ctrl+Alt+Shift+S** per mostrare o nascondere l'overlay delle statistiche. In alternativa, premi **Play/Pause** o **Indietro** sul telecomando per aprire il menu dello streaming, quindi scegli l'opzione per mostrare le statistiche. La riga audio indica il codec negoziato, la disposizione, il numero di canali e il bitrate approssimativo.

## Qual è la differenza tra Moonlight.wgt e Moonlight-ForceGM.wgt?

`Moonlight.wgt` è il pacchetto standard. `Moonlight-ForceGM.wgt` include metadati Game Mode aggiuntivi utili in alcuni casi. Non può aggiungere il supporto Game Mode se la piattaforma non lo prevede.

## Dove trovo le informazioni sul televisore e sull'app?

Nell'app apri Settings e poi About/System Information. Per diagnosticare un problema, annota modello del televisore, versione di Tizen, versione del client e dell'host e impostazioni audio/video selezionate.

## Quali controller posso usare?

La compatibilità dipende dal modello del televisore, dalla versione di Tizen e dal tipo di connessione. Un controller Bluetooth o USB riconosciuto dal televisore è il punto di partenza consigliato. Se non funziona in Moonlight, verifichi prima che il televisore lo riconosca e consulti la [Guida alla risoluzione dei problemi](../Troubleshooting-Guide.html).
