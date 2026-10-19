---
layout: docs-page
lang: it
title: "Guida all'installazione"
description: "Metodi per installare Moonlight Tizen sui Samsung Smart TV."
---

# Guida all'installazione

Il client è distribuito come widget Tizen firmato (`.wgt`). Scegli il metodo d'installazione adatto al televisore, al computer e agli strumenti di sviluppo Samsung installati.

## Metodo A: installazione con Apps2Samsung

### Prima di iniziare

- Scarica ed esegui la versione di [Apps2Samsung](https://apps2samsung.com/#download) per il tuo computer.
- Collega televisore e computer alla **stessa rete locale**. Puoi usare Wi-Fi o Ethernet, purché i dispositivi possano comunicare.

### 1. Trova l'indirizzo IP locale del computer

Il televisore ha bisogno dell'indirizzo IP del computer che eseguirà Apps2Samsung. Su Windows:

1. Premi **Win + R**, digita `cmd` e premi Invio.
2. Nel Prompt dei comandi esegui:

       ipconfig

3. Sull'adattatore di rete effettivamente utilizzato (Wi-Fi o Ethernet), annota **Indirizzo IPv4**, per esempio `192.168.1.37`.

Usa l'indirizzo IPv4 del computer, **non** il gateway predefinito, l'indirizzo IP del televisore, `127.0.0.1` o l'indirizzo Internet pubblico. Su macOS, trova l'indirizzo dell'adattatore attivo in **Impostazioni di Sistema → Rete**; su Linux esegui `ip addr` e cerca l'indirizzo `inet` dell'interfaccia di rete attiva. Tieni l'indirizzo a portata di mano per il passaggio successivo.

### 2. Apri sul televisore le impostazioni nascoste della modalità sviluppatore

1. Accendi il televisore e premi **Home** (o **Smart Hub**) sul telecomando.
2. Apri **Apps**.
3. Nelle interfacce TV più recenti, vai in **App Settings** (di solito un'icona a ingranaggio nella parte bassa della schermata Apps) e aprila. Su alcuni modelli precedenti è possibile inserire il codice direttamente dalla schermata Apps.
4. Con Apps/App Settings sullo schermo, inserisci esattamente questa sequenza:

   **1 → 2 → 3 → 4 → 5**

   **Come inserire le cifre**

   - **Telecomando con tastierino numerico fisico:** premi in ordine i cinque tasti 1, 2, 3, 4 e 5.
   - **Samsung Smart Remote senza tasti numerici:** premi il pulsante **123** (su alcuni telecomandi è indicato come **123/Color** o con il simbolo **…**) per mostrare il tastierino a schermo. Usa l'anello direzionale per selezionare ogni cifra e premi il tasto centrale **OK/Select**. Ripeti fino a inserire 12345.

   Il diagramma seguente mostra entrambi i metodi. Se il telecomando usa il tastierino a schermo non servono cinque tasti numerici fisici.

   ![Inserimento del codice Developer Mode con un telecomando standard o Samsung Smart Remote](assets/developer-mode-number-pad.svg)

5. Dovrebbe apparire una finestra **Developer Mode**. Imposta **Developer Mode** su **On**.
6. In **Host PC IP** (o un campo con nome simile), inserisci l'indirizzo IPv4 del computer annotato nel passaggio 1.
7. Seleziona **OK** e accetta il riavvio del televisore.

> [!IMPORTANT]
> Questa procedura è destinata ai **Samsung Smart TV con Tizen**. Anche altri produttori usano piattaforme TV basate su Tizen, ma menu e supporto per l'installazione in modalità sviluppatore possono variare.

> [!TIP]
> Dopo il riavvio, torna in **Apps**. Molti televisori Samsung mostrano un indicatore **Develop Mode** nella parte superiore della schermata, a conferma che la modalità sviluppatore è attiva. Per schermate specifiche del modello, consulta la [guida ufficiale Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html); anche le [FAQ di Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv) spiegano come inserire il codice con una Smart Remote.

### 3. Installa Moonlight dal catalogo Apps2Samsung

1. Apri Apps2Samsung sul computer.
2. Seleziona il televisore quando appare nei risultati della scansione. Se non viene rilevato automaticamente, inserisci manualmente il suo indirizzo IP se l'opzione è disponibile.
3. Apri il catalogo delle applicazioni e cerca **Moonlight**.
4. Seleziona **Moonlight**, quindi scegli la variante **fidoboy · Enhanced · Dolby** oppure, se richiesta dal modello del televisore, **fidoboy · Enhanced · Dolby · ForceGM**.
5. Avvia l'installazione con **Download & Install** e attendi la conferma di successo di Apps2Samsung. Il programma scarica e prepara il pacchetto automaticamente.
6. Apri la schermata **Apps** del televisore e avvia Moonlight.

**Questo è il metodo consigliato.** Non serve visitare GitHub Releases o scaricare manualmente `Moonlight.wgt`. Al primo utilizzo, Apps2Samsung potrebbe chiederti di accedere all'account Samsung per creare un certificato di firma. Segui le istruzioni e lascia la selezione del certificato su automatica/predefinita, a meno che il programma richieda un altro tipo. Non occorre configurare manualmente i certificati in Seller Office.

> [!WARNING]
> **Installa un WGT manualmente solo se il metodo del catalogo non funziona.** Scarica `Moonlight.wgt` dall'[ultima release stabile](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest). In Apps2Samsung scegli **Custom WGT / TPK**, seleziona il file scaricato e avvia l'installazione. Usa questa alternativa solo se necessario. Per la variante ForceGM, scarica `Moonlight-ForceGM.wgt` dalla stessa pagina.

### Risoluzione dei problemi

- **La finestra Developer Mode non appare:** assicurati di essere nella schermata Apps o, se disponibile sul tuo modello, in App Settings. Inserisci `12345` lì, non nel normale menu Impostazioni del televisore. Con una Smart Remote, apri prima il tastierino a schermo tramite **123** (o il pulsante virtuale equivalente).
- **Apps2Samsung non trova il televisore o non si connette:** verifica che Developer Mode sia ancora attivo, che entrambi i dispositivi siano sulla stessa rete locale e che Host PC IP sul televisore corrisponda esattamente all'IPv4 attuale del computer. Il Wi-Fi ospiti o l'isolamento client del router possono impedire la comunicazione.
- **La connessione non funziona nemmeno dopo il riavvio:** scollega completamente il televisore dall'alimentazione, attendi 10–15 secondi, ricollegalo e riprova. Può essere utile sui modelli in cui la connessione sviluppatore non si è aperta correttamente.
- **L'installazione fallisce per un conflitto di firma/certificato:** segui il messaggio di Apps2Samsung. Se stai passando dall'app base Brightcraft, consulta prima [Passare dall'app base Brightcraft](#passare-dallapp-base-brightcraft).

## Metodo B: Tizen Studio

Tizen Studio è l'ambiente ufficiale di sviluppo Samsung/Tizen, utile per sviluppatori e diagnosi più approfondite.

1. Installa Tizen Studio e gli strumenti TV adatti alla versione Tizen di destinazione.
2. Abilita Developer Mode sul televisore e annota il suo indirizzo IP.
3. In Device Manager, connettiti al televisore.
4. Configura un profilo certificato accettato dal televisore e firma il WGT secondo le richieste di Tizen Studio.
5. Installa il pacchetto con gli strumenti di packaging/deploy di Tizen o dall'IDE.

Consulta la documentazione Samsung aggiornata per installare Tizen Studio e configurare i certificati TV, poiché le procedure variano in base a SDK e sistema operativo.

## Compilare il pacchetto

La [Guida allo sviluppo](Development-Guide-it.md) spiega come compilare il WGT con il Dockerfile incluso. Le build Docker sono utili per testare una revisione esatta del codice sorgente o le due varianti del pacchetto.

## Passare dall'app base Brightcraft

La serie indipendente di release inizia dalla versione 1.0.0, mentre l'app base usava una versione superiore, 1.18.x. Tizen potrebbe quindi rifiutare un downgrade diretto o trattare diversamente la firma del pacchetto. Se l'installazione fallisce, disinstalla la vecchia applicazione prima di installare questo progetto. La disinstallazione può eliminare dati locali dell'app: annota prima le impostazioni e i dettagli degli host.

## Primo avvio

Avvia Moonlight dalla schermata Apps del televisore, consenti il rilevamento sulla rete locale e abbinalo al PC host. Se non appare automaticamente, usa Add Host e inserisci l'indirizzo IP o il nome DNS dell'host. Consulta la [Guida rapida](Quick-Start-Guide-it.md).
