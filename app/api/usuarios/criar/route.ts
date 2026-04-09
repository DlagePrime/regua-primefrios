import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '').trim()
    const nome = String(body.nome || '').trim()
    const perfil = String(body.perfil || '').trim()
    const nome_vendedor = String(body.nome_vendedor || '').trim()
    const ativo = body.ativo === false ? false : true

    if (!email || !password || !nome || !perfil) {
      return NextResponse.json(
        { error: 'Preencha email, senha, nome e perfil.' },
        { status: 400 }
      )
    }

    if (perfil !== 'master' && perfil !== 'vendedor') {
      return NextResponse.json(
        { error: 'Perfil inválido.' },
        { status: 400 }
      )
    }

    if (perfil === 'vendedor' && !nome_vendedor) {
      return NextResponse.json(
        { error: 'Informe o nome do vendedor.' },
        { status: 400 }
      )
    }

    const { data: authCriado, error: erroAuth } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (erroAuth || !authCriado.user) {
      return NextResponse.json(
        { error: erroAuth?.message || 'Erro ao criar usuário no Auth.' },
        { status: 400 }
      )
    }

    const { error: erroPerfil } = await supabaseAdmin
      .schema('omie_core')
      .from('usuarios_dashboard')
      .upsert({
        id: authCriado.user.id,
        email,
        nome,
        perfil,
        nome_vendedor: perfil === 'master' ? null : nome_vendedor,
        ativo,
      })

    if (erroPerfil) {
      return NextResponse.json(
        { error: erroPerfil.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'Usuário criado com sucesso.',
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao criar usuário.' },
      { status: 500 }
    )
  }
}