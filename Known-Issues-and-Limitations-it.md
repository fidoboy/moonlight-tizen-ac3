---
layout: docs-page
lang: it
title: "Problemi noti e limitazioni"
description: "Limitazioni note di audio Dolby, Tizen e streaming in Moonlight Tizen."
---

# Problemi noti e limitazioni

## Audio Dolby tramite uscita ottica

- Il passthrough Dolby è un'estensione facoltativa e richiede l'implementazione sperimentale corrispondente di Sunshine. Un host standard che invia OPUS rimane supportato, ma continuerà a usare OPUS.
- AC-3 è limitato a 5.1 canali. L'attuale encoder sperimentale corrispondente supporta stereo e 5.1, non 7.1.
- Il passthrough E-AC-3 via uscita ottica dipende dal modello del televisore, firmware, configurazione dell'uscita e ricevitore. Non dare per scontato che ogni televisore possa inviare E-AC-3 tramite TOSLINK.
- La pipeline audio nativa del televisore deve accettare il formato compresso. Se rifiuta l'inizializzazione della traccia, il flusso Dolby non può essere riprodotto tramite quel percorso.
- Questa funzione è stata testata con uno specifico televisore Samsung e una catena audio particolare; la compatibilità con ogni combinazione TV/ricevitore non è stata verificata.
- Il bitrate audio mostrato nell'overlay è una velocità di ricezione misurata approssimativa, non un campo di negoziazione del codec né un obiettivo encoder garantito.

## Limitazioni di Tizen e del televisore

- Il client è destinato ai televisori Samsung supportati con Tizen 5.5 o successivo, ma le capacità variano in base a modello e firmware.
- Game Mode e le opzioni ad alta frequenza di aggiornamento possono essere limitate dal sistema operativo o dalle capacità del televisore anche se l'impostazione è visibile.
- Alcuni televisori hanno una porta Ethernet da 100 Mbps. A risoluzioni o bitrate elevati, il traffico a raffiche dei fotogrammi può causare perdita di pacchetti su Ethernet. Provare una connessione Wi-Fi 5 GHz stabile può aiutare a distinguere questo problema da un problema dell'host.
- Risoluzione video, frequenza dei fotogrammi, HDR, AV1 e bitrate elevati dipendono dal decoder del televisore e dall'encoder GPU dell'host. Le combinazioni non supportate possono ricorrere a un'alternativa o non avviarsi.

## Progetto indipendente e stato delle release

Questo progetto è mantenuto in modo indipendente e include funzionalità dipendenti dall'hardware. La sua sequenza di versioni inizia da 1.0.0 ed è separata dalle versioni del progetto base [Brightcraft](https://github.com/brightcraft/moonlight-tizen). Le note pubbliche e le modifiche note sono disponibili nella [pagina Release](https://github.com/fidoboy/moonlight-tizen-ac3/releases) e nel [registro delle modifiche](../CHANGELOG.md).

Quando segnali un problema, includi la versione esatta del progetto, il modello del televisore e la versione Tizen, la versione/branch Sunshine, le impostazioni video, il backend audio, i canali selezionati e i log rilevanti.
