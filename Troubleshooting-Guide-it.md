---
layout: docs-page
lang: it
title: "Guida alla risoluzione dei problemi"
description: "Soluzioni ai problemi comuni di connessione, audio e streaming in Moonlight Tizen."
---

# Guida alla risoluzione dei problemi

## Moonlight non trova l'host

1. Verifica che Sunshine sia in esecuzione e che televisore e PC siano raggiungibili sulla stessa rete.
2. Controlla il firewall dell'host e le impostazioni di isolamento del router.
3. Prova Add Host con l'indirizzo IPv4, l'indirizzo IPv6 o il nome DNS del PC.
4. Se l'host usa porte personalizzate, verifica che siano configurate in modo coerente.
5. Se il rilevamento è intermittente, prova a connettere il televisore a una rete Wi-Fi 5 GHz affidabile o tramite Ethernet.

## L'abbinamento non riesce

- Verifica che il PIN venga inserito nell'interfaccia Web di Sunshine dell'host corretto.
- Rimuovi le vecchie voci di abbinamento solo se potrai abbinare nuovamente il client.
- Controlla l'ora di sistema e che nessuna regola del firewall blocchi la comunicazione tra televisore e PC.

## Lo streaming parte ma il video si blocca, diventa nero o perde fotogrammi

- Inizia con una risoluzione inferiore, 60 FPS e un bitrate prudente.
- Verifica che il codec video selezionato sia supportato sia dal televisore sia dalla GPU host.
- Aggiorna i driver GPU e Sunshine se il problema si verifica anche con altri client.
- Se Ethernet cablata è instabile a bitrate elevati, prova un altro percorso di rete. Alcuni televisori hanno porte Fast Ethernet anche se l'host è collegato a Gigabit.

## Audio assente o disposizione dei canali errata

- Controlla l'uscita audio del televisore, l'ingresso del ricevitore, il volume e il mute.
- Prova prima il percorso OPUS predefinito. Se funziona, abilita l'uscita ottica solo per testare Dolby.
- Inizia con stereo, poi passa a 5.1 dopo aver verificato che la catena TV/ricevitore lo supporti.
- L'attuale implementazione Dolby sull'host supporta stereo e 5.1. Non selezionare 7.1 per il percorso encoder Dolby.

## Le statistiche mostrano OPUS invece di AC-3 o E-AC-3

1. Verifica che **Enable Dolby Digital** sia attivo in Moonlight.
2. Assicurati che l'host esegua il branch sperimentale [Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) corrispondente e sia stato compilato con l'encoder Dolby opzionale di FFmpeg disponibile.
3. Avvia un nuovo streaming dopo aver modificato le impostazioni audio sull'host.
4. Verifica che il log dell'host riporti il codec AC-3 o E-AC-3 previsto e il bitrate.
5. Se Sunshine non offre o non seleziona Dolby, OPUS è il fallback di compatibilità atteso.

Un'impostazione abilitata da sola non dimostra che sia stato negoziato uno streaming Dolby. La riga delle statistiche audio riflette la sessione attiva.

## Il controller o il telecomando non funzionano

- Verifica che il televisore riconosca il controller nelle proprie impostazioni.
- Ricollega il controller prima di avviare Moonlight.
- Prova la navigazione di base con il telecomando nell'elenco host e nelle impostazioni prima di iniziare uno streaming.
- Se il problema di input riguarda un solo gioco, confrontalo con un'altra applicazione per isolare le mappature specifiche del gioco.

## Raccogliere informazioni diagnostiche utili

Annota versione del progetto Moonlight, modello del televisore e versione Tizen, versione e branch di Sunshine, codec e disposizione dei canali mostrati nelle statistiche, impostazioni di risoluzione/FPS/bitrate e se il problema si verifica anche con OPUS. Non pubblicare indirizzi IP pubblici, PIN, chiavi private o altri segreti.
