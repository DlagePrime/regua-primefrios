# Tarefas Futuras de Seguranca

## Objetivo

Registrar pontos de atencao de seguranca identificados no repositorio e na aplicacao para tratamento futuro.

Este arquivo e apenas de referencia local e nao deve ir para o Git.

## Prioridade critica

### 1. Proteger os webhooks publicos de mensagem

Situacao atual:

- os 4 webhooks de `mensagem` estao publicos
- nao existe autenticacao adicional especifica para o `n8n`
- qualquer agente externo que descubra a URL pode tentar acionar os endpoints

Impacto:

- possibilidade de disparo indevido de mensagens
- abuso da infraestrutura da Uazapi
- aumento de custo e risco operacional

Recomendacao:

- exigir um header secreto entre `n8n` e API
- ou usar assinatura HMAC
- ou aplicar allowlist de IP da VPS do `n8n`

Arquivos envolvidos:

- `app/api/mensagem/tratamento-menos-10-dias-vencido/route.ts`
- `app/api/mensagem/tratamento-acima-10-dias-vencimento/route.ts`
- `app/api/mensagem/tratamento-titulos-negociados/route.ts`
- `app/api/mensagem/tratamento-titulos-emitido-dia/route.ts`

### 2. Remover fallback de configuracao ativa unica

Situacao atual:

- se houver apenas uma configuracao ativa em `mensagem_vendedores`, a API usa essa configuracao como fallback
- isso pode permitir envio mesmo sem casamento explicito de instancia ou identificador do payload

Impacto:

- reduz o nivel de seguranca dos webhooks
- combinado com webhook publico, amplia superficie de risco

Recomendacao:

- remover esse fallback
- aceitar envio apenas quando a configuracao for resolvida explicitamente

Arquivo envolvido:

- `lib/mensagem/service.ts`

## Prioridade alta

### 3. Nao devolver token completo ao frontend

Situacao atual:

- o token da Uazapi e salvo no banco
- o token e devolvido no `GET /api/mensagem/configuracao`

Impacto:

- risco maior em caso de XSS
- risco maior em caso de sessao comprometida
- aumenta exposicao interna de credencial operacional

Recomendacao:

- mascarar o token no retorno do frontend
- permitir apenas atualizar o token
- evitar leitura completa do valor salvo

Arquivos envolvidos:

- `app/api/mensagem/configuracao/route.ts`
- `lib/mensagem/service.ts`
- `sql/omie_core_mensagem.sql`

### 4. Avaliar armazenamento criptografado do token da Uazapi

Situacao atual:

- o token da Uazapi esta salvo em texto puro no banco

Impacto:

- vazamento de banco exporia a credencial integral

Recomendacao:

- avaliar criptografia em repouso no nivel da aplicacao
- ou outra estrategia segura de protecao da credencial

Arquivos envolvidos:

- `sql/omie_core_mensagem.sql`
- `lib/mensagem/service.ts`

## Prioridade media

### 5. Reduzir o conteudo salvo nos logs de mensagem

Situacao atual:

- os logs salvam payload de entrada
- payload enviado para a Uazapi
- resposta da Uazapi
- telefones e mensagens completas

Impacto:

- exposicao de dados pessoais
- exposicao de conteudo operacional
- base de logs fica sensivel

Recomendacao:

- salvar apenas o minimo necessario
- mascarar telefone quando possivel
- avaliar politica de retencao e limpeza

Arquivos envolvidos:

- `lib/mensagem/service.ts`
- `sql/omie_core_mensagem.sql`

## Observacoes gerais

- nao foi identificado `.env` versionado no repositrio rastreado
- a verificacao rapida nao mostrou chave explicita evidente em arquivos rastreados
- isso nao substitui auditoria completa de historico, dependencia e infraestrutura

## Ordem recomendada de tratamento

1. proteger os webhooks
2. remover fallback de configuracao unica
3. parar de devolver token completo no frontend
4. revisar armazenamento do token
5. reduzir detalhe dos logs
