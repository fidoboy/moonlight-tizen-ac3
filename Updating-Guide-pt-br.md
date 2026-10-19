---
layout: docs-page
lang: pt-BR
title: "Guia de atualização"
description: "Como atualizar o Moonlight Tizen e migrar de outras builds."
---

# Guia de atualização

## Atualizar para uma release mais recente do projeto

1. Abra a [página de releases](https://github.com/fidoboy/moonlight-tizen-ac3/releases).
2. Baixe o `Moonlight.wgt` mais recente ou `Moonlight-ForceGM.wgt`, se você usa especificamente essa variante.
3. Instale-o pelo mesmo método usado anteriormente (Apps2Samsung, Tizen Studio ou a ferramenta adequada ao dispositivo).
4. Inicie o Moonlight e confira se as configurações salvas e os hosts pareados continuam presentes.

Sempre que possível, use a mesma variante de pacote e o mesmo método de assinatura/instalação. Se a TV recusar a atualização por conflito de versão ou certificado, consulte o [Guia de instalação](Installation-Guide-pt-br.md).

## Migrar do pacote Brightcraft 1.18.x para a série 1.0.x deste projeto

Este projeto começa uma sequência de versões separada em 1.0.0. Como esse número é menor que a versão 1.18.x do aplicativo original, algumas TVs podem não permitir uma atualização direta. Nesse caso:

1. Anote as configurações que deseja restaurar.
2. Desinstale o aplicativo antigo pelo gerenciador de aplicativos da TV ou pela ferramenta usada na instalação.
3. Instale o pacote deste projeto e faça o pareamento/configuração dos hosts novamente, se necessário.

A desinstalação pode remover dados locais do aplicativo. Essa limitação ocorre porque uma nova sequência de versões usa a mesma identidade de aplicativo Tizen; não significa que o WGT tenha sido compilado incorretamente.

## Atualizar builds experimentais

WGTs experimentais do GitHub Actions são artefatos temporários de teste. Baixe o artefato da execução de workflow relevante em vez de usar uma URL antiga armazenada em cache e verifique o SHA do commit antes da instalação. Não presuma que um artefato experimental seja equivalente a uma release estável marcada por tag.
