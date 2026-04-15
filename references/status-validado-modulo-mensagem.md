# Status Validado do Modulo de Mensagem

## Visao geral

Este documento registra o estado validado e funcional do modulo de `mensagem` da Prime Frios.

Este registro deve ser tratado como base oficial para os proximos ajustes. Novas evolucoes nao devem quebrar, substituir ou descaracterizar o comportamento aqui confirmado.

## Status final validado

O modulo de `mensagem` esta funcional de ponta a ponta.

Foi validado com sucesso:

- abertura do popup `Gerenciar cobrança`
- cadastro do `Server URL` da Uazapi
- cadastro do `Token Uazapi`
- salvamento das configuracoes do vendedor
- edicao e salvamento dos 4 templates fixos
- uso de 4 webhooks separados, um por fluxo
- consumo dos webhooks pelo `n8n`
- recebimento do `whatsapp` pelo payload do `n8n`
- renderizacao do template correto por fluxo
- envio real pela Uazapi
- sucesso em 4 testes, um para cada webhook

## Modelo validado de funcionamento

O desenho validado do modulo ficou assim:

- o `n8n` continua responsavel por definir o publico e executar o fluxo
- o `n8n` nao envia mais direto para a Uazapi
- o `n8n` chama a API interna do sistema
- a API interna busca a configuracao salva do vendedor
- a API interna busca o template correto do fluxo
- a API interna monta a mensagem final
- a API interna usa o campo `whatsapp` recebido do `n8n` como numero de destino
- a API interna envia para a Uazapi

## Configuracao validada do vendedor

O vendedor preenche no popup `Gerenciar cobrança`:

- `Server URL`
- `Token Uazapi`
- os 4 templates dos 4 fluxos fixos

Formato validado do `Server URL`:

```text
https://primefrioscom.uazapi.com
```

O sistema completa automaticamente o endpoint final de envio:

```text
/send/text
```

Entao o envio final validado fica no formato:

```text
POST https://primefrioscom.uazapi.com/send/text
```

## Contrato validado com a Uazapi

Header:

```text
token: TOKEN_DA_UAZAPI
Content-Type: application/json
```

Body:

```json
{
  "number": "5511999999999",
  "text": "mensagem final renderizada"
}
```

## Contrato validado com o n8n

O `n8n` chama os webhooks internos do sistema usando `POST` com `application/json`.

O `n8n` entrega os dados necessarios para montar a mensagem, incluindo o telefone de destino no campo:

```text
whatsapp
```

O `whatsapp` recebido do `n8n` e o numero usado pela API para envio da mensagem.

## Fluxos validados

Os 4 fluxos abaixo foram testados com sucesso:

- `tratamento-menos-10-dias-vencido`
- `tratamento-acima-10-dias-vencimento`
- `tratamento-titulos-negociados`
- `tratamento-titulos-emitido-dia`

Cada fluxo possui:

- um webhook proprio
- um template proprio
- comportamento validado com sucesso em teste real

## Regra validada de template

Os 4 testes confirmaram que:

- cada webhook assumiu o template correto
- a API buscou a configuracao correta do vendedor
- a API montou a mensagem com base no template salvo

## Regras que devem ser preservadas

As proximas evolucoes devem preservar obrigatoriamente estes pontos:

- nao voltar para envio direto do `n8n` para a Uazapi
- manter a API interna como responsavel pelo envio
- manter o modelo `Server URL + Token Uazapi`
- manter 1 webhook por fluxo
- manter 1 template por fluxo por vendedor
- manter o `whatsapp` vindo do `n8n` como telefone de destino
- manter a renderizacao do template no backend
- nao quebrar os 4 webhooks ja validados
- nao remover o popup `Gerenciar cobrança` como ponto de configuracao do vendedor

## Componentes ja existentes e validados

- popup `Gerenciar cobrança`
- rota de configuracao do modulo de mensagem
- 4 rotas de webhook para os fluxos
- renderizacao de templates por variaveis amigaveis
- envio para a Uazapi usando `Server URL + token`
- base de logs do modulo

## Conclusao

O modulo de `mensagem` esta validado em ambiente real com sucesso.

Os 4 webhooks foram testados, os 4 envios funcionaram, e os 4 fluxos assumiram corretamente os templates configurados.

Este documento deve servir como referencia oficial para qualquer ajuste futuro neste modulo.
