-- Prime Frios
-- RLS para manter o app atual funcionando com separação entre master e vendedor.
-- Tabelas cobertas:
--   omie_core.usuarios_dashboard
--   omie_core.clientes
--   omie_core.clientes_meta
--   omie_core.regua_dia_vencimento
--
-- Observação:
-- - as escritas administrativas do app já passam por rotas de API com service_role
-- - por isso, o browser precisa basicamente de SELECT com RLS bem definido

grant usage on schema omie_core to authenticated, service_role;

grant select on table omie_core.usuarios_dashboard to authenticated, service_role;
grant select on table omie_core.clientes to authenticated, service_role;
grant select on table omie_core.clientes_meta to authenticated, service_role;
grant select on table omie_core.regua_dia_vencimento to authenticated, service_role;

revoke all on table omie_core.usuarios_dashboard from anon;
revoke all on table omie_core.clientes from anon;
revoke all on table omie_core.clientes_meta from anon;
revoke all on table omie_core.regua_dia_vencimento from anon;

create or replace function public.primefrios_normalize_doc(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g')
$$;

create or replace function public.primefrios_is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, omie_core
as $$
  select exists (
    select 1
    from omie_core.usuarios_dashboard u
    where u.id = auth.uid()
      and u.ativo = true
  )
$$;

create or replace function public.primefrios_is_master()
returns boolean
language sql
stable
security definer
set search_path = public, omie_core
as $$
  select exists (
    select 1
    from omie_core.usuarios_dashboard u
    where u.id = auth.uid()
      and u.ativo = true
      and u.perfil = 'master'
  )
$$;

create or replace function public.primefrios_current_vendedor()
returns text
language sql
stable
security definer
set search_path = public, omie_core
as $$
  select nullif(trim(u.nome_vendedor), '')
  from omie_core.usuarios_dashboard u
  where u.id = auth.uid()
    and u.ativo = true
  limit 1
$$;

create or replace function public.primefrios_can_access_doc(doc text)
returns boolean
language sql
stable
security definer
set search_path = public, omie_core
as $$
  select
    public.primefrios_is_master()
    or exists (
      select 1
      from omie_core.clientes c
      where public.primefrios_normalize_doc(c.cnpj_cpf) = public.primefrios_normalize_doc(doc)
        and nullif(trim(c.nome_vendedor_padrao_snapshot), '') = public.primefrios_current_vendedor()
    )
$$;

revoke all on function public.primefrios_normalize_doc(text) from public;
revoke all on function public.primefrios_is_active_user() from public;
revoke all on function public.primefrios_is_master() from public;
revoke all on function public.primefrios_current_vendedor() from public;
revoke all on function public.primefrios_can_access_doc(text) from public;

grant execute on function public.primefrios_normalize_doc(text) to authenticated, service_role;
grant execute on function public.primefrios_is_active_user() to authenticated, service_role;
grant execute on function public.primefrios_is_master() to authenticated, service_role;
grant execute on function public.primefrios_current_vendedor() to authenticated, service_role;
grant execute on function public.primefrios_can_access_doc(text) to authenticated, service_role;

alter table omie_core.usuarios_dashboard enable row level security;
alter table omie_core.clientes enable row level security;
alter table omie_core.clientes_meta enable row level security;
alter table omie_core.regua_dia_vencimento enable row level security;

drop policy if exists usuarios_dashboard_select_self on omie_core.usuarios_dashboard;
drop policy if exists usuarios_dashboard_select_master_all on omie_core.usuarios_dashboard;
drop policy if exists clientes_select_master_all on omie_core.clientes;
drop policy if exists clientes_select_vendedor_carteira on omie_core.clientes;
drop policy if exists clientes_meta_select_master_all on omie_core.clientes_meta;
drop policy if exists clientes_meta_select_vendedor_carteira on omie_core.clientes_meta;
drop policy if exists regua_dia_vencimento_select_master_all on omie_core.regua_dia_vencimento;
drop policy if exists regua_dia_vencimento_select_vendedor_carteira on omie_core.regua_dia_vencimento;

create policy usuarios_dashboard_select_self
on omie_core.usuarios_dashboard
for select
to authenticated
using (id = auth.uid());

create policy usuarios_dashboard_select_master_all
on omie_core.usuarios_dashboard
for select
to authenticated
using (public.primefrios_is_master());

create policy clientes_select_master_all
on omie_core.clientes
for select
to authenticated
using (public.primefrios_is_master());

create policy clientes_select_vendedor_carteira
on omie_core.clientes
for select
to authenticated
using (
  public.primefrios_is_active_user()
  and nullif(trim(nome_vendedor_padrao_snapshot), '') = public.primefrios_current_vendedor()
);

create policy clientes_meta_select_master_all
on omie_core.clientes_meta
for select
to authenticated
using (public.primefrios_is_master());

create policy clientes_meta_select_vendedor_carteira
on omie_core.clientes_meta
for select
to authenticated
using (
  public.primefrios_is_active_user()
  and public.primefrios_can_access_doc(cnpj_cpf)
);

create policy regua_dia_vencimento_select_master_all
on omie_core.regua_dia_vencimento
for select
to authenticated
using (public.primefrios_is_master());

create policy regua_dia_vencimento_select_vendedor_carteira
on omie_core.regua_dia_vencimento
for select
to authenticated
using (
  public.primefrios_is_active_user()
  and public.primefrios_can_access_doc(cnpj_cpf)
);

-- Se a sua instância usa Realtime na dashboard, confirme também que essas tabelas
-- estão na publication supabase_realtime.
