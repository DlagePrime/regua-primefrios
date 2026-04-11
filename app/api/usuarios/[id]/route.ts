import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireMasterUser } from '@/lib/supabase/require-master'
import { vendedorExisteNaBase } from '@/lib/supabase/validar-vendedor'

type Params = {
  params: Promise<{
    id: string
  }>
}

export async function PATCH(request: Request, context: Params) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 })
    }

    if (auth.user?.id === id) {
      return NextResponse.json(
        { error: 'Você não pode alterar o seu próprio usuário por esta rota.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const patch: Record<string, boolean | string | null> = {}

    if ('ativo' in body) {
      patch.ativo = body.ativo === true
    }

    if ('perfil' in body) {
      const perfil = String(body.perfil || '').trim()
      if (perfil !== 'master' && perfil !== 'vendedor') {
        return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
      }

      patch.perfil = perfil

      const nomeVendedor = String(body.nome_vendedor || '').trim()
      if (perfil === 'vendedor') {
        if (!nomeVendedor) {
          return NextResponse.json(
            { error: 'Informe o nome do vendedor.' },
            { status: 400 }
          )
        }

        if (!(await vendedorExisteNaBase(nomeVendedor))) {
          return NextResponse.json(
            { error: 'Escolha um vendedor existente na base de clientes.' },
            { status: 400 }
          )
        }

        patch.nome_vendedor = nomeVendedor
      } else {
        patch.nome_vendedor = null
      }
    } else if ('nome_vendedor' in body) {
      patch.nome_vendedor = body.nome_vendedor ? String(body.nome_vendedor).trim() : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma alteração válida foi enviada.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .schema('omie_core')
      .from('usuarios_dashboard')
      .update(patch)
      .eq('id', id)
      .select('id, email, nome, perfil, nome_vendedor, ativo, criado_em')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Erro ao atualizar usuário.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      usuario: data,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao atualizar usuário.' },
      { status: 500 }
    )
  }
}

export async function DELETE(_: Request, context: Params) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 })
    }

    if (auth.user?.id === id) {
      return NextResponse.json(
        { error: 'Você não pode excluir o seu próprio usuário.' },
        { status: 400 }
      )
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (authDeleteError) {
      return NextResponse.json(
        { error: authDeleteError.message || 'Erro ao excluir usuário no Auth.' },
        { status: 400 }
      )
    }

    const { error: perfilDeleteError } = await supabaseAdmin
      .schema('omie_core')
      .from('usuarios_dashboard')
      .delete()
      .eq('id', id)

    if (perfilDeleteError) {
      return NextResponse.json({ error: perfilDeleteError.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: 'Usuário excluído com sucesso.',
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao excluir usuário.' },
      { status: 500 }
    )
  }
}
