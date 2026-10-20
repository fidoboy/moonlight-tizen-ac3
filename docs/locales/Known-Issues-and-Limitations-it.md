---
layout: docs-page
lang: undefined
title: "Problemi noti e limitazioni"
description: "Problemi di compatibilità noti e limitazioni tecniche di Moonlight Tizen con supporto audio Dolby."
---

# Problemi noti e limitazioni

## Audio Dolby tramite uscita ottica

- Il passthrough Dolby è un'estensione opzionale e richiede l'implementazione sperimentale corrispondente di Sunshine. Gli host standard che inviano OPUS restano supportati e continueranno a utilizzare OPUS.

- AC-3 è limitato a 5.1 canali. L'encoder sperimentale corrispondente supporta attualmente stereo e 5.1, non 7.1.

- Il passthrough E-AC-3 tramite uscita ottica dipende dal modello del televisore, dal firmware, dalla configurazione di uscita e dal ricevitore. Non dare per scontato che tutti i televisori possano trasmettere E-AC-3 tramite TOSLINK.

- La pipeline audio nativa del televisore deve accettare il formato compresso. Se rifiuta l'inizializzazione della traccia, il flusso Dolby non può essere riprodotto tramite quel percorso.

- La funzionalità è stata testata con uno specifico televisore Samsung e una specifica catena audio; la compatibilità con tutte le combinazioni di TV e ricevitore non è stata stabilita.

- Il bitrate audio mostrato nell'overlay è una velocità di ricezione misurata approssimativa, non un campo di negoziazione del codec né un obiettivo garantito dell'encoder.

## Limitazioni di Tizen e dei televisori

- Il client è destinato ai televisori Samsung supportati con Tizen 5.5 o versioni successive, ma le capacità variano in base al modello e al firmware.

- Game Mode e le opzioni con frequenze di aggiornamento elevate possono essere limitate dal sistema operativo o dalle capacità del televisore, anche se l'impostazione è visibile.

- Alcuni televisori dispongono di una porta Ethernet da 100 Mbps. A risoluzioni o bitrate elevati, i picchi di traffico dei frame possono causare perdita di pacchetti su Ethernet cablata. Provare una connessione Wi-Fi affidabile a 5 GHz può aiutare a distinguere un problema di rete da uno dell'host.

- Risoluzione video, frequenza dei fotogrammi, HDR, AV1 e bitrate elevati dipendono dal decoder del televisore e dall'encoder della GPU host. Le combinazioni non supportate possono ricorrere a un'alternativa o non avviarsi.

## Progetto indipendente e stato delle release

Questo progetto è gestito in modo indipendente e include funzionalità il cui comportamento dipende dall'hardware. La sua serie di versioni parte da 1.0.0 ed è separata da quella del [progetto base Brightcraft](https://github.com/brightcraft/moonlight-tizen). Le note di rilascio pubbliche e le modifiche note sono disponibili nella [pagina delle release](https://github.com/fidoboy/moonlight-tizen-ac3/releases) e nel [changelog](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Quando segnali un problema, includi la versione esatta del progetto, il modello del televisore e la versione di Tizen, la versione e il branch di Sunshine, le impostazioni video, il backend audio, la selezione dei canali e i log pertinenti.
