---
layout: docs-page
lang: pt-BR
title: "Guia de instalação"
description: "Métodos para instalar o Moonlight Tizen em TVs Samsung Smart TV."
---

# Guia de instalação

O cliente é distribuído como um widget Tizen assinado (`.wgt`). Escolha o método de instalação adequado à sua TV, computador e ferramentas de desenvolvimento Samsung instaladas.

## Método A: instalar com Apps2Samsung

### Antes de começar

- Baixe e execute a versão do [Apps2Samsung](https://apps2samsung.com/#download) para o seu computador.
- Conecte a TV e o computador à **mesma rede local**. Wi-Fi ou Ethernet funcionam, desde que os dispositivos consigam se comunicar.

### 1. Descubra o endereço IP local do computador

A TV precisa do endereço IP do computador que executará o Apps2Samsung. No Windows:

1. Pressione **Win + R**, digite `cmd` e pressione Enter.
2. No Prompt de Comando, execute:

       ipconfig

3. No adaptador de rede usado de fato (Wi-Fi ou Ethernet), anote **Endereço IPv4**, por exemplo `192.168.1.37`.

Use o IPv4 do computador, **não** o Gateway Padrão, o IP da TV, `127.0.0.1` nem seu endereço público de Internet. No macOS, encontre o endereço do adaptador ativo em **Ajustes do Sistema → Rede**; no Linux, execute `ip addr` e procure o endereço `inet` da interface ativa. Guarde esse endereço para a próxima etapa.

### 2. Abra as configurações ocultas do modo de desenvolvedor na TV

1. Ligue a TV e pressione **Home** (ou **Smart Hub**) no controle remoto.
2. Abra **Apps**.
3. Nas interfaces mais recentes, vá até **App Settings** (normalmente um ícone de engrenagem na parte inferior da tela Apps) e abra-o. Em alguns modelos antigos, o código pode ser inserido com a tela Apps aberta.
4. Com Apps/App Settings na tela, digite exatamente esta sequência:

   **1 → 2 → 3 → 4 → 5**

   **Como inserir os números**

   - **Controle remoto com teclado numérico físico:** pressione as teclas 1, 2, 3, 4 e 5 nessa ordem.
   - **Samsung Smart Remote sem teclas numéricas:** pressione o botão **123** (em alguns controles aparece como **123/Color** ou com o símbolo **…**) para abrir o teclado numérico na tela. Use o anel direcional para selecionar cada dígito e pressione o botão central **OK/Select**. Repita até inserir 12345.

   O diagrama abaixo mostra os dois métodos. Não são necessárias cinco teclas numéricas físicas quando o controle usa o teclado na tela.

   ![Inserção do código do modo de desenvolvedor com um controle comum ou Samsung Smart Remote](../assets/developer-mode-number-pad.svg)

5. Uma caixa de diálogo **Developer Mode** deverá aparecer. Defina **Developer Mode** como **On**.
6. Em **Host PC IP** (ou campo com nome semelhante), insira o IPv4 do computador anotado na etapa 1.
7. Selecione **OK** e aceite a reinicialização da TV.

> [!IMPORTANT]
> Este procedimento é para **Samsung Smart TVs com Tizen**. Outros fabricantes também usam plataformas de TV baseadas em Tizen, mas os menus e o suporte à instalação em modo de desenvolvedor podem variar.

> [!TIP]
> Após reiniciar, volte a **Apps**. Muitas TVs Samsung mostram um indicador **Develop Mode** perto do topo da tela, confirmando que o modo de desenvolvedor está ativo. Para capturas específicas de cada modelo, consulte o [guia oficial Samsung TV Device](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html); o [FAQ do Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ#-how-to-enable-developer-mode-on-your-tv) também explica como inserir o código com um Smart Remote.

### 3. Instale o Moonlight pelo catálogo do Apps2Samsung

1. Abra o Apps2Samsung no computador.
2. Selecione a TV quando ela aparecer nos resultados da busca. Se não for detectada automaticamente, informe o IP manualmente, caso essa opção esteja disponível.
3. Abra o catálogo de aplicativos e procure **Moonlight**.
4. Selecione **Moonlight** e escolha a variante **fidoboy · Enhanced · Dolby** ou, se o modelo da sua TV exigir, **fidoboy · Enhanced · Dolby · ForceGM**.
5. Inicie a instalação com **Download & Install** e aguarde a confirmação de sucesso do Apps2Samsung. O próprio programa baixa e prepara o pacote.
6. Abra a tela **Apps** da TV e inicie o Moonlight.

**Este é o método recomendado.** Você não precisa acessar GitHub Releases nem baixar manualmente o `Moonlight.wgt`. No primeiro uso, o Apps2Samsung pode solicitar login na conta Samsung para criar um certificado de assinatura. Siga as instruções e mantenha a seleção do certificado no modo automático/padrão, a menos que a ferramenta solicite outro tipo. Não é necessário configurar certificados manualmente no Seller Office.

> [!WARNING]
> **Instale o WGT manualmente apenas se o método do catálogo falhar.** Baixe `Moonlight.wgt` da [última release estável](https://github.com/fidoboy/moonlight-tizen-ac3/releases/latest). No Apps2Samsung, escolha **Custom WGT / TPK**, selecione o arquivo baixado e inicie a instalação. Use essa alternativa apenas quando necessário. Para a variante ForceGM, baixe `Moonlight-ForceGM.wgt` na mesma página.

### Solução de problemas

- **A caixa Developer Mode não aparece:** verifique se a tela Apps ou App Settings está aberta, caso seu modelo tenha esse painel. Digite `12345` ali, e não no menu normal de configurações da TV. Em um Smart Remote, abra primeiro o teclado na tela com o botão **123** ou equivalente virtual.
- **O Apps2Samsung não encontra ou não conecta à TV:** confirme que Developer Mode está ativado, que os dois dispositivos estão na mesma rede local e que Host PC IP na TV corresponde exatamente ao IPv4 atual do computador. Wi-Fi de convidados ou isolamento de clientes no roteador pode impedir a comunicação.
- **Ainda não conecta após reiniciar:** desligue totalmente a TV da tomada, aguarde de 10 a 15 segundos, conecte novamente e tente de novo. Isso pode ajudar em modelos nos quais a conexão de desenvolvedor não foi aberta corretamente.
- **A instalação falha por incompatibilidade de assinatura/certificado:** siga a mensagem do Apps2Samsung. Se estiver migrando do aplicativo base Brightcraft, consulte [Migrar do aplicativo base Brightcraft](#migrar-do-aplicativo-base-brightcraft) antes de desinstalar algo.

## Método B: Tizen Studio

O Tizen Studio é o ambiente oficial de desenvolvimento Samsung/Tizen e é útil para desenvolvedores e diagnósticos mais avançados.

1. Instale o Tizen Studio e as ferramentas de TV adequadas à versão-alvo do Tizen.
2. Ative Developer Mode na TV e anote seu endereço IP.
3. No Device Manager, conecte-se à TV.
4. Configure um perfil de certificado aceito pela TV e assine o WGT conforme exigido pelo Tizen Studio.
5. Instale o pacote usando as ferramentas de pacote/deploy do Tizen ou o IDE.

Use a documentação atual da Samsung para instalar o Tizen Studio e configurar certificados de TV, pois os procedimentos variam conforme o SDK e o sistema operacional.

## Compilar o pacote

O [Guia de desenvolvimento](Development-Guide-pt-br.html) explica como compilar o WGT com o Dockerfile incluído. Builds Docker são úteis para testar uma revisão exata do código-fonte ou as duas variantes do pacote.

## Migrar do aplicativo base Brightcraft

A série independente de releases começa na versão 1.0.0, enquanto o aplicativo base usava uma versão superior, 1.18.x. Por isso, o Tizen pode rejeitar um downgrade direto ou tratar a assinatura do pacote de outra forma. Se a instalação falhar, desinstale o aplicativo anterior antes de instalar este projeto. A desinstalação pode apagar dados locais do aplicativo; anote antes as configurações e os dados dos hosts. Consulte o [guia de atualização](Updating-Guide-pt-br.html) para mais detalhes.

## Primeiro início

Inicie o Moonlight pela tela Apps da TV, permita a descoberta na rede local e faça o pareamento com o PC host. Se ele não aparecer automaticamente, use Add Host e informe o IP ou nome DNS do host. Consulte o [Guia de início rápido](Quick-Start-Guide-pt-br.html).
