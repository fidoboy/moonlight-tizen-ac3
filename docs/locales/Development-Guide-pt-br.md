---
layout: docs-page
lang: pt-BR
title: "Guia de desenvolvimento"
description: "Builds locais, artefatos de CI e releases do GitHub para Moonlight Tizen."
---

# Guia de desenvolvimento

## Repositório e dependências

Clone este repositório antes de compilar:

    git clone https://github.com/fidoboy/moonlight-tizen-ac3.git
    cd moonlight-tizen-ac3

O repositório atual não possui submódulos Git ativos: o código-fonte das dependências necessárias está incluído diretamente no repositório. Um clone normal é suficiente; não é necessário executar `git submodule update --init --recursive`.

## Compilar com Docker

O Dockerfile do repositório inclui o ambiente de compilação e empacota o widget Tizen. Na raiz do repositório, compile a variante padrão:

    docker build --tag moonlight-tizen-ac3:standard --build-arg BUILD_TYPE=release --build-arg REPO_OWNER=fidoboy --build-arg REPO_NAME=moonlight-tizen-ac3 --build-arg FORCE_GAME_MODE=false .
    container_id=$(docker create moonlight-tizen-ac3:standard)
    docker cp "$container_id:/home/moonlight/Moonlight.wgt" ./Moonlight.wgt
    docker rm "$container_id"

Para compilar o pacote ForceGM, repita o build com `FORCE_GAME_MODE=true` e extraia `/home/moonlight/Moonlight-ForceGM.wgt`.

## Integração contínua

O workflow **Build WGT (CI)** valida o JavaScript de inicialização, a consistência das traduções e as páginas de documentação obrigatórias; em seguida, compila as variantes padrão e ForceGM do pacote. Ele é executado quando há alterações no branch `master` e em pull requests, e também pode ser iniciado manualmente. Os artefatos de CI são builds temporários de teste, não releases públicas versionadas.

## Publicar uma release pública

O projeto usa sua própria sequência de versões semânticas, começando em **1.0.0**. A versão do widget Tizen em `res/config.xml` é a referência oficial.

1. Atualize a versão em `res/config.xml` (por exemplo, `1.0.1` para a próxima correção).
2. Adicione as notas da release no início de `CHANGELOG.md`.
3. Faça commit das alterações e integre-as ao branch `master`.
4. Abra Actions → **Release WGTs**, execute o workflow em `master` e informe a mesma versão. O workflow valida a versão, impede sobrescrever uma release pública existente, compila as duas variantes WGT e publica uma GitHub Release com a tag `vVERSION`.

Como alternativa, envie uma tag Git como `v1.0.1` depois de configurar a versão correspondente em `res/config.xml`. O mesmo workflow compila os pacotes e os anexa automaticamente à release. Releases estáveis usam a tag semântica simples; builds preliminares usam o sufixo `-dev`.

## Notas de desenvolvimento de áudio

O passthrough Dolby exige o cliente Tizen e um host Sunshine experimental compatível. É opcional e nunca deve desativar o caminho OPUS padrão para hosts que não oferecem AC-3/E-AC-3. Ao testar, verifique a negociação e a saída reais pelo caminho óptico previsto do televisor, e não apenas a configuração selecionada.

Mantenha os pull requests objetivos, preserve os avisos de licença e documente comportamentos dependentes do hardware e as condições de teste.
