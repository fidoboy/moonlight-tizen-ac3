---
layout: docs-page
lang: pt-BR
title: "Problemas conhecidos e limitações"
description: "Limitações conhecidas de áudio Dolby, Tizen e streaming no Moonlight Tizen."
---

# Problemas conhecidos e limitações

## Áudio Dolby pela saída óptica

- O passthrough Dolby é uma extensão opcional e exige a implementação experimental correspondente do Sunshine. Um host padrão que envia OPUS continua compatível, mas continuará usando OPUS.
- AC-3 é limitado a 5.1 canais. O encoder experimental correspondente atualmente oferece estéreo e 5.1, não 7.1.
- O passthrough E-AC-3 pela saída óptica depende do modelo da TV, firmware, configuração de saída e receiver. Não presuma que toda TV possa enviar E-AC-3 por TOSLINK.
- O pipeline de áudio nativo da TV precisa aceitar o formato comprimido. Se ele rejeitar a inicialização da faixa, não será possível reproduzir áudio Dolby por esse caminho.
- Esse recurso foi testado com uma TV Samsung e uma cadeia de áudio específicas; a compatibilidade com todas as combinações de TV e receiver não foi estabelecida.
- O bitrate de áudio mostrado no overlay é uma taxa de recepção medida aproximada, não um campo de negociação do codec nem uma meta garantida do encoder.

## Limitações do Tizen e da TV

- O cliente destina-se a TVs Samsung compatíveis com Tizen 5.5 ou posterior, mas os recursos variam conforme o modelo e o firmware.
- Game Mode e opções de alta taxa de atualização podem ser limitados pelo sistema operacional ou pelos recursos da TV mesmo quando a configuração está visível.
- Algumas TVs têm porta Ethernet de 100 Mbps. Em resoluções ou bitrates altos, rajadas de tráfego de quadros podem causar perda de pacotes na rede cabeada. Testar uma conexão Wi-Fi 5 GHz confiável pode ajudar a distinguir isso de um problema no host.
- Resolução de vídeo, taxa de quadros, HDR, AV1 e bitrates altos dependem do decodificador da TV e do encoder da GPU do host. Combinações não compatíveis podem usar uma alternativa ou falhar ao iniciar.

## Projeto independente e estado das releases

Este é um projeto mantido de forma independente e inclui recursos dependentes de hardware. Sua sequência de versões começa em 1.0.0 e é separada das versões do projeto base [Brightcraft](https://github.com/brightcraft/moonlight-tizen). Notas de releases públicas e alterações conhecidas estão na [página de releases](https://github.com/fidoboy/moonlight-tizen-ac3/releases) e no [registro de alterações](../CHANGELOG.md).

Ao relatar um problema, inclua a versão exata do projeto, modelo da TV e versão do Tizen, versão/branch do Sunshine, configurações de vídeo, backend de áudio, canais selecionados e logs relevantes.
