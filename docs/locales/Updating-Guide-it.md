---
layout: docs-page
lang: it
title: "Guida all'aggiornamento"
description: "Aggiornare Moonlight Tizen e passare da altre build."
---

# Guida all'aggiornamento

## Aggiornare a una release più recente del progetto

1. Apri la [pagina delle release](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Scarica il `Moonlight.wgt` più recente, oppure `Moonlight-ForceGM.wgt` se usi specificamente quella variante.
3. Installalo con lo stesso metodo usato in precedenza (Apps2Samsung, Tizen Studio o gli strumenti appropriati al dispositivo).
4. Avvia Moonlight e verifica che le impostazioni salvate e gli host abbinati siano ancora presenti.

Quando possibile, usa la stessa variante del pacchetto e lo stesso metodo di firma/installazione. Se il televisore rifiuta l'aggiornamento per un conflitto di versione o certificato, consulta la [Guida all'installazione](Installation-Guide-it.html).

## Passare dal pacchetto Brightcraft 1.18.x alla serie 1.0.x di questo progetto

Questo progetto avvia una sequenza di versioni separata a partire da 1.0.0. Poiché il numero è inferiore alla versione 1.18.x del pacchetto originale, alcuni televisori potrebbero non consentire l'aggiornamento diretto. In tal caso:

1. Annota le impostazioni che vuoi ripristinare.
2. Disinstalla la vecchia app tramite il gestore applicazioni del televisore o lo strumento usato per l'installazione.
3. Installa il pacchetto di questo progetto e abbina/configura nuovamente gli host, se necessario.

La disinstallazione può rimuovere i dati locali dell'app. Questa limitazione deriva dall'avvio di una serie di versioni distinta con la stessa identità applicativa Tizen; non significa che il WGT non sia stato compilato correttamente.

## Aggiornare le build sperimentali

I WGT sperimentali di GitHub Actions sono artefatti temporanei di test. Scarica l'artefatto dalla specifica esecuzione del workflow invece di usare un vecchio URL memorizzato nella cache e controlla lo SHA del commit prima di installarlo. Non presumere che un artefatto sperimentale equivalga a una release stabile taggata.
