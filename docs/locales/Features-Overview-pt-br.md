---
layout: docs-page
lang: pt-BR
title: "Visão geral dos recursos"
description: "Recursos do Moonlight Tizen, suporte a áudio Dolby e configuração."
---

# Visão geral dos recursos

Esta página descreve o projeto do cliente Moonlight para Tizen. A disponibilidade dos recursos depende do modelo da TV, da versão do Tizen, da configuração do host, da rede e dos periféricos conectados.

## Principal diferencial em relação a outros clientes: áudio Dolby pela saída digital

O principal diferencial deste projeto é a saída opcional de áudio Dolby Digital e Dolby Digital Plus em TVs Samsung compatíveis conectadas a um receiver ou sistema de som pela saída óptica (TOSLINK) ou HDMI. Diferentemente das versões anteriores, não é necessário que o host forneça um fluxo de áudio Dolby nativo.

- **AC-3 (Dolby Digital):** áudio comprimido estéreo ou 5.1 pode ser enviado ao renderizador de áudio EMSS nativo do Tizen quando o formato estiver disponível e for compatível com a TV e os dispositivos conectados.
- **E-AC-3 (Dolby Digital Plus):** compatível quando o firmware da TV, a configuração da saída de áudio e o equipamento receptor aceitam o formato. E-AC-3 pela saída óptica não é garantido em todas as TVs.
- **Suporte Dolby no host (recomendado):** se o host puder fornecer AC-3 ou E-AC-3 nativamente, o Moonlight poderá usar esse fluxo diretamente. Isso é altamente recomendável porque evita a conversão de áudio em tempo real no cliente da TV e, assim, reduz a latência adicional de processamento de áudio, melhorando a resposta aos controles e ao som.
- **Conversão de OPUS para Dolby:** se o host não fornecer áudio Dolby, ele poderá continuar enviando OPUS. O Moonlight para Tizen tentará converter o áudio OPUS recebido para Dolby Digital em tempo real, conforme o modelo da TV, os recursos de áudio do Tizen, as configurações selecionadas e os dispositivos de áudio conectados. Isso amplia a compatibilidade com hosts GameStream e diferentes configurações de TVs e equipamentos de som, embora a conversão por software possa adicionar latência.
- **Estéreo e som surround:** a disposição dos canais e o formato Dolby disponíveis dependem do fluxo recebido, do caminho de conversão e dos recursos da TV e do receiver. A saída AC-3 é limitada a 5.1 canais.

O caminho de áudio Dolby foi testado com TVs Samsung compatíveis e equipamentos de áudio externos. Os resultados podem variar conforme o modelo da TV, a versão do firmware e o receiver. Consulte [Problemas conhecidos e limitações](Known-Issues-and-Limitations-pt-br.html#dolby-optical-audio).

## Estatísticas do fluxo de áudio

O overlay de desempenho pode ser aberto com **Ctrl+Alt+Shift+S** se houver um teclado conectado à TV. Como alternativa, pressione **Play/Pause** ou **Voltar** no controle remoto da TV para abrir o menu da transmissão e selecionar a opção de estatísticas. Ele informa o codec de áudio negociado, o layout e o número de canais e uma taxa de bits medida aproximada, junto das estatísticas de vídeo e streaming existentes. O codec mostrado reflete a sessão ativa, não apenas a preferência selecionada.

## Outras melhorias específicas deste projeto

- **Localização da interface:** a interface está disponível em inglês, espanhol, alemão, francês, italiano, russo e português brasileiro.
- **Menu de streaming acessível pelo controle remoto:** abra o menu de streaming com **Play/Pause** ou **Voltar** no controle remoto da TV. Você também pode manter **Select** pressionado por um segundo em um controle de jogo e soltá-lo para acessar os controles e as estatísticas sem precisar de um teclado.
- **Overlay de estatísticas em tempo real aprimorado:** inclui gráficos ao vivo da latência do host e da qualidade/velocidade da conexão, ajudando a identificar picos de latência, recepção degradada, largura de banda insuficiente e outros problemas de comunicação.
- **Atalhos de inicialização direta pelo Smart Hub:** inicie diretamente pelo Smart Hub os aplicativos configurados no host remoto, ignorando a interface usual do Moonlight, a verificação de atualizações e a descoberta de hosts.
- **Fechar o aplicativo do host ao desconectar:** solicitação opcional, sujeita à disponibilidade, para fechar o aplicativo do host em execução após uma desconexão normal. Falhas inesperadas de conexão não acionam essa opção.
- **Tela nativa de inicialização animada:** adiciona uma tela de abertura animada para comportamentos de inicialização compatíveis com Tizen.
- **Ajustes da saída digital:** melhora o estado das configurações, as opções de canais e a navegação pelo controle remoto quando Dolby está habilitado.
- **Inicialização:** melhora a transição da tela nativa de abertura para a lista de hosts e evita um overlay desnecessário de carregamento em tela cheia.
- **Aprimoramentos de entrada e interface:** inclui melhorias no teclado, foco e navegação pelas configurações.

- **Temas e decorações da interface:** permite escolher entre diferentes esquemas de cores e decorações da interface.
- **Protetor de tela:** é exibido enquanto nenhuma transmissão está sendo recebida.
- **Planos de fundo animados:** adiciona opções de fundos animados à interface.
- **Melhorias no processamento de áudio:** aprimora o processamento e a conversão dos diferentes formatos de áudio compatíveis.

## Recursos principais herdados do projeto comunitário Moonlight Tizen

- Transmita jogos, aplicativos e toda a área de trabalho de instalações compatíveis com NVIDIA GameStream ou Sunshine.
- Suporte a TVs Samsung com versões compatíveis do Tizen (5.5 ou posterior).
- Decodificação de vídeo H.264, HEVC e AV1 quando compatível com a TV e a GPU do host.
- Streaming HDR e configuração de resolução, taxa de quadros, bitrate e faixa de cores, dentro dos limites do hardware.
- Descoberta e pareamento automáticos do host, com IPv4, IPv6, nomes DNS e portas personalizadas opcionais.
- Wake-on-LAN, status online/offline do host, ordenação de aplicativos e gerenciamento de hosts.
- Entrada de teclado, mouse e controle, incluindo vários controles, navegação com controle e emulação opcional do mouse.
- Backends de áudio EMSS e Web Audio, com configurações que dependem do backend selecionado.
- Suporte a Smart Hub Preview quando disponível na versão do Tizen.
- Estatísticas de streaming, avisos de conexão e opções relacionadas à latência, como Game Mode, quando compatíveis.

## Observação sobre compatibilidade

O Moonlight para Tizen é compatível com qualquer software de host que utilize o protocolo GameStream; não é necessário que o host forneça áudio Dolby Digital. No entanto, se você quiser usar Dolby Digital, é preferível que o host possa fornecer AC-3 ou E-AC-3 nativamente. A saída Dolby nativa evita a conversão de OPUS para Dolby em tempo real no cliente da TV, reduz a latência adicional de processamento de áudio e geralmente proporciona uma experiência mais responsiva. Se o host fornecer apenas OPUS, o Moonlight tentará fazer a conversão em tempo real quando a TV e os dispositivos de áudio conectados permitirem. Para instalar, comece pelo [Guia de início rápido](Quick-Start-Guide-pt-br.html).
