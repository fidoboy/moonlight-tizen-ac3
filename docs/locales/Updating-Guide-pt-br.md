---
layout: docs-page
lang: undefined
title: "Guia de atualização"
description: "Como atualizar o Moonlight Tizen em uma Samsung Smart TV e escolher a variante correta do pacote."
---

# Guia de atualização

## Atualizar para uma versão mais recente do projeto

1. Abra a [página de releases](https://github.com/fidoboy/moonlight-tizen-ac3/releases).

2. Baixe a versão mais recente do **Moonlight.wgt** ou o **Moonlight-ForceGM.wgt**, caso use especificamente essa variante.

3. Instale usando o mesmo método utilizado anteriormente (Apps2Samsung, Tizen Studio ou a ferramenta correspondente ao dispositivo).

4. Inicie o Moonlight e confirme que suas configurações salvas e os hosts pareados continuam presentes.

Sempre que possível, use a mesma variante do pacote e o mesmo método de assinatura/instalação. Se a TV recusar a atualização por conflito de versão ou certificado, consulte o [Guia de instalação](Installation-Guide-pt-br.html).

## Migrar do pacote Brightcraft 1.18.x para a série 1.0.x deste projeto

Este projeto inicia uma sequência de versões separada em 1.0.0. Como esse número é inferior à versão 1.18.x do pacote original, algumas TVs podem não permitir a instalação como atualização direta. Nesse caso:

1. Anote as configurações que deseja restaurar.

2. Desinstale o aplicativo antigo pelo gerenciador de aplicativos da TV ou pela ferramenta usada na instalação.

3. Instale o novo pacote do projeto e pareie/configure os hosts novamente, se necessário.

A desinstalação pode remover dados locais do aplicativo. Essa limitação decorre do início de uma sequência de versões independente que mantém a mesma identidade de aplicativo do Tizen; não significa que o WGT tenha sido compilado incorretamente.

## Atualizar builds experimentais

Os WGTs experimentais do GitHub Actions são artefatos temporários de teste. Baixe o artefato na execução de workflow correspondente, em vez de usar uma URL antiga em cache, e confira o SHA do commit antes de instalar. Não presuma que um artefato experimental equivale a uma versão estável marcada com tag.
