type Payload = Record<string, unknown>

function pickFirst(payload: Payload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return null
}

function asNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function asString(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function formatCurrency(value: unknown) {
  const number = asNumber(value)
  if (number === null) return ''

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number)
}

function formatTitulosResumo(value: unknown) {
  if (!Array.isArray(value)) return ''

  const titulos = value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
  )

  if (!titulos.length) return ''

  return titulos
    .map((titulo) => {
      const partes = [
        `Doc: ${asString(titulo.doc) || '-'}`,
        `Status: ${asString(titulo.status) || '-'}`,
        `Emissão: ${asString(titulo.emissao) || '-'}`,
        `Vencimento: ${asString(titulo.vencimento) || '-'}`,
        `Valor: ${asString(titulo.valor_fatura) || formatCurrency(titulo.valor_documento) || '-'}`,
      ]

      const diasVencidos = asString(titulo.dias_vencidos)
      if (diasVencidos) {
        partes.push(`Dias vencidos: ${diasVencidos}`)
      }

      return partes.join('\n')
    })
    .join('\n\n--------------------\n\n')
}

export function resolveTelefoneMensagem(payload: Payload) {
  const raw = asString(
    pickFirst(payload, [
      'numero_destino',
      'whatsapp',
      'chatid',
      'telefone',
      'numero',
      'phone',
      'celular',
      'destinatario',
      'recipient',
    ])
  )

  return raw.replace(/@.*$/i, '').replace(/\D/g, '')
}

export function buildMensagemTemplateContext(payload: Payload) {
  const context: Record<string, string> = {}

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      context[key] = String(value)
    }
  }

  context.contato = asString(pickFirst(payload, ['contato', 'nome_contato', 'responsavel']))
  context.cliente = asString(
    pickFirst(payload, ['cliente', 'razao_social', 'nome_fantasia', 'fantasia'])
  )
  context.razao_social = asString(pickFirst(payload, ['razao_social', 'cliente']))
  context.numero_pedido = asString(
    pickFirst(payload, ['numero_pedido', 'pedido', 'pedido_numero'])
  )
  context.numero_parcela = asString(
    pickFirst(payload, ['numero_parcela', 'parcela', 'parcela_numero'])
  )
  context.valor_documento =
    formatCurrency(pickFirst(payload, ['valor_documento', 'valor'])) ||
    asString(pickFirst(payload, ['valor_documento', 'valor']))
  context.valor =
    formatCurrency(pickFirst(payload, ['valor', 'valor_documento'])) ||
    asString(pickFirst(payload, ['valor', 'valor_documento']))
  context.data_vencimento = asString(
    pickFirst(payload, ['data_vencimento', 'vencimento', 'proximo_vencimento'])
  )
  context.vencimento = context.data_vencimento
  context.dias_atraso = asString(pickFirst(payload, ['dias_atraso', 'dias_vencidos']))
  context.dias_vencidos = asString(pickFirst(payload, ['dias_vencidos', 'dias_atraso']))
  context.quantidade_titulos_faixa = asString(
    pickFirst(payload, ['quantidade_titulos_faixa', 'quantidade_titulos'])
  )
  context.valor_total_faixa_formatado =
    asString(payload.valor_total_faixa_formatado) ||
    formatCurrency(pickFirst(payload, ['valor_total_faixa', 'valor_total'])) ||
    ''
  context.valor_total_divida =
    formatCurrency(pickFirst(payload, ['valor_total_divida'])) ||
    asString(pickFirst(payload, ['valor_total_divida']))
  context.valor_total_pago =
    formatCurrency(pickFirst(payload, ['valor_total_pago'])) ||
    asString(pickFirst(payload, ['valor_total_pago']))
  context.quantidade_parcelas = asString(pickFirst(payload, ['quantidade_parcelas']))
  context.status_negociacao = asString(pickFirst(payload, ['status_negociacao']))
  context.proximo_vencimento = asString(pickFirst(payload, ['proximo_vencimento']))
  context.whatsapp = resolveTelefoneMensagem(payload)
  context.titulos_resumo = formatTitulosResumo(payload.titulos)

  return context
}

export function renderMensagemTemplate(template: string, payload: Payload) {
  const context = buildMensagemTemplateContext(payload)

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => context[key] || '')
}
