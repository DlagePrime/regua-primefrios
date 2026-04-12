-- Prime Frios
-- Complemento de RLS/grants para o módulo de negociação.

grant usage on schema omie_core to authenticated, service_role;

grant select, insert, update, delete on table omie_core.clientes_negociacoes to service_role;
grant select, insert, update, delete on table omie_core.clientes_negociacoes_parcelas to service_role;
grant select on table omie_core.vw_clientes_negociacoes_resumo to service_role;

grant select on table omie_core.clientes_negociacoes to authenticated;
grant select on table omie_core.clientes_negociacoes_parcelas to authenticated;
grant select on table omie_core.vw_clientes_negociacoes_resumo to authenticated;

revoke all on table omie_core.clientes_negociacoes from anon;
revoke all on table omie_core.clientes_negociacoes_parcelas from anon;
revoke all on table omie_core.vw_clientes_negociacoes_resumo from anon;

alter table omie_core.clientes_negociacoes enable row level security;
alter table omie_core.clientes_negociacoes_parcelas enable row level security;

drop policy if exists clientes_negociacoes_select_master_all on omie_core.clientes_negociacoes;
drop policy if exists clientes_negociacoes_select_vendedor_carteira on omie_core.clientes_negociacoes;
drop policy if exists clientes_negociacoes_parcelas_select_master_all on omie_core.clientes_negociacoes_parcelas;
drop policy if exists clientes_negociacoes_parcelas_select_vendedor_carteira on omie_core.clientes_negociacoes_parcelas;

create policy clientes_negociacoes_select_master_all
on omie_core.clientes_negociacoes
for select
to authenticated
using (public.primefrios_is_master());

create policy clientes_negociacoes_select_vendedor_carteira
on omie_core.clientes_negociacoes
for select
to authenticated
using (
  public.primefrios_is_active_user()
  and public.primefrios_can_access_doc(cnpj_cpf)
);

create policy clientes_negociacoes_parcelas_select_master_all
on omie_core.clientes_negociacoes_parcelas
for select
to authenticated
using (
  public.primefrios_is_master()
);

create policy clientes_negociacoes_parcelas_select_vendedor_carteira
on omie_core.clientes_negociacoes_parcelas
for select
to authenticated
using (
  public.primefrios_is_active_user()
  and exists (
    select 1
    from omie_core.clientes_negociacoes n
    where n.id = negociacao_id
      and public.primefrios_can_access_doc(n.cnpj_cpf)
  )
);
