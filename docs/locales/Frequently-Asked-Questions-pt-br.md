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

## Como visualizar os codecs de vídeo e áudio ativos?

Se houver um teclado conectado à TV, pressione **Ctrl+Alt+Shift+S** para mostrar ou ocultar o overlay de estatísticas. Como alternativa, pressione **Play/Pause** no controle remoto da TV ou mantenha pressionado por um segundo o botão **Select** do gamepad e, em seguida, solte-o para abrir o menu da transmissão. Depois, selecione a opção para exibir as estatísticas.

As linhas dos fluxos no overlay fornecem mais informações do que apenas os nomes dos codecs negociados:

- **Video stream:** mostra a resolução e a taxa de quadros da transmissão, seguidas pelo codec de vídeo negociado. Quando H.264 é usado, o nível correspondente também pode ser exibido (por exemplo, **H.264 L4.1**). Esse é o nível H.264 selecionado de acordo com a resolução e a taxa de quadros da transmissão, não o perfil H.264 Baseline. Quando o HDR está ativado e foi negociado corretamente com o host, o codec é identificado como **HEVC 10-bit HDR** ou **AV1 10-bit HDR**. Se o codec de 10 bits correspondente aparecer como **SDR**, o HDR não foi negociado para aquela transmissão.
- **Audio stream:** mostra o codec de áudio negociado (OPUS, AC-3 ou E-AC-3), o layout e a quantidade de canais e o bitrate recebido naquele momento. Esse bitrate é medido durante a transmissão e pode variar; não precisa permanecer igual ao valor negociado inicialmente com o host. A indicação **[Hardware]** ou **[Software]** identifica o caminho de processamento de áudio ativo. **[Hardware]** significa que a própria TV está realizando a decodificação com seu suporte nativo de hardware. Essa opção geralmente é preferível, pois evita a decodificação por software no Moonlight e ajuda a manter a latência no menor nível possível. **[Software]** significa que o Moonlight realiza decodificação por software ou conversão/transcodificação antes de entregar o áudio à TV, o que pode acrescentar latência de processamento.
- **Indicador HQ:** quando o áudio de alta qualidade foi solicitado, pode aparecer um sobrescrito **HQ** ao lado do codec. A cor verde indica que o host confirmou que o modo de alta qualidade está ativo. A cor branca indica que a solicitação foi feita, mas o Moonlight não conseguiu confirmar pela resposta do host que esse modo está realmente sendo utilizado.
- **Audio input / Audio transcode:** quando o Moonlight processa o áudio ou converte seu formato por software antes de enviá-lo à TV, linhas adicionais mostram o bitrate do fluxo de áudio recebido e o tempo médio gasto no processamento de cada segmento de áudio. Isso pode ocorrer quando a TV não oferece suporte nativo ao formato recebido, quando o Moonlight converte OPUS para PCM, AC-3 ou E-AC-3, ou quando o fluxo AC-3 ou E-AC-3 recebido é convertido para outro formato, como PCM, devido às capacidades da TV ou às configurações de áudio selecionadas. O tempo informado indica o atraso de processamento introduzido por esse caminho de áudio por software.
- **Audio FEC:** mostra quantos pacotes de áudio foram recuperados, quantos blocos FEC falharam e quantos pacotes chegaram fora de ordem durante o intervalo de medição mais recente.

A linha **Frame rates** informa separadamente os quadros por segundo recebidos, decodificados e aceitos pelo renderizador. **Incoming bitrate from network** mostra o bitrate total efetivamente recebido pela rede. Esse valor pode variar durante a transmissão e não precisa permanecer igual ao valor negociado inicialmente. As demais estatísticas informam a latência da rede, os quadros ausentes, o tempo médio de decodificação, o atraso na fila de quadros e o tempo de envio ao renderizador.

## Onde encontrar informações sobre a TV e o aplicativo?

No aplicativo, abra Settings e depois About/System Information. Ao investigar um problema, anote o modelo da TV, a versão do Tizen, as versões do cliente e do host e as configurações selecionadas de vídeo e áudio.

## Quais controles posso usar?

A compatibilidade depende do modelo da TV, da versão do Tizen e do tipo de conexão. Um controle Bluetooth ou USB reconhecido pela própria TV é o melhor ponto de partida. Se ele não funcionar no Moonlight, confirme primeiro que a TV o reconhece e consulte o [Guia de solução de problemas](../Troubleshooting-Guide.html).
