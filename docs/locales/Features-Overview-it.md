---
layout: docs-page
lang: it
title: "Panoramica delle funzionalità"
description: "Funzionalità di Moonlight Tizen, audio Dolby e configurazione."
---

# Panoramica delle funzionalità

Questa pagina descrive il progetto del client Moonlight per Tizen. La disponibilità delle funzionalità dipende dal modello del televisore, dalla versione di Tizen, dalla configurazione dell'host, dalla rete e dalle periferiche collegate.

## Funzione principale rispetto agli altri client: audio Dolby tramite uscita ottica

La caratteristica distintiva del progetto è il passthrough opzionale dell'audio Dolby Digital e Dolby Digital Plus per i televisori Samsung compatibili collegati a un ricevitore o a un sistema audio tramite connessione ottica (TOSLINK).

- **AC-3 (Dolby Digital):** l'audio compresso stereo o a 5.1 canali può essere inviato al renderer audio EMSS nativo di Tizen quando l'host negozia correttamente AC-3.
- **E-AC-3 (Dolby Digital Plus):** è supportato quando host, firmware del televisore, configurazione dell'uscita audio e apparecchiatura di ricezione accettano il formato. E-AC-3 tramite uscita ottica non è garantito su tutti i televisori.
- **Stereo e 5.1:** l'encoder sperimentale Sunshine corrispondente supporta stereo e 5.1. AC-3 è limitato a 5.1. La selezione 7.1 resta disponibile tramite il normale percorso audio quando supportata, ma non fa parte dell'attuale percorso dell'encoder Dolby.
- **Negoziazione facoltativa:** abilita **Enable Dolby Digital** per richiedere il percorso Dolby. L'audio Dolby viene utilizzato solo se l'host annuncia e seleziona un formato supportato.
- **Compatibilità OPUS:** se l'host invia solo OPUS, non annuncia l'estensione Dolby opzionale o non seleziona un formato Dolby, il client continua a usare il normale percorso OPUS. Gli host solo OPUS non richiedono modifiche.
- **Host compatibile:** il passthrough Dolby richiede attualmente il branch sperimentale corrispondente [fidoboy/Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio). Il normale percorso audio del client resta disponibile in assenza di questa funzionalità sull'host.

Il percorso audio ottico è stato testato end-to-end con una build sperimentale di Sunshine, un televisore Samsung e un sistema audio compatibile collegato tramite uscita ottica. I risultati possono variare a seconda del modello, del firmware e del ricevitore. Consulta [Problemi noti e limitazioni](../Known-Issues-and-Limitations.html#dolby-optical-audio).

## Statistiche del flusso audio

L'overlay delle prestazioni, mostrato o nascosto con **Ctrl+Alt+Shift+S**, indica il codec audio negoziato, la disposizione e il numero di canali e un bitrate audio misurato approssimativo, insieme al codec video e alle statistiche di streaming esistenti. Il codec visualizzato riflette la sessione attiva, non soltanto la preferenza selezionata.

## Altri miglioramenti specifici del progetto

- **Localizzazione spagnola:** include una traduzione dell'interfaccia `es-ES` insieme alle lingue esistenti.
- **Chiudi l'app host alla disconnessione:** richiesta facoltativa, best-effort, per chiudere l'applicazione host in esecuzione dopo una disconnessione normale. I guasti di connessione imprevisti non la attivano.
- **Schermata di avvio nativa animata:** aggiunge una schermata iniziale animata per i comportamenti di avvio Tizen supportati.
- **Miglioramenti delle impostazioni per l'uscita ottica:** migliora lo stato delle impostazioni, la scelta dei canali e la navigazione tramite telecomando quando Dolby è abilitato.
- **Avvio:** migliora il passaggio dalla schermata iniziale nativa all'elenco host ed evita una schermata di caricamento a tutto schermo non necessaria.
- **Miglioramenti a input e interfaccia:** include miglioramenti per tastiera, focus e navigazione delle impostazioni.

## Funzionalità principali ereditate dal progetto comunitario Moonlight Tizen

- Trasmette giochi, applicazioni e l'intero desktop da installazioni compatibili con NVIDIA GameStream o Sunshine.
- Supporto per televisori Samsung con versioni di Tizen supportate (5.5 e successive).
- Decodifica video H.264, HEVC e AV1 quando supportata da televisore e GPU host.
- Streaming HDR e configurazione di risoluzione, frequenza dei fotogrammi, bitrate e gamma colore entro i limiti dell'hardware.
- Rilevamento e abbinamento automatici degli host, con IPv4, IPv6, nomi DNS e porte personalizzate facoltative.
- Wake-on-LAN, stato online/offline degli host, ordinamento delle app e gestione degli host.
- Input da tastiera, mouse e controller, inclusi più controller, navigazione con controller ed emulazione opzionale del mouse.
- Backend audio EMSS e Web Audio, con impostazioni dipendenti dal backend scelto.
- Supporto Smart Hub Preview quando disponibile nella versione di Tizen.
- Statistiche di streaming, avvisi di connessione e opzioni relative alla latenza come Game Mode, quando supportato.

## Nota sulla compatibilità

Dolby è un'estensione opzionale e non sostituisce il protocollo generale di streaming OPUS. Anche l'host Sunshine corrispondente deve essere compilato con l'encoder Dolby disponibile e configurato per selezionare AC-3 o E-AC-3. Per l'installazione, inizia dalla [Guida rapida](Quick-Start-Guide-it.html).
