---
layout: docs-page
lang: it
title: "Guida allo sviluppo"
description: "Build locali, artefatti CI e release GitHub di Moonlight Tizen."
---

# Guida allo sviluppo

## Repository e dipendenze

Clona questo repository prima di compilare:

    git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
    cd moonlight-tizen-ac3

Il repository attuale non contiene sottomoduli Git attivi: il codice sorgente delle dipendenze necessarie è incluso direttamente nel repository. È sufficiente un normale clone; non serve eseguire `git submodule update --init --recursive`.

## Compilare con Docker

Il Dockerfile del repository include l'ambiente di compilazione e crea il pacchetto widget Tizen. Dalla directory principale del repository, compila la variante standard:

    docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
    container_id=$(docker create moonlight-tizen-ac3:standard)
    docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
    docker rm "$container_id"

Per compilare il pacchetto ForceGM, ripeti la build con `FORCE_GAME_MODE=true` ed estrai `/home/moonlight/Moonlight-ForceGM.wgt`.

## Integrazione continua

Il workflow **Build WGT (CI)** convalida il JavaScript di avvio, la coerenza delle traduzioni e le pagine di documentazione richieste, quindi compila le varianti standard e ForceGM del pacchetto. Si avvia in seguito a modifiche al branch `master` e alle pull request; può anche essere eseguito manualmente. Gli artefatti CI sono build di test temporanee, non release pubbliche versionate.

## Pubblicare una release pubblica

Il progetto usa una propria sequenza di versioni semantiche, a partire da **1.0.0**. La versione del widget Tizen in `res/config.xml` è quella di riferimento.

1. Aggiorna la versione in `res/config.xml` (ad esempio `1.0.1` per la prossima patch).
2. Aggiungi le note di rilascio in cima a `CHANGELOG.md`.
3. Esegui il commit delle modifiche e uniscile a `master`.
4. Apri Actions → **Release WGTs**, avvialo su `master` e inserisci la stessa versione. Il workflow convalida la versione, impedisce di sovrascrivere una release pubblica esistente, compila entrambe le varianti WGT e pubblica una GitHub Release con tag `vVERSION`.

In alternativa, dopo aver impostato la versione corrispondente in `res/config.xml`, puoi inviare un tag Git come `v1.0.1`. Lo stesso workflow compila i pacchetti e li allega automaticamente alla release. Le release stabili usano il tag semantico semplice; le build preliminari usano il suffisso `-dev`.

## Note sullo sviluppo audio

Il passthrough Dolby richiede il client Tizen e un host Sunshine sperimentale compatibile. È facoltativo e non deve mai disabilitare il percorso OPUS predefinito per gli host che non offrono AC-3/E-AC-3. Durante i test, verifica la negoziazione reale e l'uscita attraverso il percorso ottico previsto del televisore, non soltanto l'impostazione selezionata.

Mantieni le pull request mirate, conserva gli avvisi di licenza e documenta il comportamento dipendente dall'hardware e le condizioni di test.
