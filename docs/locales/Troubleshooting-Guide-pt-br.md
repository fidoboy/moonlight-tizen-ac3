---
layout: docs-page
lang: pt-BR
title: "Guia de solução de problemas"
description: "Soluções para problemas comuns de conexão, áudio e streaming no Moonlight Tizen."
---

# Guia de solução de problemas

## O Moonlight não encontra o host

1. Confirme que o Sunshine está em execução e que a TV e o PC estão acessíveis na mesma rede.
2. Verifique o firewall do host e as configurações de isolamento do roteador.
3. Tente adicionar o host usando o endereço IPv4, o endereço IPv6 ou o nome DNS do PC.
4. Se o host usar portas personalizadas, confirme que elas estão configuradas de forma consistente.
5. Se a descoberta funcionar de forma intermitente, teste uma conexão Wi-Fi de 5 GHz confiável ou Ethernet na TV.

## O pareamento falha

- Confirme que o PIN está sendo inserido na interface Web do Sunshine do host correto.
- Remova entradas antigas de pareamento somente se puder parear o cliente novamente depois.
- Verifique o horário do sistema e se alguma regra de firewall está bloqueando a comunicação entre a TV e o PC.

## O streaming começa, mas o vídeo congela, fica preto ou perde quadros

- Comece com uma resolução menor, 60 FPS e uma taxa de bits moderada.
- Verifique se o codec de vídeo selecionado é compatível tanto com a TV quanto com a GPU do host.
- Atualize os drivers da GPU e o Sunshine se o problema também ocorrer com outros clientes.
- Se a Ethernet com fio ficar instável em taxas de bits altas, teste outro caminho de rede. Algumas TVs têm portas Fast Ethernet, mesmo quando o host está conectado por Gigabit Ethernet.

## Sem áudio ou disposição incorreta dos canais

- Verifique a saída de áudio da TV, a entrada do receptor, o volume e o mudo.
- Teste primeiro o caminho OPUS padrão. Se funcionar, habilite a saída óptica somente ao testar Dolby.
- Comece com estéreo e passe para 5.1 depois de confirmar que toda a cadeia TV/receptor é compatível.
- A implementação atual do Dolby no host oferece suporte a estéreo e 5.1. Não selecione 7.1 para o caminho do codificador Dolby.

## As estatísticas mostram OPUS em vez de AC-3 ou E-AC-3

1. Confirme que **Enable Dolby Digital** está ativado no Moonlight.
2. Confirme que o host está usando a [branch experimental ac3-audio do Sunshine](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondente e foi compilado com o codificador Dolby opcional do FFmpeg disponível.
3. Inicie uma nova transmissão depois de alterar as configurações de áudio do host.
4. Verifique se o log do host informa o codec e a taxa de bits AC-3 ou E-AC-3 esperados.
5. Se o Sunshine não oferecer ou selecionar Dolby, OPUS será a alternativa de compatibilidade esperada.

Uma configuração ativada, por si só, não comprova que um fluxo Dolby foi negociado. A linha de estatísticas de áudio mostra o formato ativo durante a sessão.
