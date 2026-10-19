---
layout: docs-page
lang: pt-BR
title: "Guia de solução de problemas"
description: "Soluções para problemas comuns de conexão, áudio e streaming no Moonlight Tizen."
---

# Guia de solução de problemas

## O Moonlight não encontra o host

1. Confirme que o Sunshine está em execução e que a TV e o PC estão acessíveis na mesma rede.
2. Confira o firewall do host e as configurações de isolamento do roteador.
3. Tente Add Host com o endereço IPv4, IPv6 ou nome DNS do PC.
4. Se o host usar portas personalizadas, confirme que estão configuradas de forma consistente.
5. Se a descoberta funcionar de forma intermitente, teste a TV em uma conexão Wi-Fi 5 GHz confiável ou Ethernet.

## O pareamento falha

- Confirme que o PIN foi inserido na interface Web do Sunshine do host correto.
- Remova entradas antigas de pareamento apenas se puder parear o cliente novamente.
- Verifique o horário do sistema e se alguma regra de firewall bloqueia a comunicação entre a TV e o PC.

## A transmissão começa, mas o vídeo congela, fica preto ou perde quadros

- Comece com resolução menor, 60 FPS e bitrate conservador.
- Confirme que o codec de vídeo selecionado é compatível com a TV e a GPU do host.
- Atualize os drivers da GPU e o Sunshine se o problema também ocorrer com outros clientes.
- Se Ethernet cabeada ficar instável em bitrates altos, teste outro caminho de rede. Algumas TVs têm portas Fast Ethernet mesmo quando o host está conectado em Gigabit.

## Sem áudio ou layout de canais incorreto

- Confira a saída de áudio da TV, a entrada do receiver, volume e mudo.
- Teste primeiro o caminho OPUS padrão. Se funcionar, habilite a saída óptica apenas para testar Dolby.
- Comece em estéreo e só passe para 5.1 depois de confirmar que a cadeia TV/receiver é compatível.
- A implementação Dolby atual no host suporta estéreo e 5.1. Não selecione 7.1 para o caminho do encoder Dolby.

## As estatísticas mostram OPUS em vez de AC-3 ou E-AC-3

1. Verifique se **Enable Dolby Digital** está habilitado no Moonlight.
2. Confirme que o host está usando o branch experimental [Sunshine ac3-audio](https://github.com/fidoboy/Sunshine/tree/ac3-audio) correspondente e foi compilado com o encoder Dolby opcional do FFmpeg disponível.
3. Inicie uma nova transmissão depois de alterar as configurações de áudio do host.
4. Confira se o log do host mostra o codec AC-3 ou E-AC-3 esperado e o bitrate.
5. Se o Sunshine não oferecer ou selecionar Dolby, OPUS é o fallback de compatibilidade esperado.

Apenas habilitar a opção não comprova que um fluxo Dolby foi negociado. A linha de estatísticas de áudio reflete a sessão ativa.

## O controle ou o controle remoto não funciona

- Confirme que a TV reconhece o controle nas próprias configurações.
- Reconecte o controle antes de iniciar o Moonlight.
- Teste a navegação básica pelo controle na lista de hosts e nas configurações antes de iniciar uma transmissão.
- Se o problema de entrada acontecer em apenas um jogo, compare com outro aplicativo para isolar mapeamentos específicos do jogo.

## Coletar informações úteis para diagnóstico

Anote a versão do projeto Moonlight, o modelo da TV e a versão do Tizen, a versão e o branch do Sunshine, o codec e o layout de canais mostrados nas estatísticas, as configurações de resolução/FPS/bitrate e se o problema também ocorre com OPUS. Não publique endereços IP públicos, PINs, chaves privadas ou outros segredos.
