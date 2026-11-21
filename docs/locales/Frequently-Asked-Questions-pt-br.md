---
layout: docs-page
lang: pt-BR
title: "Perguntas frequentes"
description: "Respostas sobre compatibilidade de hosts, áudio Dolby e configurações do Moonlight Tizen."
---

# Perguntas frequentes


## Como atualizo o aplicativo quando há uma nova versão disponível?

O próprio aplicativo na TV avisará quando houver uma nova versão disponível. Caso tenha utilizado o método de instalação recomendado pelo Apps2Samsung, basta abrir o Apps2Samsung novamente e selecionar **Moonlight** com a variante **fidoboy · Enhanced · Dolby** para baixar a versão mais recente. Para uma instalação manual, o novo pacote WGT pode ser baixado na [página da versão mais recente](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest) e instalado na TV.

## Como posso obter melhor qualidade de imagem ou configurar o Moonlight para uma transmissão mais estável?

O ideal é manter a otimização automática da taxa de bits ativada durante as primeiras conexões. A cada nova conexão, o Moonlight recalcula a taxa de bits recomendada com base nas configurações e nas características negociadas que afetam o uso da largura de banda, buscando um valor equilibrado para a configuração utilizada. Quando esse valor parar de mudar porque as configurações do host e do Moonlight permanecerem iguais, ele poderá ser usado como ponto de partida para ajustes manuais: desative a otimização automática e aumente a taxa de bits gradualmente para tentar melhorar a qualidade da imagem, utilizando mais largura de banda da rede, ou reduza-a um pouco se as condições da rede forem menos favoráveis, aceitando alguma perda de qualidade de imagem. Até onde será possível ajustar a taxa de bits dependerá da capacidade do hardware em todas as pontas da transmissão e da largura de banda disponível. A partir de certo ponto, aumentar a taxa de bits pode deixar de trazer uma melhora perceptível na qualidade da imagem, mesmo que a rede consiga transportá-la.

## Este projeto funciona com Sunshine ou outros hosts compatíveis com GameStream?

Sim. Este cliente Moonlight deve funcionar corretamente tanto com o antigo [NVIDIA GameStream](https://nvidia.custhelp.com/app/answers/detail/a_id/5436/~/game-stream-service-update) quanto com softwares de host modernos e compatíveis, como [Sunshine](https://github.com/LizardByte/Sunshine), [Apollo](https://github.com/ClassicOldSong/Apollo), [Punktfunk](https://punktfunk.unom.io/), [Vibeshine](https://github.com/Nonary/vibeshine) ou qualquer outro servidor que utilize o mesmo protocolo. Recomenda-se utilizar o Vibeshine, pois ele oferece recursos avançados e suporte nativo a áudio Dolby Digital. Se o Dolby Digital estiver ativado nas configurações do Moonlight, mas o host não oferecer suporte nativo a Dolby Digital, o Moonlight tentará disponibilizá-lo por meio de codificação por software, quando possível; caso contrário, adotará uma abordagem de melhor esforço. Se não for possível utilizar Dolby Digital durante uma transmissão, o Moonlight manterá a compatibilidade com versões anteriores e retornará ao áudio OPUS padrão.

## Como obter Dolby Digital 5.1 pelas saídas óptica ou HDMI da TV?

Para usar Dolby Digital pelas saídas de áudio da TV, você precisa de:

- Este projeto com **Enable Dolby Digital** ativado.
- Um dispositivo de áudio externo conectado à TV, caso queira utilizá-lo, especialmente para aproveitar o som surround 5.1.
- Uma TV capaz de transmitir o áudio pela saída óptica ou por uma conexão HDMI ARC/eARC. O resultado pode variar de acordo com o modelo da TV e a versão do Tizen utilizada.
- Um receiver ou sistema de som externo capaz de decodificar Dolby Digital (AC-3) ou Dolby Digital Plus (E-AC-3), caso a TV envie o áudio em um desses formatos.

Não é necessário que o host forneça nativamente um stream de áudio Dolby Digital. O Moonlight pode fornecer Dolby Digital por meio do próprio processamento de áudio; portanto, o resultado depende principalmente dos recursos e das configurações de áudio da TV. São compatíveis tanto as conexões ópticas quanto HDMI ARC/eARC.

Na configuração inicial, selecione 5.1 e confira a linha **Audio stream** no overlay de estatísticas. Você pode deixar as estatísticas ativadas na seção **Configurações avançadas** do Moonlight ou exibi-las manualmente durante a transmissão: abra o menu da transmissão com **Play/Pause** no controle remoto da TV ou mantendo pressionado o botão **Select** do gamepad e, em seguida, selecione a opção de estatísticas. Se houver um teclado conectado à TV, você poderá mostrar ou ocultar as estatísticas diretamente com **Ctrl+Alt+Shift+S**.

## Ativar Dolby Digital força Dolby em qualquer host?

Não. A opção solicita Dolby Digital durante a negociação da transmissão, mas não obriga todos os hosts a fornecê-lo. Se Dolby Digital não for oferecido ou se o host não puder selecioná-lo ou disponibilizá-lo, o Moonlight utilizará OPUS ou o caminho de áudio compatível disponível. O overlay de estatísticas fornece as informações mais detalhadas sobre o formato de áudio negociado para a transmissão e pode ser ativado opcionalmente. Também é possível verificar a saída real de forma mais confiável no receiver ou sistema de som externo, caso ele tenha um display ou LED indicador que acenda ao receber um sinal Dolby Digital. Isso permite confirmar se o áudio que está sendo reproduzido corresponde às configurações selecionadas no Moonlight. Em última análise, o sucesso depende da combinação dos recursos do host, do modelo da TV e de como ela processa o áudio, além das características do equipamento de áudio externo.

## Dolby Digital Plus sempre funciona via TOSLINK?

Não. O suporte a E-AC-3 depende do modelo específico da TV Samsung, do firmware, do modo de saída de áudio e do equipamento receptor. Algumas saídas ópticas de TV suportam apenas parte dos formatos de bitstream. Recomenda-se usar AC-3 caso o equipamento não aceite E-AC-3.

## O passthrough Dolby pode transportar áudio 7.1?

A implementação atual é limitada a estéreo e 5.1 canais. Teoricamente, o E-AC-3 oferece suporte a 7.1, mas o caminho do encoder FFmpeg usado nesta versão ainda não disponibiliza essa opção. Se o FFmpeg adicionar esse suporte no futuro, talvez seja possível selecionar 7.1 para E-AC-3. O próprio AC-3 continua limitado a 5.1. O streaming OPUS padrão pode oferecer outros layouts de canais quando host e cliente os suportarem.

## Como ver o codec de áudio ativo?

Se houver um teclado conectado à TV, pressione **Ctrl+Alt+Shift+S** para mostrar ou ocultar o overlay de estatísticas. Como alternativa, pressione **Play/Pause** ou **Voltar** no controle remoto da TV para abrir o menu da transmissão e selecione a opção para exibir as estatísticas. A linha de áudio informa o codec negociado, o layout, o número de canais e o bitrate aproximado.

## Qual é a diferença entre Moonlight.wgt e Moonlight-ForceGM.wgt?

`Moonlight.wgt` é o pacote padrão. `Moonlight-ForceGM.wgt` inclui metadados adicionais de Game Mode para situações em que essa variante é útil. Ela não consegue habilitar Game Mode se a plataforma não oferecer suporte.

## Onde encontrar informações sobre a TV e o aplicativo?

No aplicativo, abra Settings e depois About/System Information. Ao investigar um problema, anote o modelo da TV, a versão do Tizen, as versões do cliente e do host e as configurações selecionadas de vídeo e áudio.

## Quais controles posso usar?

A compatibilidade depende do modelo da TV, da versão do Tizen e do tipo de conexão. Um controle Bluetooth ou USB reconhecido pela própria TV é o melhor ponto de partida. Se ele não funcionar no Moonlight, confirme primeiro que a TV o reconhece e consulte o [Guia de solução de problemas](../Troubleshooting-Guide.html).
