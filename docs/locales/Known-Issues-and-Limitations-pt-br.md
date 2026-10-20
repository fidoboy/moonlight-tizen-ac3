---
layout: docs-page
lang: undefined
title: "Problemas conhecidos e limitações"
description: "Problemas de compatibilidade conhecidos e limitações técnicas do Moonlight Tizen com suporte a áudio Dolby."
---

# Problemas conhecidos e limitações

## Áudio Dolby pela saída óptica

- O passthrough Dolby é uma extensão opcional e exige a implementação experimental correspondente do Sunshine. Hosts padrão que enviam OPUS continuam compatíveis, mas seguirão usando OPUS.

- AC-3 é limitado a 5.1 canais. O encoder experimental correspondente oferece suporte atualmente a estéreo e 5.1, não a 7.1.

- A passagem de E-AC-3 pela saída óptica depende do modelo da TV, do firmware, da configuração de saída e do receiver. Não presuma que todas as TVs conseguem transmitir E-AC-3 por TOSLINK.

- A cadeia de áudio nativa da TV precisa aceitar o formato comprimido. Se ela rejeitar a inicialização da faixa, o áudio Dolby não poderá ser reproduzido por esse caminho.

- Esse recurso foi testado com uma TV Samsung específica e uma cadeia de áudio específica; a compatibilidade com todas as combinações de TV e receiver não foi estabelecida.

- A taxa de bits de áudio exibida no overlay é uma estimativa da taxa de recepção medida, não um campo de negociação de codec nem uma meta garantida do encoder.

## Limitações do Tizen e das TVs

- O cliente tem como alvo TVs Samsung compatíveis com Tizen 5.5 ou posterior, mas os recursos variam conforme o modelo e o firmware.

- O Game Mode e as opções de alta taxa de atualização podem ser limitados pelo sistema operacional ou pelos recursos da TV, mesmo quando uma configuração aparece disponível.

- Algumas TVs têm porta Ethernet de 100 Mbps. Em resoluções ou taxas de bits altas, rajadas de tráfego de quadros podem causar perda de pacotes na Ethernet cabeada. Testar uma conexão Wi-Fi confiável de 5 GHz pode ajudar a distinguir um problema de rede de um problema no host.

- A resolução de vídeo, a taxa de quadros, o HDR, o AV1 e as taxas de bits elevadas dependem do decodificador da TV e do encoder da GPU do host. Combinações não compatíveis podem usar uma alternativa ou não iniciar.

## Projeto independente e status das versões

Este é um projeto mantido de forma independente e inclui recursos cujo comportamento depende do hardware. Sua sequência de versões começa em 1.0.0 e é separada das versões do [projeto-base Brightcraft](https://github.com/brightcraft/moonlight-tizen). As notas públicas de lançamento e as alterações conhecidas estão disponíveis na [página de releases](https://github.com/fidoboy/moonlight-tizen-ac3/releases) e no [changelog](https://github.com/fidoboy/moonlight-tizen-ac3/blob/master/CHANGELOG.md).

Ao relatar um problema, informe a versão exata do projeto, o modelo da TV e a versão do Tizen, a versão/branch do Sunshine, as configurações de vídeo, o backend de áudio, a seleção de canais e os logs relevantes.
