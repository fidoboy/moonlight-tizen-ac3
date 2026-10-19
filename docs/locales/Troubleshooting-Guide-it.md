---
layout: docs-page
lang: it
title: "Guida alla risoluzione dei problemi"
description: "Risoluzione dei problemi comuni di connessione, audio e streaming in Moonlight Tizen."
---

# Guida alla risoluzione dei problemi

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
2. Assicurati che l'host esegua il [ramo sperimentale ac3-audio di Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) appropriato e sia stato compilato con l'encoder Dolby opzionale di FFmpeg disponibile.
3. Avvia un nuovo streaming dopo aver modificato le impostazioni audio dell'host.
4. Controlla nei log dell'host che siano riportati il codec e il bitrate AC-3 o E-AC-3 previsti.
5. Se Sunshine non offre Dolby o non lo seleziona, OPUS è il fallback di compatibilità previsto.

L'attivazione dell'impostazione da sola non dimostra che sia stato negoziato uno stream Dolby. La riga delle statistiche audio mostra il formato attivo durante la sessione.
