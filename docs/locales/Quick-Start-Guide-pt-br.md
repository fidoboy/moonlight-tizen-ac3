---
layout: docs-page
lang: pt-BR
title: "Guia de início rápido"
description: "Primeiros passos com Moonlight Tizen e hosts compatíveis com GameStream."
---

# Guia de início rápido

Este guia mostra o caminho mais curto da instalação até uma transmissão funcionando em uma Samsung Smart TV.

## 1. Verifique a configuração

Você precisará de:

- Uma Samsung Smart TV com Tizen 5.5 ou posterior.
- Um PC com Sunshine ou outro host compatível com GameStream.
- Uma GPU no host com suporte a codificação por hardware.
- Uma conexão de rede estável entre a TV e o PC. Ethernet no host e Wi-Fi 5 GHz confiável ou Ethernet na TV são boas opções para começar.
- Um controle compatível, caso queira jogar com gamepad.

Consulte os [pré-requisitos no README](README-pt-br.html#pré-requisitos) para mais detalhes.

## 2. Instale o cliente

Baixe o pacote padrão `Moonlight.wgt` na [página de releases](https://github.com/fidoboy/moonlight-tizen-ac3/releases). Escolha o pacote ForceGM apenas se precisar especificamente dos metadados alternativos de Game Mode.

Siga o [Guia de instalação](Installation-Guide-pt-br.html) para usar Apps2Samsung, Tizen Studio ou outro método compatível.

## 3. Configure o host e faça o pareamento

1. Instale e inicie o Sunshine no PC host.
2. Verifique se o PC e a TV conseguem se comunicar na mesma rede e se o firewall do host permite conexões de streaming.
3. Inicie o Moonlight na TV e selecione o host quando ele aparecer.
4. O Moonlight exibirá um PIN. Abra a interface Web do Sunshine no PC, insira o PIN na seção de pareamento e confirme.
5. Selecione um jogo ou a área de trabalho para iniciar a transmissão.

Em uma nova configuração, comece com resolução, taxa de quadros e bitrate conservadores. Aumente-os depois de confirmar que a transmissão está estável.

## 4. Ative a saída óptica Dolby (opcional)

O passthrough Dolby exige a [build experimental Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondente. Baixe diretamente a versão Windows [x64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-AMD64.zip) ou [ARM64](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826/build-Windows-ARM64.zip). Também é necessário um caminho de áudio compatível na TV e um receiver ou sistema de som que suporte o formato.

1. Conecte a saída óptica da TV ao receiver ou sistema de som.
2. Nas configurações de som da TV, escolha um modo de saída que transmita um bitstream Dolby compatível em vez de forçar PCM estéreo. Os nomes variam por modelo.
3. Em Settings do Moonlight, habilite **Enable Dolby Digital** e selecione estéreo ou 5.1.
4. Inicie uma transmissão e abra o overlay de desempenho com **Ctrl+Alt+Shift+S**. Confira se a linha de áudio ativa informa OPUS, AC-3 ou E-AC-3 e o layout de canais esperado.

Se o host oferecer apenas OPUS, a transmissão continuará usando OPUS. Ativar uma opção no cliente não fará um host somente com OPUS enviar áudio Dolby.

## 5. Ajuste a transmissão

Quando a primeira transmissão estiver funcionando, ajuste resolução, taxa de quadros, bitrate, codec de vídeo e opções de áudio conforme os recursos da TV e da rede. Consulte a [Visão geral dos recursos](Features-Overview-pt-br.html) e as [Perguntas frequentes](Frequently-Asked-Questions-pt-br.html).
