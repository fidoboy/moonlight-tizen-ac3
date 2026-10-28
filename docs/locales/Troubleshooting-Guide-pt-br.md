---
layout: docs-page
lang: pt-BR
title: "Guia de solução de problemas"
description: "Soluções para problemas comuns de conexão, áudio e streaming no Moonlight Tizen."
---

# Guia de solução de problemas

## O Apps2Samsung não mostra a TV na lista

1. Verifique se o **Developer Mode (Modo de Desenvolvedor)** está ativado na TV Samsung. Pressione **Home**, abra **Apps** e depois **App Settings** (geralmente o ícone de engrenagem). Em alguns modelos mais antigos, é possível digitar o código com a tela Apps aberta.
2. Digite **12345** usando as teclas numéricas do controle remoto. Se o Smart Remote não tiver teclas numéricas, abra o teclado na tela com o botão **123** e digite os números ali. Quando a janela **Developer Mode** aparecer, ative o modo (**On**).
3. Em **Host PC IP**, informe o endereço IPv4 local do computador em que o Apps2Samsung está sendo executado. Ele deve corresponder exatamente ao endereço atual desse computador. Use o IPv4 do adaptador Wi-Fi ou Ethernet ativo, não o IP da TV, o gateway do roteador, `127.0.0.1` nem o endereço público da Internet. Salve a configuração e reinicie a TV.
4. Confirme que a TV e o computador estão na mesma rede local e faça uma nova busca pela TV no Apps2Samsung. Wi-Fi para visitantes ou isolamento de clientes no roteador podem bloquear a comunicação.

Consulte o [Guia de instalação](Installation-Guide-pt-br.html) e o [guia oficial Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html) para mais detalhes.

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
2. Confirme que o host está usando a [build experimental do Sunshine](https://nightly.link/fidoboy/Sunshine/actions/runs/38719776826) correspondente, compilada com o codificador Dolby opcional do FFmpeg. No Sunshine, abra **Settings → Audio/Video** e selecione **AC-3 (Dolby Digital)** ou **E-AC-3 (Dolby Digital Plus)** no menu suspenso do formato de áudio da transmissão. Se estiver usando o Vibeshine, use a [distribuição nightly do Vibeshine](https://github.com/Nonary/vibeshine/releases/tag/2.0.2-nightly.d20261025.ddf42cfa263d) ou uma versão nightly mais recente.
3. Inicie uma nova transmissão depois de alterar as configurações de áudio do host.
4. Verifique se o log do host informa o codec e a taxa de bits AC-3 ou E-AC-3 esperados.
5. Se o Sunshine não oferecer ou selecionar Dolby, OPUS será a alternativa de compatibilidade esperada.

Uma configuração ativada, por si só, não comprova que um fluxo Dolby foi negociado. A linha de estatísticas de áudio mostra o formato ativo durante a sessão.

## Coletar informações úteis para diagnóstico

A versão do aplicativo Moonlight, o modelo da TV e a versão do Tizen OS são exibidos no Moonlight em **Configurações → Sobre** (*Settings → About*). Abra essa tela para obter esses dados. Registre também a versão e o branch do Sunshine, o codec e o layout de canais mostrados nas estatísticas da transmissão, as configurações de resolução/FPS/bitrate e se o problema também ocorre com OPUS. Em seguida, [abra uma issue no GitHub](https://github.com/fidoboy/moonlight-tizen-ac3/issues) e inclua as informações relevantes. Não publique endereços IP públicos, PINs, chaves privadas ou outros segredos.
