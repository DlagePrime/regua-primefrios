# Mapa de Tabelas e Funcoes do Projeto

## Objetivo

Este arquivo documenta:

- qual funcao do sistema usa cada tabela
- o que cada tela ou rota apenas visualiza
- o que cada acao realmente grava
- qual acesso deve ser feito pelo frontend autenticado
- qual acesso deve passar por rota server com `service_role`

## Regra operacional adotada

- Tabelas de `visualizacao` podem ser lidas no frontend apenas se a RLS estiver correta para o perfil logado.
- Tabelas de `acao` devem preferencialmente ser acessadas por rotas server, validando sessao e perfil antes da escrita.
- Tabelas sensiveis de operacao, especialmente as que agregam carteira, vencidos e negociacoes, devem preferir leitura consolidada no servidor.

## Tabelas principais

| Tabela / View | Papel no sistema | Tipo principal |
| --- | --- | --- |
| `omie_core.clientes` | Base principal da carteira, dados do cliente e flags operacionais | acao + visualizacao |
| `omie_core.clientes_meta` | Fonte de titulos vencidos e payload de cobranca | visualizacao |
| `omie_core.regua_dia_vencimento` | Fonte de titulos a vencer e dados da regua | visualizacao |
| `omie_core.clientes_negociacoes` | Cabecalho da negociacao do cliente | acao + visualizacao |
| `omie_core.clientes_negociacoes_parcelas` | Parcelas da negociacao | acao + visualizacao |
| `omie_core.vw_clientes_negociacoes_resumo` | Resumo consolidado da negociacao | visualizacao |
| `omie_core.usuarios_dashboard` | Perfil interno, permissao e vinculo com vendedor | acao + visualizacao |
| `auth.users` | Usuarios do Supabase Auth | acao administrativa |

## Mapa por modulo

### Dashboard / carteira principal

**Tela / funcao**

- dashboard principal
- filtros de carteira
- indicadores de vencidos, a vencer e negociacoes

**Arquivo principal**

- [app/page.tsx](/abs/path/app/page.tsx:1)
- [app/api/clientes/carteira/route.ts](/abs/path/app/api/clientes/carteira/route.ts:1)

**Leitura**

| Tabela / View | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | validar usuario logado e perfil |
| `omie_core.clientes` | carregar carteira, vendedor, flags operacionais |
| `omie_core.clientes_meta` | calcular vencidos, atraso e total vencido |
| `omie_core.regua_dia_vencimento` | calcular a vencer e etapa da regua |
| `omie_core.vw_clientes_negociacoes_resumo` | identificar status e historico de negociacao |

**Gravacao**

- nenhuma diretamente na carga da carteira

**Acesso esperado**

- leitura consolidada via rota server
- evitar leitura direta do browser em `clientes_meta`

### Regua de cobranca

**Funcao**

- liberar ou bloquear cliente na regua

**Arquivo principal**

- [app/api/clientes/[id]/regua/route.ts](/abs/path/app/api/clientes/[id]/regua/route.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | validar perfil e identificar vendedor |
| `omie_core.clientes` | localizar cliente e validar carteira do vendedor |

**Gravacao**

| Tabela | Campo alterado |
| --- | --- |
| `omie_core.clientes` | `cliente_desbloqueado_regua` |

**Acesso esperado**

- leitura de sessao com cliente autenticado
- escrita via rota server com `service_role`

### Titulos a vencer

**Funcao**

- abrir modal de titulos tratados / a vencer

**Arquivo principal**

- [app/page.tsx](/abs/path/app/page.tsx:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.regua_dia_vencimento` | listar pedidos, parcela, valor e vencimento |

**Gravacao**

- nenhuma

**Acesso esperado**

- pode funcionar no frontend se a RLS estiver correta
- pode ser migrado para rota server se quisermos padronizar tudo

### Titulos vencidos

**Funcao**

- abrir modal de titulos vencidos
- base para total vencido, inadimplencia e atraso

**Arquivo principal**

- [app/page.tsx](/abs/path/app/page.tsx:1)
- [app/api/clientes/carteira/route.ts](/abs/path/app/api/clientes/carteira/route.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes_meta` | ler `payload_json`, titulos vencidos e atraso |

**Gravacao**

- nenhuma pelo app atual

**Acesso esperado**

- preferencialmente server-side
- tabela sensivel para RLS

### Criar negociacao

**Funcao**

- criar nova negociacao para um cliente

**Arquivo principal**

- [app/api/clientes/[id]/negociacao/route.ts](/abs/path/app/api/clientes/[id]/negociacao/route.ts:1)

**Leitura**

| Tabela / View | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | validar que o usuario e master |
| `omie_core.clientes` | obter cliente, CNPJ e flag `em_negociacao` |
| `omie_core.clientes_negociacoes` | validar se ja existe negociacao ativa |

**Gravacao**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes_negociacoes` | cria o cabecalho da negociacao |
| `omie_core.clientes_negociacoes_parcelas` | cria as parcelas |
| `omie_core.clientes` | marca `em_negociacao = true` |

**Acesso esperado**

- acao obrigatoriamente via rota server
- escrita com `service_role`

### Visualizar negociacao

**Funcao**

- abrir detalhe da negociacao ativa ou ultima negociacao

**Arquivo principal**

- [app/api/clientes/[id]/negociacao/route.ts](/abs/path/app/api/clientes/[id]/negociacao/route.ts:1)

**Leitura**

| Tabela / View | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | validar sessao e perfil |
| `omie_core.clientes` | validar cliente e vendedor responsavel |
| `omie_core.vw_clientes_negociacoes_resumo` | carregar resumo da negociacao |
| `omie_core.clientes_negociacoes_parcelas` | carregar parcelas |

**Gravacao**

- nenhuma

**Acesso esperado**

- leitura pela rota server

### Retomar negociacao inadimplente

**Funcao**

- reabrir negociacao inadimplente
- recalcular parcelas

**Arquivo principal**

- [app/api/clientes/[id]/negociacao/route.ts](/abs/path/app/api/clientes/[id]/negociacao/route.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes` | localizar cliente |
| `omie_core.clientes_negociacoes` | localizar negociacao inadimplente |
| `omie_core.clientes_negociacoes_parcelas` | carregar parcelas atuais |

**Gravacao**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes_negociacoes` | atualiza status, datas e configuracao |
| `omie_core.clientes_negociacoes_parcelas` | remove parcelas nao pagas e recria novas |
| `omie_core.clientes` | marca `em_negociacao = true` |

### Finalizar negociacao

**Funcao**

- marcar negociacao como `quitada`, `cancelada` ou `inadimplente`

**Arquivo principal**

- [app/api/clientes/[id]/negociacao/route.ts](/abs/path/app/api/clientes/[id]/negociacao/route.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes` | localizar cliente |
| `omie_core.clientes_negociacoes` | localizar negociacao ativa |
| `omie_core.clientes_negociacoes_parcelas` | localizar parcelas pendentes |

**Gravacao**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes_negociacoes` | atualiza `status_negociacao` |
| `omie_core.clientes_negociacoes_parcelas` | remove parcelas restantes quando quitada/cancelada |
| `omie_core.clientes` | marca `em_negociacao = false` |

### Pagamento de parcela da negociacao

**Funcao**

- registrar pagamento de parcela
- recalcular ultima parcela, quando necessario

**Arquivo principal**

- [app/api/clientes/[id]/negociacao/parcela/[parcelaId]/route.ts](/abs/path/app/api/clientes/[id]/negociacao/parcela/[parcelaId]/route.ts:1)

**Leitura**

| Tabela / View | Uso |
| --- | --- |
| `omie_core.clientes` | localizar cliente |
| `omie_core.clientes_negociacoes` | localizar negociacao ativa |
| `omie_core.clientes_negociacoes_parcelas` | localizar parcela e recalcular saldo |
| `omie_core.vw_clientes_negociacoes_resumo` | retornar resumo atualizado |

**Gravacao**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes_negociacoes_parcelas` | atualiza `valor_pago`, `pago_em`, `status_parcela` e, se preciso, `valor_parcela` da ultima |

### Usuarios - listagem e visualizacao

**Funcao**

- listar usuarios internos
- confirmar se usuario logado e master

**Arquivos principais**

- [app/usuarios/page.tsx](/abs/path/app/usuarios/page.tsx:1)
- [app/login/usuarios/page.tsx](/abs/path/app/login/usuarios/page.tsx:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | perfil logado e listagem de usuarios |
| `omie_core.clientes` | obter lista de vendedores disponiveis |

**Gravacao**

- nenhuma nessas telas

### Usuarios - criar

**Funcao**

- criar usuario interno
- criar ou reaproveitar usuario no Supabase Auth

**Arquivo principal**

- [app/api/usuarios/criar/route.ts](/abs/path/app/api/usuarios/criar/route.ts:1)

**Leitura**

| Tabela / origem | Uso |
| --- | --- |
| `auth.users` | procurar e-mail ja existente |
| `omie_core.usuarios_dashboard` | validar se o usuario ja existe no schema interno |
| `omie_core.clientes` | validar se o vendedor informado existe na base |

**Gravacao**

| Tabela / origem | Uso |
| --- | --- |
| `auth.users` | cria usuario no Auth ou atualiza senha |
| `omie_core.usuarios_dashboard` | cria / atualiza perfil interno |

### Usuarios - editar status e perfil

**Funcao**

- ativar ou desativar usuario
- alterar perfil
- alterar vendedor vinculado

**Arquivo principal**

- [app/api/usuarios/[id]/route.ts](/abs/path/app/api/usuarios/[id]/route.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | validar usuario alvo e editar perfil |
| `omie_core.clientes` | validar se o vendedor existe na base |

**Gravacao**

| Tabela | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | atualiza `ativo`, `perfil` e `nome_vendedor` |

### Usuarios - trocar senha

**Funcao**

- trocar senha de outro usuario

**Arquivo principal**

- [app/api/usuarios/[id]/senha/route.ts](/abs/path/app/api/usuarios/[id]/senha/route.ts:1)

**Leitura**

- apenas validacao do master logado

**Gravacao**

| Origem | Uso |
| --- | --- |
| `auth.users` | atualiza senha no Supabase Auth |

### Usuarios - excluir

**Funcao**

- remover acesso do usuario

**Arquivo principal**

- [app/api/usuarios/[id]/route.ts](/abs/path/app/api/usuarios/[id]/route.ts:1)

**Gravacao**

| Origem / tabela | Uso |
| --- | --- |
| `auth.users` | exclui usuario do Auth |
| `omie_core.usuarios_dashboard` | remove perfil interno |

## Funcoes auxiliares de permissao

### `requireMasterUser`

**Arquivo**

- [lib/supabase/require-master.ts](/abs/path/lib/supabase/require-master.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.usuarios_dashboard` | confirmar que o usuario logado e master e esta ativo |

### `vendedorExisteNaBase`

**Arquivo**

- [lib/supabase/validar-vendedor.ts](/abs/path/lib/supabase/validar-vendedor.ts:1)

**Leitura**

| Tabela | Uso |
| --- | --- |
| `omie_core.clientes` | confirmar que existe cliente vinculado ao vendedor informado |

## Tabelas mais sensiveis para permissao

### `omie_core.clientes_meta`

- risco maior de erro de RLS no frontend
- hoje participa de:
  - total vencido
  - inadimplencia
  - atraso
  - modal de vencidos
  - base de valor para abrir negociacao

### `omie_core.usuarios_dashboard`

- controla o acesso inteiro do sistema
- qualquer problema aqui impacta login, perfil e permissao de rotas

### `omie_core.clientes_negociacoes` e `omie_core.clientes_negociacoes_parcelas`

- sao tabelas de acao operacional
- qualquer escrita deve continuar em rota server

## Diretriz recomendada para evolucao

### Manter no servidor

- `clientes_meta`
- consolidacoes de carteira
- criacao e manutencao de negociacoes
- operacoes administrativas de usuarios

### Pode ficar no frontend com RLS bem definida

- leituras simples de lista, quando nao envolver tabela sensivel
- consultas estritamente de visualizacao e baixo risco

## Observacao importante

O erro `permission denied for table clientes_meta` esta alinhado com o fato de `clientes_meta` ser uma tabela de visualizacao sensivel. A criacao da negociacao nao grava nela, mas varias telas usam essa tabela como apoio para exibicao e calculo. Por isso, uma falha nela pode parecer erro da negociacao, mesmo quando a escrita real acontece em:

- `omie_core.clientes_negociacoes`
- `omie_core.clientes_negociacoes_parcelas`
- `omie_core.clientes`
