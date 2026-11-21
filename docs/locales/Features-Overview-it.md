---
layout: docs-page
lang: it
title: "Panoramica delle funzionalità"
description: "Funzionalità di Moonlight Tizen, audio Dolby e configurazione."
---

# Panoramica delle funzionalità

Questa pagina descrive il progetto del client Moonlight per Tizen. La disponibilità delle funzionalità dipende dal modello del televisore, dalla versione di Tizen, dalla configurazione dell'host, dalla rete e dalle periferiche collegate.

## Funzione principale rispetto agli altri client: audio Dolby tramite uscita digitale

La caratteristica distintiva di questo progetto è l'uscita audio opzionale Dolby Digital e Dolby Digital Plus sui televisori Samsung compatibili collegati a un ricevitore o impianto audio tramite uscita ottica (TOSLINK) o HDMI. A differenza delle versioni precedenti, non è necessario che l'host fornisca un flusso audio Dolby nativo.

- **AC-3 (Dolby Digital):** l'audio compresso stereo o a 5.1 canali può essere inviato al renderer audio EMSS nativo di Tizen quando il formato è disponibile ed è supportato dal televisore e dai dispositivi collegati.
- **E-AC-3 (Dolby Digital Plus):** supportato quando firmware del televisore, configurazione dell'uscita audio e apparecchiatura ricevente accettano il formato. E-AC-3 tramite uscita ottica non è garantito su tutti i televisori.
- **Supporto Dolby sull'host (consigliato):** se l'host può fornire AC-3 o E-AC-3 in modo nativo, Moonlight può utilizzare direttamente quel flusso. È fortemente consigliato perché evita la conversione audio in tempo reale sul client TV e riduce quindi la latenza aggiuntiva di elaborazione audio, migliorando la risposta ai controlli e al suono.
- **Conversione da OPUS a Dolby:** se l'host non fornisce audio Dolby, può continuare a inviare OPUS. Moonlight per Tizen tenterà di convertire in tempo reale l'audio OPUS ricevuto in Dolby Digital, in base al modello del televisore, alle capacità audio di Tizen, alle impostazioni selezionate e ai dispositivi audio collegati. Ciò amplia la compatibilità con gli host GameStream e con le diverse configurazioni di TV e apparecchiature audio, anche se la conversione software può aggiungere latenza.
- **Stereo e audio surround:** la disposizione dei canali e il formato Dolby disponibili dipendono dal flusso ricevuto, dal percorso di conversione e dalle capacità del televisore e del ricevitore. L'uscita AC-3 è limitata a 5.1 canali.

Il percorso audio Dolby è stato testato con televisori Samsung compatibili e apparecchiature audio esterne. I risultati possono variare in base al modello del televisore, alla versione del firmware e al ricevitore. Consulta [Problemi noti e limitazioni](Known-Issues-and-Limitations-it.html#dolby-optical-audio).

## Statistiche del flusso audio

L'overlay delle prestazioni può essere mostrato con **Ctrl+Alt+Shift+S** se è collegata una tastiera al televisore. In alternativa, premi **Play/Pause** o **Indietro** sul telecomando della TV per aprire il menu dello streaming e selezionare l'opzione delle statistiche. Indica il codec audio negoziato, la disposizione e il numero di canali e un bitrate audio misurato approssimativo, insieme al codec video e alle statistiche di streaming esistenti. Il codec visualizzato riflette la sessione attiva, non soltanto la preferenza selezionata.

## Altri miglioramenti specifici del progetto

- **Localizzazione dell’interfaccia:** l’interfaccia è disponibile in inglese, spagnolo, tedesco, francese, italiano, russo e portoghese brasiliano.
- **Menu di streaming accessibile dal telecomando:** apri il menu di streaming con **Play/Pause** o **Indietro** sul telecomando del televisore. In alternativa, tieni premuto **Select** su un controller di gioco per un secondo e rilascialo per accedere ai controlli e alle statistiche senza bisogno di una tastiera.
- **Overlay delle statistiche in tempo reale migliorato:** include grafici in tempo reale della latenza dell’host e della qualità/velocità della connessione, utili per individuare picchi di latenza, ricezione degradata, banda insufficiente e altri problemi di comunicazione.
- **Scorciatoie di avvio diretto da Smart Hub:** avvia direttamente da Smart Hub le applicazioni configurate sull’host remoto, saltando la normale interfaccia Moonlight, il controllo degli aggiornamenti e il rilevamento degli host.
- **Chiudi l'app host alla disconnessione:** richiesta facoltativa, best-effort, per chiudere l'applicazione host in esecuzione dopo una disconnessione normale. I guasti di connessione imprevisti non la attivano.
- **Schermata di avvio nativa animata:** aggiunge una schermata iniziale animata per i comportamenti di avvio Tizen supportati.
- **Miglioramenti delle impostazioni per l’uscita digitale:** migliora lo stato delle impostazioni, la scelta dei canali e la navigazione tramite telecomando quando Dolby è abilitato.
- **Avvio:** migliora il passaggio dalla schermata iniziale nativa all'elenco host ed evita una schermata di caricamento a tutto schermo non necessaria.
- **Miglioramenti a input e interfaccia:** include miglioramenti per tastiera, focus e navigazione delle impostazioni.

- **Temi e decorazioni dell'interfaccia:** consente di scegliere tra diversi schemi di colori e decorazioni dell'interfaccia.
- **Salvaschermo:** quando il televisore rimane acceso ma non riceve alcuno streaming, mostra un semplice logo in movimento per risparmiare energia e proteggere lo schermo. Il movimento evita che la stessa forma statica rimanga illuminata troppo a lungo nella medesima posizione.
- **Sfondi animati:** questi sfondi opzionali offrono un aspetto e un'esperienza simili a quelli delle console per videogiochi. Conferiscono all'interfaccia un'estetica da console, anche se Moonlight può essere utilizzato per altri scopi, come dimostrazioni aziendali o come schermo secondario wireless collegato a un computer. Gli sfondi animati possono essere disattivati.
- **Miglioramenti nella gestione dell'audio:** questo progetto migliora la gestione dei diversi codec audio e consente sia la riproduzione nativa sia l'elaborazione o conversione tramite software, in base alle capacità di ciascun televisore. Ciò amplia la compatibilità con un maggior numero di modelli e configurazioni audio, anche se i risultati e l'esperienza finale possono variare da un sistema all'altro.

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

Moonlight per Tizen è compatibile con qualsiasi software host che utilizzi il protocollo GameStream; non è necessario che l'host fornisca audio Dolby Digital. Se si desidera utilizzare Dolby Digital, tuttavia, è preferibile che l'host possa fornire nativamente AC-3 o E-AC-3. L'uscita Dolby nativa evita la conversione in tempo reale da OPUS a Dolby sul client TV, riduce la latenza aggiuntiva di elaborazione audio e offre generalmente una risposta più immediata. Se l'host fornisce soltanto OPUS, Moonlight tenterà la conversione in tempo reale quando il televisore e i dispositivi audio collegati lo consentono. Per l'installazione, inizia dalla [Guida rapida](Quick-Start-Guide-it.html).
