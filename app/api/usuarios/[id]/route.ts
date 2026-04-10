import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireMasterUser } from '@/lib/supabase/require-master'

type Params = {
  params: Promise<{
    id: string
  }>
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
