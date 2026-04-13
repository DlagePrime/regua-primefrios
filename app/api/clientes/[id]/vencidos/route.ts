import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{
    id: string
  }>
}

function parsePayload(payload: unknown) {
  if (!payload) return null

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  return typeof payload === 'object' ? payload : null
}

function titulos(payload: unknown) {
  const data = parsePayload(payload) as { titulos?: Array<Record<string, unknown>> } | null
  if (!data?.titulos) return []

  return data.titulos.map((titulo, index) => ({
    id: `${String(titulo.doc || 'sem-doc')}-${index}`,
    doc: String(titulo.doc || ''),
    status: String(titulo.status || ''),
    parcela: String(titulo.parcela || ''),
    emissao: String(titulo.emissao || ''),
    vencimento: String(titulo.vencimento || ''),
    valor_fatura: String(titulo.valor_fatura || ''),
  }))
}

export async function GET(_: Request, context: Params) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Cliente invalido.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessao invalida.' }, { status: 401 })
    }

    const { data: perfil, error: perfilError } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil || perfil.ativo !== true) {
      return NextResponse.json({ error: 'Usuario sem acesso.' }, { status: 403 })
    }

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, cnpj_cpf, nome_vendedor_padrao_snapshot')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    if (
      perfil.perfil !== 'master' &&
      (perfil.nome_vendedor || '').trim() !==
        (cliente.nome_vendedor_padrao_snapshot || '').trim()
    ) {
      return NextResponse.json(
        { error: 'Voce nao pode visualizar os titulos vencidos deste cliente.' },
        { status: 403 }
      )
    }

    const { data: meta, error: metaError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_meta')
      .select('payload_json')
      .eq('cnpj_cpf', cliente.cnpj_cpf || '')
      .order('id', { ascending: false })
      .limit(1)

    if (metaError) {
      return NextResponse.json(
        { error: metaError.message || 'Erro ao carregar titulos vencidos.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      vencidos: titulos(meta?.[0]?.payload_json),
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao carregar titulos vencidos.' },
      { status: 500 }
    )
  }
}
