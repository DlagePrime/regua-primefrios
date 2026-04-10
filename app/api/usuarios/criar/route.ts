import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireMasterUser } from '@/lib/supabase/require-master'

async function findAuthUserByEmail(email: string) {
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw error
    }

    const found = data.users.find(
      (user) => (user.email || '').toLowerCase() === email.toLowerCase()
    )

    if (found) {
      return found
    }

    if (data.users.length < 200) {
      return null
    }

    page += 1
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()

    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '').trim()
    const nome = String(body.nome || '').trim()
    const perfil = String(body.perfil || '').trim()
    const nomeVendedor = String(body.nome_vendedor || '').trim()
    const ativo = body.ativo === false ? false : true

    if (!email || !password || !nome || !perfil) {
      return NextResponse.json(
        { error: 'Preencha email, senha, nome e perfil.' },
        { status: 400 }
      )
    }

    if (perfil !== 'master' && perfil !== 'vendedor') {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }

    if (perfil === 'vendedor' && !nomeVendedor) {
      return NextResponse.json(
        { error: 'Informe o nome do vendedor.' },
        { status: 400 }
      )
    }

    let authUser = await findAuthUserByEmail(email)
    let createdNow = false

    if (!authUser) {
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

      authUser = authCriado.user
      createdNow = true
    } else {
      const { data: perfilExistente, error: perfilExistenteError } = await supabaseAdmin
        .schema('omie_core')
        .from('usuarios_dashboard')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle()

      if (perfilExistenteError) {
        return NextResponse.json(
          { error: perfilExistenteError.message },
          { status: 400 }
        )
      }

      if (perfilExistente) {
        return NextResponse.json(
          { error: 'Já existe um usuário cadastrado com este e-mail.' },
          { status: 400 }
        )
      }

      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        authUser.id,
        {
          password,
          email_confirm: true,
        }
      )

      if (updateAuthError) {
        return NextResponse.json(
          { error: updateAuthError.message || 'Erro ao atualizar o Auth.' },
          { status: 400 }
        )
      }
    }

    const { error: erroPerfil } = await supabaseAdmin
      .schema('omie_core')
      .from('usuarios_dashboard')
      .upsert({
        id: authUser.id,
        email,
        nome,
        perfil,
        nome_vendedor: perfil === 'master' ? null : nomeVendedor,
        ativo,
      })

    if (erroPerfil) {
      if (createdNow) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id)
      }

      return NextResponse.json({ error: erroPerfil.message }, { status: 400 })
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
