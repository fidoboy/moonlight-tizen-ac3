---
layout: docs-page
lang: de
title: "Entwicklungsleitfaden"
description: "Lokale Builds, CI-Artefakte und GitHub-Releases für Moonlight Tizen."
---

# Entwicklungsleitfaden

## Repository und Abhängigkeiten

Klone dieses Repository vor dem Build:

    git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
    cd moonlight-tizen-ac3

Das aktuelle Repository enthält keine aktiven Git-Submodule: Die benötigten Abhängigkeitsquellen sind direkt im Repository eingecheckt. Ein normaler Clone reicht aus; `git submodule update --init --recursive` ist nicht erforderlich.

## Mit Docker bauen

Die Dockerfile des Repositorys enthält die Build-Umgebung und paketiert das Tizen-Widget. Führe im Stammverzeichnis des Repositorys den Build der Standardvariante aus:

    docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
    container_id=$(docker create moonlight-tizen-ac3:standard)
    docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
    docker rm "$container_id"

Für das ForceGM-Paket wiederholst du den Build mit `FORCE_GAME_MODE=true` und extrahierst `/home/moonlight/Moonlight-ForceGM.wgt`.

## Kontinuierliche Integration

Der Workflow **Build WGT (CI)** prüft das Start-JavaScript, die Konsistenz der Übersetzungen und die erforderlichen Dokumentationsseiten. Anschließend baut er die Standard- und ForceGM-Paketvarianten. Er läuft bei Änderungen am Branch `master), bei Pull Requests und kann manuell gestartet werden. CI-Artefakte sind temporäre Test-Builds und keine versionierten öffentlichen Releases.

## Ein öffentliches Release veröffentlichen

Das Projekt verwendet eine eigene semantische Versionsreihe, beginnend mit **1.0.0**. Die Widget-Version in `res/config.xml` ist maßgeblich.

1. Aktualisiere die Version in `res/config.xml` (zum Beispiel auf `1.0.1` für das nächste Patch-Release).
2. Ergänze die Release-Notizen am Anfang von `CHANGELOG.md`.
3. Committe die Release-Änderungen und merge sie nach `master`.
4. Öffne Actions → **Release WGTs**, starte den Workflow auf `master` und gib dieselbe Version ein. Der Workflow prüft die Version, überschreibt kein vorhandenes öffentliches Release, baut beide WGT-Varianten und veröffentlicht ein GitHub Release mit dem Tag `vVERSION`.

Alternativ kannst du nach der Aktualisierung von `res/config.xml` einen Git-Tag wie `v1.0.1` pushen. Derselbe Workflow baut die Pakete und fügt sie automatisch zum Release hinzu. Stabile Releases verwenden einen einfachen semantischen Versions-Tag; Vorabversionen erhalten den Suffix `-dev`.

## Hinweise zur Audioentwicklung

Dolby-Passthrough setzt den Tizen-Client und einen kompatiblen experimentellen Sunshine-Host voraus. Es ist optional und darf den standardmäßigen OPUS-Pfad für Hosts ohne AC-3/E-AC-3 niemals deaktivieren. Prüfe bei Tests die tatsächliche Aushandlung und Ausgabe über den vorgesehenen optischen Audiopfad des Fernsehers, nicht nur die gewählte Einstellung.

Halte Pull Requests gezielt, erhalte Lizenzhinweise und dokumentiere hardwareabhängiges Verhalten sowie Testbedingungen.
