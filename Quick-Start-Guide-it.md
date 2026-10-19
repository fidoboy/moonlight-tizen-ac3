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

Consulta i [requisiti in README](README-it.md#requisiti) per altri dettagli.

## 2. Installa il client

Scarica il pacchetto standard `Moonlight.wgt` dalla [pagina delle release](https://github.com/fidoboy/moonlight-tizen-ac3/releases). Scegli il pacchetto ForceGM solo se ti servono specificamente i metadati alternativi di Game Mode.

Segui la [Guida all'installazione](Installation-Guide-it.md) per Apps2Samsung, Tizen Studio o un altro metodo supportato.

## 3. Configura l'host e abbina il client

1. Installa e avvia Sunshine sul PC host.
2. Assicurati che PC e televisore possano comunicare sulla stessa rete e che il firewall dell'host consenta le connessioni di streaming.
3. Avvia Moonlight sul televisore e seleziona l'host quando compare.
4. Moonlight mostra un PIN. Apri l'interfaccia Web di Sunshine sul PC, inserisci il PIN nella sezione di abbinamento e conferma.
5. Seleziona un gioco o il desktop per avviare lo streaming.

Per una nuova configurazione, inizia con valori prudenti di risoluzione, frequenza dei fotogrammi e bitrate. Aumentali dopo aver verificato la stabilità dello streaming.

## 4. Abilita l'uscita ottica Dolby (facoltativo)

Il passthrough Dolby richiede la [build sperimentale Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) corrispondente. Puoi scaricare direttamente la build Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) oppure [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). Servono inoltre un percorso audio compatibile sul televisore e un ricevitore o sistema audio che supporti il formato.

1. Collega l'uscita ottica del televisore al ricevitore o al sistema audio.
2. Nelle impostazioni audio del televisore, scegli una modalità che inoltri un bitstream Dolby supportato invece di forzare PCM stereo. Le etichette esatte variano in base al modello.
3. In Settings di Moonlight, abilita **Enable Dolby Digital** e seleziona stereo o 5.1.
4. Avvia uno streaming e apri l'overlay prestazioni con **Ctrl+Alt+Shift+S**. Controlla che la riga audio attiva indichi OPUS, AC-3 o E-AC-3 e la disposizione di canali prevista.

Se l'host offre solo OPUS, lo streaming continuerà a usare OPUS. Un interruttore attivo sul client non può far inviare Dolby a un host che offre solo OPUS.

## 5. Regola lo streaming

Quando il primo streaming funziona, adatta risoluzione, frequenza dei fotogrammi, bitrate, codec video e impostazioni audio alle capacità del televisore e della rete. Consulta la [Panoramica delle funzionalità](Features-Overview-it.md) e le [Domande frequenti](Frequently-Asked-Questions-it.md).
