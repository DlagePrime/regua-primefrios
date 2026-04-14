import { NextResponse } from 'next/server'
import { FLUXOS_MENSAGEM } from '@/lib/mensagem/config'
import {
  loadMensagemConfiguracao,
  loadRelatorioMensagemDia,
  saveMensagemConfiguracao,
} from '@/lib/mensagem/service'
import { requireActiveUser } from '@/lib/supabase/require-active-user'

export async function GET() {
  try {
    const auth = await requireActiveUser()
    if (auth.error || !auth.user || !auth.perfil) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const data = await loadMensagemConfiguracao(auth.user.id)
    const relatorioDia = await loadRelatorioMensagemDia(auth.user.id)

    return NextResponse.json({
      ok: true,
      perfil: auth.perfil,
      configuracao: data.configuracao,
      fluxos: FLUXOS_MENSAGEM,
      relatorio_dia: relatorioDia,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao carregar a configuração de mensagem.',
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireActiveUser()
    if (auth.error || !auth.user || !auth.perfil) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()

    const uazapiServerUrl = String(body.uazapi_server_url || body.uazapi_instance || '').trim()
    const uazapiToken = String(body.uazapi_token || '').trim()
    const uazapiInstancia = String(
      body.uazapi_instancia || body.instancia || body.instance || ''
    ).trim()
    const ativo = body.ativo !== false

    if (!uazapiServerUrl || !uazapiToken || !uazapiInstancia) {
      return NextResponse.json(
        { error: 'Informe a instância, o Server URL e o token da Uazapi.' },
        { status: 400 }
      )
    }

    await saveMensagemConfiguracao({
      usuarioId: auth.user.id,
      uazapiServerUrl,
      uazapiToken,
      uazapiInstancia,
      ativo,
    })

    const data = await loadMensagemConfiguracao(auth.user.id)
    const relatorioDia = await loadRelatorioMensagemDia(auth.user.id)

    return NextResponse.json({
      ok: true,
      message: 'Configuração de mensagem salva com sucesso.',
      configuracao: data.configuracao,
      fluxos: FLUXOS_MENSAGEM,
      relatorio_dia: relatorioDia,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno ao salvar a configuração de mensagem.',
      },
      { status: 500 }
    )
  }
}
