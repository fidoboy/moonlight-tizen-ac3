---
layout: docs-page
lang: it
title: "Guida alla risoluzione dei problemi"
description: "Risoluzione dei problemi comuni di connessione, audio e streaming in Moonlight Tizen."
---

# Guida alla risoluzione dei problemi

## Apps2Samsung non mostra il televisore nell'elenco

1. Verifica che il **Developer Mode (modalità sviluppatore)** sia attivato sul televisore Samsung. Premi **Home**, apri **Apps** e poi **App Settings** (di solito l'icona a forma di ingranaggio). Su alcuni modelli meno recenti, puoi inserire il codice mentre la schermata Apps è aperta.
2. Inserisci **12345** con i tasti numerici del telecomando. Se il tuo Smart Remote non ha tasti numerici, apri il tastierino sullo schermo con il pulsante **123** e inserisci lì le cifre. Quando appare la finestra **Developer Mode**, attiva la modalità sviluppatore (**On**).
3. In **Host PC IP**, inserisci l'indirizzo IPv4 locale del computer su cui viene eseguito Apps2Samsung. Deve corrispondere esattamente all'indirizzo attuale di quel computer. Usa l'IPv4 dell'adattatore Wi-Fi o Ethernet attivo, non l'IP del televisore, il gateway del router, `127.0.0.1` o l'indirizzo Internet pubblico. Salva l'impostazione e riavvia il televisore.
4. Verifica che televisore e computer siano sulla stessa rete locale, quindi cerca di nuovo il televisore in Apps2Samsung. Una rete Wi-Fi ospiti o l'isolamento client del router possono impedire la comunicazione.

Per maggiori dettagli, consulta la [Guida all'installazione](Installation-Guide-it.html) e la [guida ufficiale Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## Moonlight non trova l'host

1. Verifica che Sunshine sia in esecuzione e che TV e PC siano raggiungibili sulla stessa rete.
2. Controlla il firewall dell'host e le impostazioni di isolamento del router.
3. Prova ad aggiungere l'host usando l'indirizzo IPv4, l'indirizzo IPv6 o il nome DNS del PC.
4. Se l'host usa porte personalizzate, verifica che siano configurate in modo coerente.
5. Se il rilevamento funziona a intermittenza, prova una connessione Wi-Fi a 5 GHz affidabile o Ethernet sulla TV.

## L'abbinamento non riesce

- Verifica che il PIN venga inserito nell'interfaccia Web di Sunshine dell'host corretto.
- Rimuovi le vecchie voci di abbinamento solo se puoi poi abbinare nuovamente il client.
- Controlla l'ora del sistema e che nessuna regola del firewall blocchi la comunicazione tra TV e PC.

## Lo streaming parte, ma il video si blocca, diventa nero o perde fotogrammi

- Inizia con una risoluzione inferiore, 60 FPS e un bitrate moderato.
- Verifica che il codec video selezionato sia supportato sia dalla TV sia dalla GPU dell'host.
- Aggiorna i driver della GPU e Sunshine se il problema si presenta anche con altri client.
- Se Ethernet cablata è instabile con bitrate elevati, prova un altro percorso di rete. Alcune TV hanno porte Fast Ethernet anche quando l'host è collegato a Gigabit Ethernet.

## Audio assente o disposizione dei canali errata

- Controlla l'uscita audio della TV, l'ingresso del ricevitore, il volume e il silenziamento.
- Prova prima il percorso OPUS predefinito. Se funziona, abilita l'uscita ottica solo durante i test Dolby.
- Inizia con lo stereo e passa al 5.1 dopo aver verificato che l'intera catena TV/ricevitore lo supporti.
- L'attuale implementazione Dolby sull'host supporta stereo e 5.1. Non selezionare 7.1 per il percorso dell'encoder Dolby.

## Le statistiche mostrano OPUS invece di AC-3 o E-AC-3

1. Verifica che **Enable Dolby Digital** sia attivato in Moonlight.
2. Assicurati che l'host esegua la [build sperimentale di Sunshine](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826) appropriata, compilata con l'encoder Dolby opzionale di FFmpeg. In Sunshine, apri **Settings → Audio/Video** e seleziona **AC-3 (Dolby Digital)** oppure **E-AC-3 (Dolby Digital Plus)** dal menu a discesa del formato audio dello streaming.
3. Avvia un nuovo streaming dopo aver modificato le impostazioni audio dell'host.
4. Controlla nei log dell'host che siano riportati il codec e il bitrate AC-3 o E-AC-3 previsti.
5. Se Sunshine non offre Dolby o non lo seleziona, OPUS è il fallback di compatibilità previsto.

L'attivazione dell'impostazione da sola non dimostra che sia stato negoziato uno stream Dolby. La riga delle statistiche audio mostra il formato attivo durante la sessione.

## Raccogliere informazioni diagnostiche utili

Annota la versione del progetto Moonlight, il modello del televisore e la versione di Tizen, la versione e il ramo di Sunshine, il codec e la disposizione dei canali mostrati nelle statistiche, le impostazioni di risoluzione/FPS/bitrate e se il problema si verifica anche con OPUS. Poi [apri una segnalazione su GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues) includendo le informazioni pertinenti. Non pubblicare indirizzi IP pubblici, PIN, chiavi private o altri segreti.
