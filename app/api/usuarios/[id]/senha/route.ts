import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireMasterUser } from '@/lib/supabase/require-master'

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
    const body = await request.json()
    const password = String(body.password || '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 })
    }

    if (auth.user?.id === id) {
      return NextResponse.json(
        { error: 'Troque a sua própria senha pelo fluxo do perfil/login.' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A nova senha precisa ter pelo menos 6 caracteres.' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Erro ao trocar senha do usuário.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Senha atualizada com sucesso.',
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao atualizar senha.' },
      { status: 500 }
    )
  }
}
