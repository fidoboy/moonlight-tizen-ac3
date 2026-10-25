---
layout: docs-page
lang: it
title: "Guida rapida"
description: "Primi passi con Moonlight Tizen e host compatibili con GameStream."
---

# Guida rapida

Questa guida descrive il percorso più breve dall'installazione a uno streaming funzionante su un Samsung Smart TV.

## 1. Controlla la configurazione

Ti serviranno:

- Un Samsung Smart TV con Tizen 5.5 o successivo.
- Un PC con Sunshine o un altro host compatibile con GameStream.
- Una GPU host in grado di codificare via hardware.
- Una connessione di rete stabile tra televisore e PC. Ethernet per l'host e una connessione Wi-Fi 5 GHz affidabile o Ethernet per il televisore sono un buon punto di partenza.
- Un controller compatibile se vuoi giocare con un gamepad.

Consulta i [requisiti in README](../#compatibility) per altri dettagli.

## 2. Installa il client

**Metodo consigliato: installazione dal sito ufficiale di [Apps2Samsung](https://apps2samsung.com/).** Scarica e avvia Apps2Samsung sul computer, seleziona il televisore, cerca **Moonlight** nel catalogo delle app e scegli la variante `fidoboy · Enhanced · Dolby`. È il metodo più semplice perché Apps2Samsung prepara e firma il pacchetto per te.

**Alternativa: installazione manuale del WGT.** Scarica `Moonlight.wgt` dall'[ultima versione stabile](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest), quindi installalo con uno di questi metodi:

- **Apps2Samsung:** scegli **Custom WGT / TPK** e seleziona il file scaricato.
- **Tizen Studio:** connetti il televisore con la modalità sviluppatore attiva e installa il pacchetto con gli strumenti di distribuzione Tizen e un profilo di certificato accettato dal televisore. Per i dettagli, consulta la [Guida all'installazione](Installation-Guide-it.html).

Usa `Moonlight-ForceGM.wgt` solo se il tuo televisore richiede specificamente i metadati alternativi di Game Mode.
## 3. Configura l'host e abbina il client

1. Installa e avvia sul PC un qualsiasi server host compatibile con GameStream. Alcuni esempi sono [Sunshine](https://app.lizardbyte.dev/Sunshine/), [Vibeshine](https://github.com/Nonary/vibeshine/releases), [Apollo](https://github.com/ClassicOldSong/Apollo/releases) e [Punktfunk](https://docs.punktfunk.unom.io/docs/install). Possono funzionare anche altri software host compatibili.
2. Assicurati che PC e televisore possano comunicare sulla stessa rete e che il firewall dell'host consenta le connessioni di streaming.
3. Avvia Moonlight sul televisore e seleziona l'host quando compare.
4. Moonlight mostra un PIN. Apri l'interfaccia Web del server host sul PC, inserisci il PIN nella sezione di abbinamento e conferma.
5. Seleziona un gioco o il desktop per avviare lo streaming.

Per una nuova configurazione, inizia con valori prudenti di risoluzione, frequenza dei fotogrammi e bitrate. Aumentali dopo aver verificato la stabilità dello streaming.

## 4. Abilita l'uscita ottica Dolby (facoltativo)

Il passthrough Dolby richiede la [build sperimentale Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) corrispondente. Puoi scaricare direttamente la build Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) oppure [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). Servono inoltre un percorso audio compatibile sul televisore e un ricevitore o sistema audio che supporti il formato.

In alternativa, il passthrough Dolby è disponibile anche nella [build nightly 2.0.2 di Vibeshine](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d).

1. Collega l'uscita ottica del televisore al ricevitore o al sistema audio.
2. Nelle impostazioni audio del televisore, scegli una modalità che inoltri un bitstream Dolby supportato invece di forzare PCM stereo. Le etichette esatte variano in base al modello.
3. In Settings di Moonlight, abilita **Enable Dolby Digital** e seleziona stereo o 5.1.
4. Avvia uno streaming e apri l'overlay prestazioni con **Ctrl+Alt+Shift+S**. Controlla che la riga audio attiva indichi OPUS, AC-3 o E-AC-3 e la disposizione di canali prevista.

Se l'host offre solo OPUS, lo streaming continuerà a usare OPUS. Un interruttore attivo sul client non può far inviare Dolby a un host che offre solo OPUS.

## 5. Regola lo streaming

Quando il primo streaming funziona, adatta risoluzione, frequenza dei fotogrammi, bitrate, codec video e impostazioni audio alle capacità del televisore e della rete. Consulta la [Panoramica delle funzionalità](Features-Overview-it.html) e le [Domande frequenti](../Frequently-Asked-Questions.html).
