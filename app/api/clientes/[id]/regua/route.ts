import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(_: Request, context: Params) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
    }

    const { data: perfil, error: perfilError } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil || perfil.ativo !== true) {
      return NextResponse.json({ error: 'Usuário sem acesso.' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
    }

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, nome_vendedor_padrao_snapshot, cliente_desbloqueado_regua')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    if (
      perfil.perfil !== 'master' &&
      (perfil.nome_vendedor || '').trim() !== (cliente.nome_vendedor_padrao_snapshot || '').trim()
    ) {
      return NextResponse.json({ error: 'Você não pode alterar este cliente.' }, { status: 403 })
    }

    const novo = !(cliente.cliente_desbloqueado_regua === true)

    const { data: atualizado, error: updateError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .update({ cliente_desbloqueado_regua: novo })
      .eq('id', id)
      .select('id, cliente_desbloqueado_regua')
      .single()

    if (updateError || !atualizado) {
      return NextResponse.json(
        { error: updateError?.message || 'Erro ao atualizar cliente.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      cliente_desbloqueado_regua: atualizado.cliente_desbloqueado_regua,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao atualizar a régua do cliente.' },
      { status: 500 }
    )
  }
}
