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

No. L'opzione richiede Dolby Digital durante la negoziazione dello streaming, ma non obbliga tutti gli host a fornirlo. Se Dolby Digital non viene offerto oppure l'host non è in grado di selezionarlo o fornirlo, Moonlight utilizza OPUS o il percorso audio compatibile disponibile. L'overlay delle statistiche fornisce le informazioni più dettagliate sul formato audio negoziato per la sessione e può essere attivato facoltativamente. È anche possibile verificare in modo più affidabile l'uscita effettiva sul ricevitore o sul sistema audio esterno, se dispone di un display o di un LED che si illumina quando riceve un segnale Dolby Digital. In questo modo è possibile confermare se l'audio effettivamente riprodotto corrisponde alle impostazioni selezionate in Moonlight. In definitiva, il risultato dipende dalla combinazione delle capacità dell'host, del modello del televisore e della sua gestione dell'audio, nonché dalle caratteristiche dell'apparecchiatura audio esterna.

## Dolby Digital Plus funziona sempre su TOSLINK?

No. Il supporto E-AC-3 dipende dal modello di televisore Samsung, dal firmware, dalla modalità di uscita audio e dall'apparecchiatura ricevente. Alcune uscite ottiche dei televisori supportano solo una parte dei formati bitstream. Utilizzi AC-3 se l'apparecchiatura non accetta E-AC-3.

## Il passthrough Dolby può trasportare audio 7.1?

L'implementazione attuale è limitata a stereo e 5.1 canali. E-AC-3 supporta teoricamente il 7.1, ma il percorso di codifica FFmpeg usato da questa build al momento non offre questa opzione. Se FFmpeg aggiungerà il supporto in futuro, potrebbe diventare possibile selezionare il 7.1 per E-AC-3. AC-3 resta limitato a 5.1. Lo streaming OPUS standard può offrire altre disposizioni dei canali se supportate da host e client.

## Come visualizzo i codec video e audio attivi?

Se è collegata una tastiera al televisore, premi **Ctrl+Alt+Shift+S** per mostrare o nascondere l'overlay delle statistiche. In alternativa, premi **Play/Pause** sul telecomando del televisore oppure tieni premuto per un secondo il pulsante **Select** del gamepad e poi rilascialo per aprire il menu dello streaming. Seleziona quindi l'opzione per mostrare le statistiche.

Le righe relative ai flussi nell'overlay forniscono più informazioni dei soli nomi dei codec negoziati:

- **Flusso video:** mostra la risoluzione e la frequenza dei fotogrammi del flusso, seguite dal codec video negoziato. Quando viene utilizzato H.264, può essere indicato anche il relativo livello (ad esempio **H.264 L4.1**). Si tratta del livello H.264 selezionato in base alla risoluzione e alla frequenza dei fotogrammi del flusso, non del profilo H.264 Baseline. Quando l'HDR è stato attivato e negoziato correttamente con l'host, il codec viene indicato come **HEVC 10-bit HDR** oppure **AV1 10-bit HDR**. Se il codec a 10 bit corrispondente è indicato come **SDR**, l'HDR non è stato negoziato per quel flusso.
- **Flusso audio:** mostra il codec audio negoziato (OPUS, AC-3 o E-AC-3), la disposizione e il numero dei canali e il bitrate attualmente ricevuto. Il bitrate viene misurato durante lo streaming e può variare; non deve necessariamente rimanere uguale a quello negoziato inizialmente con l'host. L'indicazione **[Hardware]** o **[Software]** specifica il percorso di elaborazione audio attivo. **[Hardware]** significa che il televisore esegue la decodifica tramite il proprio supporto hardware nativo. Questa modalità è generalmente preferibile perché evita la decodifica software in Moonlight e contribuisce a mantenere la latenza più bassa possibile. **[Software]** significa che Moonlight esegue una decodifica software o una conversione/transcodifica prima di inviare l'audio al televisore; questo può aggiungere latenza di elaborazione.
- **Indicatore HQ:** quando è stata richiesta la qualità audio elevata, accanto al codec può comparire un apice **HQ**. Il verde indica che l'host ha confermato l'attivazione della modalità ad alta qualità. Il bianco indica che la richiesta è stata inviata, ma Moonlight non ha potuto confermare, dalla risposta dell'host, che la modalità sia effettivamente in uso.
- **Audio in ingresso / Transcodifica audio:** quando Moonlight elabora l'audio o ne converte il formato tramite software prima di inviarlo al televisore, vengono visualizzate righe aggiuntive che indicano il bitrate del flusso audio in ingresso e il tempo medio impiegato per elaborare ciascun segmento audio. Ciò può accadere quando il televisore non supporta nativamente il formato ricevuto, quando Moonlight converte OPUS in PCM, AC-3 o E-AC-3 oppure quando il flusso AC-3 o E-AC-3 ricevuto viene convertito in un altro formato, ad esempio PCM, a causa delle capacità del televisore o delle impostazioni audio selezionate. Il tempo indicato rappresenta il ritardo di elaborazione introdotto da questo percorso audio software.
- **FEC audio:** mostra quanti pacchetti audio sono stati recuperati, quanti blocchi FEC non sono riusciti e quanti pacchetti sono arrivati fuori sequenza nell'ultimo intervallo di misurazione.

La riga **Frequenze dei fotogrammi** indica separatamente i fotogrammi al secondo ricevuti, decodificati e accettati dal renderer. **Bitrate in ingresso dalla rete** mostra il bitrate complessivo effettivamente ricevuto dalla rete. Può variare durante lo streaming e non deve necessariamente rimanere uguale al valore negoziato inizialmente. Le altre statistiche riportano la latenza di rete, i fotogrammi mancanti, il tempo medio di decodifica, il ritardo nella coda dei fotogrammi e il tempo di invio al renderer.

## Dove trovo le informazioni sul televisore e sull'app?

Nell'app apri Impostazioni e poi Informazioni > Informazioni di sistema. Per diagnosticare un problema, annota modello del televisore, versione di Tizen, versione del client e dell'host e impostazioni audio/video selezionate.

Per segnalare un problema o inviare un suggerimento, utilizza il [tracker delle segnalazioni di GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues).

## Quali controller posso usare?

La compatibilità dipende dal modello del televisore, dalla versione di Tizen e dal tipo di connessione. Un controller Bluetooth o USB riconosciuto dal televisore è il punto di partenza consigliato. I gamepad compatibili di tipo Xbox, PlayStation o Nintendo Wii Pro dovrebbero funzionare correttamente nella maggior parte dei casi, purché siano riconosciuti dal televisore. Quando Moonlight rileva un gamepad collegato, nella parte superiore dell'interfaccia compare un pulsante. Selezionandolo si apre il test del controller, che mostra indicatori visivi quando si premono i pulsanti o si muovono gli stick. Se un controller non funziona in Moonlight, verifichi innanzitutto che il televisore lo riconosca e consulti la [Guida alla risoluzione dei problemi](../Troubleshooting-Guide.html).
