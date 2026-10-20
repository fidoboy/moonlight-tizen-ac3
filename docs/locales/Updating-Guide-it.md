---
layout: docs-page
lang: undefined
title: "Guida all'aggiornamento"
description: "Come aggiornare Moonlight Tizen su un Samsung Smart TV e scegliere la variante corretta del pacchetto."
---

# Guida all'aggiornamento

## Aggiornare a una versione più recente del progetto

1. Apri la [pagina delle release](https://github.com/fidoboy/moonlight-tizen-ac3/releases).

2. Scarica l'ultima versione di **Moonlight.wgt**, oppure **Moonlight-ForceGM.wgt** se utilizzi specificamente questa variante.

3. Installala con lo stesso metodo usato in precedenza (Apps2Samsung, Tizen Studio o lo strumento appropriato per il dispositivo).

4. Avvia Moonlight e verifica che le impostazioni salvate e gli host associati siano ancora presenti.

Quando possibile, usa la stessa variante del pacchetto e lo stesso metodo di firma/installazione. Se il televisore rifiuta l'aggiornamento per un conflitto di versione o certificato, consulta la [Guida all'installazione](Installation-Guide-it.html).

## Passare dal pacchetto Brightcraft 1.18.x alla serie 1.0.x di questo progetto

Questo progetto avvia una serie di versioni separata a partire da 1.0.0. Poiché il numero è inferiore alla versione 1.18.x del pacchetto originale, alcuni televisori potrebbero non consentire l'aggiornamento diretto. In tal caso:

1. Annota le impostazioni che desideri ripristinare.

2. Disinstalla la vecchia app tramite il gestore applicazioni del televisore o lo strumento usato per installarla.

3. Installa il nuovo pacchetto del progetto e, se necessario, associa/configura di nuovo gli host.

La disinstallazione può eliminare i dati locali dell'app. Questa limitazione deriva dall'avvio di una serie di versioni distinta mantenendo la stessa identità dell'applicazione Tizen; non indica che il WGT sia stato compilato in modo errato.

## Aggiornare le build sperimentali

I WGT sperimentali di GitHub Actions sono artefatti temporanei di test. Scarica l'artefatto dall'esecuzione del workflow pertinente anziché usare un vecchio URL memorizzato nella cache e controlla lo SHA del commit prima dell'installazione. Non dare per scontato che un artefatto sperimentale equivalga a una release stabile contrassegnata con un tag.
