export const FLUXOS_MENSAGEM = [
  {
    key: 'tratamento-menos-10-dias-vencido',
    titulo: 'Tratamento Menos de 10 Dias de Vencido',
    path: '/api/mensagem/tratamento-menos-10-dias-vencido',
    descricao:
      'Fluxo para clientes com atraso inicial, com lembrete objetivo sobre o título em aberto.',
    variaveis: [
      'contato',
      'cliente',
      'numero_pedido',
      'numero_parcela',
      'valor_documento',
      'data_vencimento',
      'whatsapp',
    ],
    exemplo:
      'Olá, {contato}.\nPassando para lembrar que o título do pedido nº {numero_pedido}, parcela {numero_parcela}, está vencido.\nValor: {valor_documento}\nVencimento: {data_vencimento}',
  },
  {
    key: 'tratamento-acima-10-dias-vencimento',
    titulo: 'Tratamento Acima de 10 Dias de Vencimento',
    path: '/api/mensagem/tratamento-acima-10-dias-vencimento',
    descricao:
      'Fluxo para cobrança mais estruturada, com destaque para faixa de atraso e resumo dos títulos.',
    variaveis: [
      'contato',
      'razao_social',
      'dias_vencidos',
      'quantidade_titulos_faixa',
      'valor_total_faixa_formatado',
      'titulos_resumo',
      'whatsapp',
    ],
    exemplo:
      'Olá, {contato}.\nPrecisamos alinhar os débitos em aberto.\n{razao_social}\nDias vencidos: {dias_vencidos}\n{quantidade_titulos_faixa} boletos vencidos\nValor total: {valor_total_faixa_formatado}\n\n{titulos_resumo}',
  },
  {
    key: 'tratamento-titulos-negociados',
    titulo: 'Tratamento Títulos Negociados',
    path: '/api/mensagem/tratamento-titulos-negociados',
    descricao:
      'Fluxo para acompanhamento de acordos e parcelas negociadas, mantendo o cliente orientado.',
    variaveis: [
      'contato',
      'cliente',
      'status_negociacao',
      'valor_total_divida',
      'quantidade_parcelas',
      'proximo_vencimento',
      'whatsapp',
    ],
    exemplo:
      'Olá, {contato}.\nSeu acordo segue com status {status_negociacao}.\nValor negociado: {valor_total_divida}\nParcelas: {quantidade_parcelas}\nPróximo vencimento: {proximo_vencimento}',
  },
  {
    key: 'tratamento-titulos-emitido-dia',
    titulo: 'Tratamento Títulos Emitido no Dia',
    path: '/api/mensagem/tratamento-titulos-emitido-dia',
    descricao:
      'Fluxo para o dia do vencimento, reforçando pedido, parcela, valor e vencimento do título.',
    variaveis: [
      'contato',
      'numero_pedido',
      'numero_parcela',
      'valor_documento',
      'data_vencimento',
      'whatsapp',
    ],
    exemplo:
      'Olá, {contato}.\nPassando para lembrar que o título do pedido nº {numero_pedido}, parcela {numero_parcela}, vence hoje.\nValor: {valor_documento}\nVencimento: {data_vencimento}',
  },
] as const

export type FluxoMensagemKey = (typeof FLUXOS_MENSAGEM)[number]['key']

export type TemplateMensagem = {
  fluxo: FluxoMensagemKey
  nome_template: string
  conteudo: string
  variaveis: readonly string[]
}

export function isFluxoMensagemKey(value: string): value is FluxoMensagemKey {
  return FLUXOS_MENSAGEM.some((fluxo) => fluxo.key === value)
}

export function getFluxoMensagem(fluxo: FluxoMensagemKey) {
  return FLUXOS_MENSAGEM.find((item) => item.key === fluxo) || FLUXOS_MENSAGEM[0]
}

export function getTemplatesMensagemDefault(): TemplateMensagem[] {
  return FLUXOS_MENSAGEM.map((fluxo) => ({
    fluxo: fluxo.key,
    nome_template: fluxo.titulo,
    conteudo: fluxo.exemplo,
    variaveis: [...fluxo.variaveis],
  }))
}
