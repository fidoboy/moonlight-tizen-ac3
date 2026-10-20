---
layout: docs-page
lang: pt-BR
title: "Visão geral dos recursos"
description: "Recursos do Moonlight Tizen, suporte a áudio Dolby e configuração."
---

# Visão geral dos recursos

Esta página descreve o projeto do cliente Moonlight para Tizen. A disponibilidade dos recursos depende do modelo da TV, da versão do Tizen, da configuração do host, da rede e dos periféricos conectados.

## Principal diferencial em relação a outros clientes: áudio Dolby pela saída digital

O principal diferencial do projeto é o passthrough opcional de áudio Dolby Digital e Dolby Digital Plus para TVs Samsung compatíveis conectadas a um receiver ou sistema de som pela saída óptica (TOSLINK) ou HDMI.

- **AC-3 (Dolby Digital):** áudio comprimido estéreo ou 5.1 pode ser enviado ao renderizador de áudio EMSS nativo do Tizen quando o host negocia AC-3 com sucesso.
- **E-AC-3 (Dolby Digital Plus):** compatível quando o host, o firmware da TV, a configuração de saída de áudio e o equipamento receptor aceitam o formato. E-AC-3 pela saída óptica não é garantido em todas as TVs.
- **Estéreo e 5.1:** o encoder experimental correspondente do Sunshine oferece estéreo e 5.1. AC-3 é limitado a 5.1. A seleção 7.1 continua disponível pelo caminho de áudio normal quando suportada, mas não faz parte do caminho atual do encoder Dolby.
- **Negociação opcional:** habilite **Enable Dolby Digital** para solicitar o caminho Dolby. O áudio Dolby só é usado quando o host anuncia e seleciona um formato compatível.
- **Compatibilidade com OPUS:** se um host enviar apenas OPUS, não anunciar a extensão Dolby opcional ou não selecionar um formato Dolby, o cliente continuará usando o caminho OPUS normal. Hosts somente com OPUS não precisam de alterações.
- **Host compatível:** o passthrough Dolby atualmente exige o branch experimental correspondente [fidoboy/Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio). O caminho normal de áudio do cliente continua disponível quando essa funcionalidade não existe no host.

O caminho de áudio óptico foi testado de ponta a ponta com uma build experimental do Sunshine, uma TV Samsung e um sistema de som compatível conectado por óptico. Os resultados podem variar conforme o modelo da TV, o firmware e o receiver. Consulte [Problemas conhecidos e limitações](Known-Issues-and-Limitations-pt-br.html#dolby-optical-audio).

## Estatísticas do fluxo de áudio

O overlay de desempenho pode ser aberto com **Ctrl+Alt+Shift+S** se houver um teclado conectado à TV. Como alternativa, pressione **Play/Pause** ou **Voltar** no controle remoto da TV para abrir o menu da transmissão e selecionar a opção de estatísticas. Ele informa o codec de áudio negociado, o layout e o número de canais e uma taxa de bits medida aproximada, junto das estatísticas de vídeo e streaming existentes. O codec mostrado reflete a sessão ativa, não apenas a preferência selecionada.

## Outras melhorias específicas deste projeto

- **Localização da interface:** a interface está disponível em inglês, espanhol, alemão, francês, italiano, russo e português brasileiro.
- **Menu de streaming acessível pelo controle remoto:** abra o menu de streaming com **Play/Pause** ou **Voltar** no controle remoto da TV para acessar os controles e as estatísticas sem precisar de um teclado.
- **Overlay de estatísticas em tempo real aprimorado:** inclui gráficos ao vivo da latência do host e da qualidade/velocidade da conexão, ajudando a identificar picos de latência, recepção degradada, largura de banda insuficiente e outros problemas de comunicação.
- **Atalhos de inicialização direta pelo Smart Hub:** inicie diretamente pelo Smart Hub os aplicativos configurados no host remoto, ignorando a interface usual do Moonlight, a verificação de atualizações e a descoberta de hosts.
- **Fechar o aplicativo do host ao desconectar:** solicitação opcional, sujeita à disponibilidade, para fechar o aplicativo do host em execução após uma desconexão normal. Falhas inesperadas de conexão não acionam essa opção.
- **Tela nativa de inicialização animada:** adiciona uma tela de abertura animada para comportamentos de inicialização compatíveis com Tizen.
- **Ajustes da saída digital:** melhora o estado das configurações, as opções de canais e a navegação pelo controle remoto quando Dolby está habilitado.
- **Inicialização:** melhora a transição da tela nativa de abertura para a lista de hosts e evita um overlay desnecessário de carregamento em tela cheia.
- **Aprimoramentos de entrada e interface:** inclui melhorias no teclado, foco e navegação pelas configurações.


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

Dolby é uma extensão opcional e não substitui o protocolo geral de streaming OPUS. O host Sunshine correspondente também deve ser compilado com o encoder Dolby disponível e configurado para selecionar AC-3 ou E-AC-3. Para instalar, comece pelo [Guia de início rápido](Quick-Start-Guide-pt-br.html).
