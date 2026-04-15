# Estrutura Final - Gestao de Cobranca

## Visao geral

O modulo de `Gestao de cobranca` esta integrado ao dashboard principal e hoje cumpre duas funcoes centrais:

1. permitir que o vendedor ou master cadastre os dados da propria instancia Uazapi
2. receber disparos do `n8n` pelos 4 webhooks oficiais e assumir o envio final para a Uazapi

O fluxo final adotado e:

- o `n8n` continua montando a mensagem pronta
- o `n8n` chama o webhook correto do sistema
- a API interna identifica a configuracao salva
- a API formata o payload final para a Uazapi
- a API envia a mensagem
- a API grava log do resultado no banco

## Estado funcional atual

Hoje esta funcionando:

- popup `Gerenciar cobranca` no card `Perfil logado`
- visual horizontal reorganizado no popup
- setup do vendedor com:
  - `Instancia Uazapi`
  - `Server URL`
  - `Token Uazapi`
  - `Configuracao ativa`
- visao operacional simplificada para vendedor
- visao tecnica dos webhooks apenas para `master`
- 4 webhooks ativos e validados
- envio real pela Uazapi validado nos 4 fluxos
- bloqueio de envio quando:
  - `cliente_desbloqueado_regua != true`
  - `em_negociacao == true`
- logs de sucesso e erro gravados no banco

## Estrutura visual atual

### Local da acao

O acesso acontece em [app/page.tsx](/abs/path/C:/Users/deivs/regua-primefrios/app/page.tsx:824), dentro do card `Perfil logado`, pelo botao `Gerenciar cobrança`.

### Componente principal

O popup esta em [app/components/cobranca-manager-modal.tsx](/abs/path/C:/Users/deivs/regua-primefrios/app/components/cobranca-manager-modal.tsx:1).

### Organizacao visual atual

O popup esta dividido assim:

1. cabecalho
   - titulo `Gerenciar cobranca`
   - usuario logado
   - botao `Fechar`

2. feedback
   - erro
   - mensagem de sucesso

3. cards de status
   - `Aptos para envio`
   - `Bloqueados`
   - `Em negociacao`

4. secao `Setup do vendedor`
   - topo com descricao da sessao
   - toggle `Configuracao ativa`
   - bloco da instancia
   - bloco com `Server URL` e `Token`
   - dois cards de apoio explicando o fluxo

5. secao tecnica do master
   - `Escutas para o n8n`
   - cards com os 4 endpoints

6. acoes finais
   - `Fechar`
   - `Salvar configuracao`

### Regras de exibicao por perfil

- `master`
  - ve os cards operacionais
  - ve o setup do vendedor
  - ve a secao tecnica com os webhooks

- `vendedor`
  - ve os cards operacionais
  - ve o setup do vendedor
  - nao ve a secao tecnica dos webhooks

## Arquivos principais do modulo

### Frontend

- [app/page.tsx](/abs/path/C:/Users/deivs/regua-primefrios/app/page.tsx:824)
  - abre o popup
  - envia contadores operacionais

- [app/components/cobranca-manager-modal.tsx](/abs/path/C:/Users/deivs/regua-primefrios/app/components/cobranca-manager-modal.tsx:1)
  - renderiza o popup
  - carrega configuracao
  - salva configuracao
  - monta a visualizacao dos webhooks para master

### API

- [app/api/mensagem/configuracao/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/configuracao/route.ts:1)
  - `GET` carrega configuracao do usuario autenticado
  - `PUT` salva configuracao do usuario autenticado

- [app/api/mensagem/tratamento-menos-10-dias-vencido/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/tratamento-menos-10-dias-vencido/route.ts:1)

- [app/api/mensagem/tratamento-acima-10-dias-vencimento/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/tratamento-acima-10-dias-vencimento/route.ts:1)

- [app/api/mensagem/tratamento-titulos-negociados/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/tratamento-titulos-negociados/route.ts:1)

- [app/api/mensagem/tratamento-titulos-emitido-dia/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/tratamento-titulos-emitido-dia/route.ts:1)

Essas 4 rotas:

- fazem parse do JSON recebido
- chamam o handler central
- respondem com status e corpo padronizados

### Servicos e utilitarios

- [lib/mensagem/service.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/service.ts:1)
  - centro da logica do modulo
  - resolve configuracao
  - resolve cliente
  - normaliza URL da Uazapi
  - processa itens do payload
  - envia mensagem
  - grava log

- [lib/mensagem/template.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/template.ts:1)
  - resolve telefone
  - mantem compatibilidade com payloads variados
  - suporta renderizacao de template, embora o fluxo atual use mensagem pronta

- [lib/mensagem/config.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/config.ts:1)
  - define os 4 fluxos
  - define titulo, path e descricao de cada webhook
  - ainda mantem estrutura de variaveis/template como legado de evolucao anterior

- [lib/http/parse-json-request.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/http/parse-json-request.ts:1)
  - garante erro claro para body vazio ou JSON invalido

- [lib/supabase/require-active-user.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/supabase/require-active-user.ts:1)
  - valida sessao
  - busca perfil em `omie_core.usuarios_dashboard`

### Banco

- [sql/omie_core_mensagem.sql](/abs/path/C:/Users/deivs/regua-primefrios/sql/omie_core_mensagem.sql:1)
  - estrutura das tabelas do modulo
  - grants
  - triggers
  - indices

## Rotas finais do modulo

### Rota de configuracao

- `GET /api/mensagem/configuracao`
- `PUT /api/mensagem/configuracao`

Uso:

- leitura e gravacao da configuracao da Uazapi do usuario autenticado

### Rotas webhook oficiais

- `POST /api/mensagem/tratamento-menos-10-dias-vencido`
- `POST /api/mensagem/tratamento-acima-10-dias-vencimento`
- `POST /api/mensagem/tratamento-titulos-negociados`
- `POST /api/mensagem/tratamento-titulos-emitido-dia`

Uso:

- recebem o payload final do `n8n`
- assumem o envio para a Uazapi

## Contrato real dos webhooks

O sistema foi adaptado para aceitar o formato real ja usado no `n8n`.

### Formatos aceitos de entrada

A API aceita:

- objeto unico
- array de objetos
- objeto encapsulado com `body`

### Campos aceitos para telefone

A API resolve o telefone nesta ordem:

- `numero_destino`
- `whatsapp`
- `chatid`
- `number`
- `body.number`
- alem de aliases tratados em [lib/mensagem/template.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/template.ts:52)

### Campos aceitos para mensagem pronta

A API resolve a mensagem nesta ordem:

- `mensagem`
- `text`
- `content.text`
- `texto`
- `body.text`
- `body.content.text`

### Comportamento com multiplos itens

Se o `n8n` mandar um array com varios itens:

- a API percorre item por item
- envia um por um para a Uazapi
- grava um log por item
- responde com:
  - `sucesso`
  - `erro`
  - `resultados`

Se o node do `n8n` executar um item por vez, o retorno vira um item por execucao, o que tambem esta correto.

## Fluxo operacional completo

### 1. Cadastro

O vendedor ou master abre `Gerenciar cobranca` e salva:

- `Instancia Uazapi`
- `Server URL`
- `Token Uazapi`
- `Configuracao ativa`

### 2. Origem do disparo

O `n8n` monta a mensagem pronta e chama um dos 4 webhooks oficiais.

### 3. Entrada na API

A rota:

- le o JSON
- valida o corpo
- chama `handleMensagemWebhook`

### 4. Resolucao da configuracao

Em [lib/mensagem/service.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/service.ts:182), a API tenta localizar a configuracao nesta ordem:

1. `usuario_id` ou `vendedor_id`
2. instancia vinda no payload:
   - `uazapi_instance`
   - `instancia`
   - `instance`
   - `instance_name`
   - `owner`
   - `sender`
3. fallback para unica configuracao ativa existente

### 5. Regras de bloqueio

Se houver cliente resolvido pela tabela `clientes`, a API bloqueia envio quando:

- `cliente_desbloqueado_regua != true`
- `em_negociacao == true`

### 6. Montagem para Uazapi

A API monta:

```json
{
  "number": "telefone_limpo",
  "text": "mensagem pronta"
}
```

E envia para:

`{server_url}/send/text`

com header:

- `token`

### 7. Log

Cada tentativa vira registro em `omie_core.mensagem_logs`.

## Tabelas usadas

### 1. omie_core.mensagem_vendedores

Funcao:

- guarda configuracao da Uazapi por usuario

Campos fisicos relevantes:

- `usuario_id`
- `nome_vendedor`
- `uazapi_instance`
- `uazapi_token`
- `ativo`

### Observacao importante sobre mapeamento atual

Hoje existe um reaproveitamento interno de campos na camada de servico:

- `nome_vendedor` esta sendo usado como `uazapi_instancia`
- `uazapi_instance` esta sendo usado como `uazapi_server_url`

Isso aparece em:

- [lib/mensagem/service.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/service.ts:112)
- [lib/mensagem/service.ts](/abs/path/C:/Users/deivs/regua-primefrios/lib/mensagem/service.ts:127)

Ou seja:

- na interface o usuario cadastra `instancia`
- no banco esse valor esta sendo salvo no campo `nome_vendedor`
- na interface o usuario cadastra `Server URL`
- no banco esse valor esta sendo salvo no campo `uazapi_instance`

Funciona hoje, mas e um detalhe tecnico importante do estado real atual.

### 2. omie_core.mensagem_logs

Funcao:

- registrar sucesso e erro de envio

Campos relevantes:

- `fluxo`
- `usuario_id`
- `nome_vendedor`
- `cliente_nome`
- `contato`
- `telefone`
- `status_envio`
- `erro`
- `http_status`
- `payload_entrada`
- `payload_uazapi`
- `resposta_uazapi`
- `created_at`

### 3. omie_core.mensagem_templates

Funcao:

- estrutura preparada para templates por fluxo

Estado atual:

- a tabela existe
- o config legado ainda referencia fluxos e variaveis
- a interface atual nao esta usando templates editaveis
- o envio operacional validado hoje usa mensagem pronta do `n8n`

### 4. omie_core.clientes

Funcao:

- validar se o cliente pode receber mensagem

Campos usados:

- `id`
- `cnpj_cpf`
- `razao_social`
- `whatsapp`
- `cliente_desbloqueado_regua`
- `em_negociacao`
- `nome_vendedor_padrao_snapshot`

### 5. omie_core.usuarios_dashboard

Funcao:

- autenticar perfil ativo do usuario
- separar `master` e `vendedor`

Campos usados em `requireActiveUser`:

- `id`
- `email`
- `nome`
- `perfil`
- `nome_vendedor`
- `ativo`

### 6. auth.users

Funcao:

- autenticar o usuario da sessao

## Funcoes principais do modulo

### Frontend

- `carregarConfiguracao()`
  - busca `/api/mensagem/configuracao`

- `salvar()`
  - envia `PUT /api/mensagem/configuracao`

### Backend

- `loadMensagemConfiguracao(usuarioId)`
  - busca configuracao salva do usuario

- `saveMensagemConfiguracao(input)`
  - grava configuracao da Uazapi

- `handleMensagemWebhook(fluxo, payload)`
  - principal funcao do envio

- `resolveConfiguracaoDestino(payload)`
  - encontra a configuracao correta

- `resolveClienteMensagem(payload)`
  - encontra cliente por `cliente_id` ou `cnpj_cpf`

- `resolveMensagemPronta(payload)`
  - extrai a mensagem do payload real

- `resolveTelefoneMensagem(payload)`
  - extrai e normaliza telefone

- `registrarLogMensagem(input)`
  - grava log do envio

- `buildUazapiSendUrl(value)`
  - normaliza a URL e garante `/send/text`

## Regras de negocio em vigor

### 1. O `n8n` continua no fluxo

O sistema nao substitui o `n8n`.

O `n8n` continua:

- definindo quem entra no fluxo
- montando a mensagem pronta
- chamando o webhook correto

### 2. O sistema assume o envio

O sistema passa a ser responsavel por:

- assumir credenciais do vendedor
- formatar a chamada para Uazapi
- enviar
- registrar log

### 3. Ligacao com o vendedor

A configuracao operacional do vendedor e vinculada pela instancia cadastrada.

### 4. Cliente bloqueado nao recebe

Se o cliente estiver bloqueado na regua, o envio e recusado.

### 5. Cliente em negociacao nao recebe

Se o cliente estiver em negociacao ativa, o envio e recusado.

## Fluxos oficiais em vigor

### 1. tratamento-menos-10-dias-vencido

Uso:

- cobranca inicial
- atraso curto

### 2. tratamento-acima-10-dias-vencimento

Uso:

- cobranca mais forte
- atraso maior

### 3. tratamento-titulos-negociados

Uso:

- acompanhamento de parcelas negociadas

### 4. tratamento-titulos-emitido-dia

Uso:

- lembrete de vencimento no dia

## Observacoes tecnicas importantes

### 1. Relatorio

A interface de relatorio foi removida do popup, mas a rota de configuracao ainda retorna `relatorio_dia`.

Isso aparece em:

- [app/api/mensagem/configuracao/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/configuracao/route.ts:17)
- [app/api/mensagem/configuracao/route.ts](/abs/path/C:/Users/deivs/regua-primefrios/app/api/mensagem/configuracao/route.ts:60)

### 2. Templates

O modulo hoje opera com mensagem pronta do `n8n`, nao com template editado no sistema.

Mas ainda existem:

- tabela de templates
- config de fluxos com variaveis
- funcoes de renderizacao

Esses pontos estao preservados como base para evolucao futura.

### 3. Segurança

Existe um arquivo local de tarefas futuras para seguranca:

- `references/tarefas-futuras-seguranca-github.md`

Esse material nao faz parte do fluxo funcional do modulo, mas registra riscos para ajuste futuro.

## Resultado final validado

A sessao `Gestao de cobranca` esta finalizada no estado atual com:

- visual reorganizado
- setup funcional
- separacao de visao por perfil
- 4 webhooks funcionando
- integracao com Uazapi validada
- disparos reais funcionando
- logs gravados
- regras de bloqueio respeitadas

Esse e o estado oficial local do modulo no momento.
