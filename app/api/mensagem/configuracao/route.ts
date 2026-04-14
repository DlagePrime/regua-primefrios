import { NextResponse } from 'next/server'
import { FLUXOS_MENSAGEM, getTemplatesMensagemDefault, isFluxoMensagemKey } from '@/lib/mensagem/config'
import { loadMensagemConfiguracao, saveMensagemConfiguracao } from '@/lib/mensagem/service'
import { requireActiveUser } from '@/lib/supabase/require-active-user'

export async function GET() {
  try {
    const auth = await requireActiveUser()
    if (auth.error || !auth.user || !auth.perfil) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const data = await loadMensagemConfiguracao(auth.user.id)

    return NextResponse.json({
      ok: true,
      perfil: auth.perfil,
      configuracao: data.configuracao,
      templates: data.templates,
      fluxos: FLUXOS_MENSAGEM,
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
    const ativo = body.ativo !== false
    const templatesBody: unknown[] = Array.isArray(body.templates) ? body.templates : []

    const templates = getTemplatesMensagemDefault().map((defaultTemplate) => {
      const incoming = templatesBody.find(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          isFluxoMensagemKey(String((item as { fluxo?: string }).fluxo || '')) &&
          (item as { fluxo?: string }).fluxo === defaultTemplate.fluxo
      ) as
        | {
            fluxo?: string
            nome_template?: string
            conteudo?: string
          }
        | undefined

      return {
        fluxo: defaultTemplate.fluxo,
        nome_template: String(incoming?.nome_template || defaultTemplate.nome_template).trim(),
        conteudo: String(incoming?.conteudo || '').trim(),
        variaveis: defaultTemplate.variaveis,
      }
    })

    if (!uazapiServerUrl || !uazapiToken) {
      return NextResponse.json(
        { error: 'Informe o Server URL e o token da Uazapi.' },
        { status: 400 }
      )
    }

    const templateInvalido = templates.find((template) => !template.conteudo)
    if (templateInvalido) {
      return NextResponse.json(
        { error: `Preencha o template do fluxo ${templateInvalido.fluxo}.` },
        { status: 400 }
      )
    }

    await saveMensagemConfiguracao({
      usuarioId: auth.user.id,
      nomeVendedor: auth.perfil.nome_vendedor,
      uazapiServerUrl,
      uazapiToken,
      ativo,
      templates,
    })

    const data = await loadMensagemConfiguracao(auth.user.id)

    return NextResponse.json({
      ok: true,
      message: 'Configuração de mensagem salva com sucesso.',
      configuracao: data.configuracao,
      templates: data.templates,
      fluxos: FLUXOS_MENSAGEM,
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
