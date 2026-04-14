import { NextResponse } from 'next/server'
import { parseJsonRequest } from '@/lib/http/parse-json-request'
import { handleMensagemWebhook } from '@/lib/mensagem/service'

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonRequest(request)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const payload = parsed.body
    const resultado = await handleMensagemWebhook('tratamento-acima-10-dias-vencimento', payload)

    return NextResponse.json(resultado.body, { status: resultado.status })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro interno no fluxo de mensagem.',
      },
      { status: 500 }
    )
  }
}
