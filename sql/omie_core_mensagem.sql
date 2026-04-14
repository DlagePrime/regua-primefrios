create extension if not exists pgcrypto;

create schema if not exists omie_core;

create table if not exists omie_core.mensagem_vendedores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users (id) on delete cascade,
  nome_vendedor text null,
  uazapi_instance text not null,
  uazapi_token text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists omie_core.mensagem_templates (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fluxo text not null check (
    fluxo in (
      'tratamento-menos-10-dias-vencido',
      'tratamento-acima-10-dias-vencimento',
      'tratamento-titulos-negociados',
      'tratamento-titulos-emitido-dia'
    )
  ),
  nome_template text not null,
  conteudo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mensagem_templates_usuario_fluxo_key unique (usuario_id, fluxo)
);

create table if not exists omie_core.mensagem_logs (
  id uuid primary key default gen_random_uuid(),
  fluxo text not null,
  usuario_id uuid null references auth.users (id) on delete set null,
  nome_vendedor text null,
  cliente_nome text null,
  contato text null,
  telefone text null,
  status_envio text not null check (status_envio in ('sucesso', 'erro')),
  erro text null,
  http_status integer null,
  payload_entrada jsonb not null default '{}'::jsonb,
  payload_uazapi jsonb not null default '{}'::jsonb,
  resposta_uazapi jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function omie_core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mensagem_vendedores_set_updated_at on omie_core.mensagem_vendedores;
create trigger mensagem_vendedores_set_updated_at
before update on omie_core.mensagem_vendedores
for each row
execute function omie_core.set_updated_at();

drop trigger if exists mensagem_templates_set_updated_at on omie_core.mensagem_templates;
create trigger mensagem_templates_set_updated_at
before update on omie_core.mensagem_templates
for each row
execute function omie_core.set_updated_at();

create index if not exists mensagem_vendedores_nome_vendedor_idx
  on omie_core.mensagem_vendedores (nome_vendedor);

create index if not exists mensagem_logs_fluxo_idx
  on omie_core.mensagem_logs (fluxo);

create index if not exists mensagem_logs_usuario_idx
  on omie_core.mensagem_logs (usuario_id);

alter table omie_core.mensagem_vendedores enable row level security;
alter table omie_core.mensagem_templates enable row level security;
alter table omie_core.mensagem_logs enable row level security;

grant usage on schema omie_core to authenticated;
grant usage on schema omie_core to service_role;

grant all privileges on table omie_core.mensagem_vendedores to service_role;
grant all privileges on table omie_core.mensagem_templates to service_role;
grant all privileges on table omie_core.mensagem_logs to service_role;

grant select, insert, update on table omie_core.mensagem_vendedores to authenticated;
grant select, insert, update on table omie_core.mensagem_templates to authenticated;
grant select on table omie_core.mensagem_logs to authenticated;
