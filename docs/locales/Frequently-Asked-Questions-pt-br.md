---
layout: docs-page
lang: pt-BR
title: "Perguntas frequentes"
description: "Respostas sobre compatibilidade de hosts, áudio Dolby e configurações do Moonlight Tizen."
---

# Perguntas frequentes

## Este projeto funciona com hosts Sunshine comuns?

Sim. A extensão Dolby é opcional. Se o host não anunciar ou selecionar AC-3/E-AC-3, o cliente mantém o caminho OPUS normal. Um host que transmite somente OPUS não precisa de alterações específicas para Dolby.

## Como obter Dolby Digital 5.1 pela saída óptica?

Você precisa de todos os itens a seguir:

- Este projeto com **Enable Dolby Digital** ativado.
- Uma build correspondente do Sunshine com a implementação `ac3-audio` e um encoder Dolby disponível.
- Uma TV capaz de transmitir o bitstream Dolby selecionado pela saída óptica.
- Configurações de áudio da TV ajustadas para um modo de passthrough/bitstream compatível.
- Um receiver ou sistema de som compatível com AC-3 e com o layout de canais enviado.

Na configuração inicial, selecione 5.1 e confira a linha **Audio stream** no overlay de estatísticas (`Ctrl+Alt+Shift+S`).

## Ativar Dolby Digital força Dolby em qualquer host?

Não. A opção solicita o codec opcional durante a negociação. Se Dolby não for oferecido ou selecionado pelo host, o Moonlight usará OPUS. O codec ativo mostrado no overlay de estatísticas é a maneira confiável de verificar o que a sessão está recebendo.

## Dolby Digital Plus sempre funciona via TOSLINK?

Não. O suporte a E-AC-3 depende do modelo específico da TV Samsung, do firmware, do modo de saída de áudio e do equipamento receptor. Algumas saídas ópticas de TV suportam apenas parte dos formatos de bitstream. Use AC-3 se o equipamento não aceitar E-AC-3.

## O passthrough Dolby pode transportar áudio 7.1?

O caminho atual do encoder experimental do Sunshine destina-se a estéreo ou 5.1. O próprio AC-3 é limitado a 5.1. O streaming OPUS normal pode oferecer outros layouts de canais quando host e cliente os suportam.

## Como ver o codec de áudio ativo?

Durante o streaming, pressione **Ctrl+Alt+Shift+S** para exibir ou ocultar o overlay de estatísticas. A linha de áudio informa o codec negociado, o layout, o número de canais e o bitrate aproximado.

## Qual é a diferença entre Moonlight.wgt e Moonlight-ForceGM.wgt?

`Moonlight.wgt` é o pacote padrão. `Moonlight-ForceGM.wgt` inclui metadados adicionais de Game Mode para situações em que essa variante é útil. Ela não consegue habilitar Game Mode se a plataforma não oferecer suporte.

## Onde encontrar informações sobre a TV e o aplicativo?

No aplicativo, abra Settings e depois About/System Information. Ao investigar um problema, anote o modelo da TV, a versão do Tizen, as versões do cliente e do host e as configurações selecionadas de vídeo e áudio.

## Quais controles posso usar?

A compatibilidade depende do modelo da TV, da versão do Tizen e do tipo de conexão. Um controle Bluetooth ou USB reconhecido pela própria TV é o melhor ponto de partida. Se ele não funcionar no Moonlight, confirme primeiro que a TV o reconhece e consulte o [Guia de solução de problemas](../Troubleshooting-Guide.html).
