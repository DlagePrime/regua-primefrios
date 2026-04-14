import { supabaseAdmin } from '@/lib/supabase/admin'
import { FluxoMensagemKey } from '@/lib/mensagem/config'
import { resolveTelefoneMensagem } from '@/lib/mensagem/template'

const SCHEMA = 'omie_core'

type ConfiguracaoMensagemRow = {
  usuario_id: string
  nome_vendedor: string | null
  uazapi_instance: string | null
  uazapi_token: string | null
  ativo: boolean | null
}

export type RelatorioMensagemDia = {
  id: string
  fluxo: string
  status_envio: string
  nome_vendedor: string | null
  cliente_nome: string | null
  contato: string | null
  telefone: string | null
  http_status: number | null
  erro: string | null
  mensagem: string
  created_at: string
}

type ClienteMensagemRow = {
  id: string
  cnpj_cpf: string | null
  razao_social: string | null
  whatsapp: string | null
  cliente_desbloqueado_regua: boolean | null
  em_negociacao: boolean | null
  nome_vendedor_padrao_snapshot: string | null
}

function normalizeDoc(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function parseObject(value: unknown) {
  if (Array.isArray(value)) {
    const [first] = value
    return typeof first === 'object' && first !== null
      ? (first as Record<string, unknown>)
      : {}
  }

  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function parseItems(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
    )
  }

  if (typeof value === 'object' && value !== null) {
    return [value as Record<string, unknown>]
  }

  return []
}

function resolveMensagemPronta(payload: Record<string, unknown>) {
  const content =
    typeof payload.content === 'object' && payload.content !== null
      ? (payload.content as Record<string, unknown>)
      : {}

  return String(payload.mensagem || payload.text || content.text || payload.texto || '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizeUazapiServerUrl(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/$/, '')
}

function buildUazapiSendUrl(value?: string | null) {
  const normalized = normalizeUazapiServerUrl(value)
  if (!normalized) return ''

  if (/\/send\/text$/i.test(normalized)) {
    return normalized
  }

  return `${normalized}/send/text`
}

export async function loadMensagemConfiguracao(usuarioId: string) {
  const { data: configuracao, error: configError } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_vendedores')
    .select('usuario_id, nome_vendedor, uazapi_instance, uazapi_token, ativo')
    .eq('usuario_id', usuarioId)
    .maybeSingle<ConfiguracaoMensagemRow>()

  if (configError) {
    throw configError
  }

  return {
    configuracao: {
      uazapi_server_url: configuracao?.uazapi_instance || '',
      uazapi_token: configuracao?.uazapi_token || '',
      ativo: configuracao?.ativo !== false,
      nome_vendedor: configuracao?.nome_vendedor || null,
    },
  }
}

export async function saveMensagemConfiguracao(input: {
  usuarioId: string
  nomeVendedor: string | null
  uazapiServerUrl: string
  uazapiToken: string
  ativo: boolean
}) {
  const { error: configError } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_vendedores')
    .upsert(
      {
        usuario_id: input.usuarioId,
        nome_vendedor: input.nomeVendedor,
        uazapi_instance: normalizeUazapiServerUrl(input.uazapiServerUrl),
        uazapi_token: input.uazapiToken,
        ativo: input.ativo,
      },
      { onConflict: 'usuario_id' }
    )

  if (configError) {
    throw configError
  }
}

async function resolveClienteMensagem(payload: Record<string, unknown>) {
  const clienteId = String(payload.cliente_id || '').trim()
  if (clienteId) {
    const { data } = await supabaseAdmin
      .schema(SCHEMA)
      .from('clientes')
      .select(
        'id, cnpj_cpf, razao_social, whatsapp, cliente_desbloqueado_regua, em_negociacao, nome_vendedor_padrao_snapshot'
      )
      .eq('id', clienteId)
      .maybeSingle<ClienteMensagemRow>()

    if (data) {
      return data
    }
  }

  const rawDoc = String(payload.cnpj_cpf || '').trim()
  if (!rawDoc) {
    return null
  }

  const normalized = normalizeDoc(rawDoc)

  let query = supabaseAdmin
    .schema(SCHEMA)
    .from('clientes')
    .select(
      'id, cnpj_cpf, razao_social, whatsapp, cliente_desbloqueado_regua, em_negociacao, nome_vendedor_padrao_snapshot'
    )
    .eq('cnpj_cpf', rawDoc)
    .maybeSingle<ClienteMensagemRow>()

  let { data } = await query
  if (data) {
    return data
  }

  if (normalized && normalized !== rawDoc) {
    query = supabaseAdmin
      .schema(SCHEMA)
      .from('clientes')
      .select(
        'id, cnpj_cpf, razao_social, whatsapp, cliente_desbloqueado_regua, em_negociacao, nome_vendedor_padrao_snapshot'
      )
      .eq('cnpj_cpf', normalized)
      .maybeSingle<ClienteMensagemRow>()

    const second = await query
    data = second.data || null
  }

  return data || null
}

async function resolveConfiguracaoDestino(payload: Record<string, unknown>) {
  const usuarioId = String(payload.usuario_id || payload.vendedor_id || '').trim()
  if (usuarioId) {
    const { data } = await supabaseAdmin
      .schema(SCHEMA)
      .from('mensagem_vendedores')
      .select('usuario_id, nome_vendedor, uazapi_instance, uazapi_token, ativo')
      .eq('usuario_id', usuarioId)
      .maybeSingle<ConfiguracaoMensagemRow>()

    if (data) {
      return {
        configuracao: data,
        cliente: await resolveClienteMensagem(payload),
      }
    }
  }

  const payloadObject = parseObject(payload)
  const cliente = await resolveClienteMensagem(payloadObject)

  const nomeVendedor =
    String(
      payload.nome_vendedor ||
        payload.vendedor ||
        payload.nome_vendedor_padrao_snapshot ||
        cliente?.nome_vendedor_padrao_snapshot ||
        ''
    ).trim() || null

  if (!nomeVendedor) {
    return {
      configuracao: null,
      cliente,
    }
  }

  const { data: configuracao } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_vendedores')
    .select('usuario_id, nome_vendedor, uazapi_instance, uazapi_token, ativo')
    .eq('nome_vendedor', nomeVendedor)
    .maybeSingle<ConfiguracaoMensagemRow>()

  return {
    configuracao: configuracao || null,
    cliente,
  }
}

async function registrarLogMensagem(input: {
  fluxo: FluxoMensagemKey
  usuarioId?: string | null
  nomeVendedor?: string | null
  clienteNome?: string | null
  contato?: string | null
  telefone?: string | null
  statusEnvio: 'sucesso' | 'erro'
  erro?: string | null
  httpStatus?: number | null
  payloadEntrada: Record<string, unknown>
  payloadUazapi?: Record<string, unknown> | null
  respostaUazapi?: Record<string, unknown> | null
}) {
  await supabaseAdmin.schema(SCHEMA).from('mensagem_logs').insert({
    fluxo: input.fluxo,
    usuario_id: input.usuarioId || null,
    nome_vendedor: input.nomeVendedor || null,
    cliente_nome: input.clienteNome || null,
    contato: input.contato || null,
    telefone: input.telefone || null,
    status_envio: input.statusEnvio,
    erro: input.erro || null,
    http_status: input.httpStatus || null,
    payload_entrada: input.payloadEntrada,
    payload_uazapi: input.payloadUazapi || {},
    resposta_uazapi: input.respostaUazapi || {},
  })
}

function getSaoPauloDayRange() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const date = formatter.format(new Date())

  return {
    start: `${date}T00:00:00-03:00`,
    end: `${date}T23:59:59.999-03:00`,
  }
}

export async function loadRelatorioMensagemDia(usuarioId: string) {
  const { start, end } = getSaoPauloDayRange()

  const { data, error } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_logs')
    .select(
      'id, fluxo, status_envio, nome_vendedor, cliente_nome, contato, telefone, http_status, erro, payload_entrada, payload_uazapi, created_at'
    )
    .eq('usuario_id', usuarioId)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data || []).map((item) => {
    const payloadEntrada =
      typeof item.payload_entrada === 'object' && item.payload_entrada !== null
        ? (item.payload_entrada as Record<string, unknown>)
        : {}
    const payloadUazapi =
      typeof item.payload_uazapi === 'object' && item.payload_uazapi !== null
        ? (item.payload_uazapi as Record<string, unknown>)
        : {}

    return {
      id: String(item.id),
      fluxo: String(item.fluxo || ''),
      status_envio: String(item.status_envio || ''),
      nome_vendedor: item.nome_vendedor ? String(item.nome_vendedor) : null,
      cliente_nome: item.cliente_nome ? String(item.cliente_nome) : null,
      contato: item.contato ? String(item.contato) : null,
      telefone: item.telefone ? String(item.telefone) : null,
      http_status: typeof item.http_status === 'number' ? item.http_status : null,
      erro: item.erro ? String(item.erro) : null,
      mensagem: String(payloadEntrada.mensagem || payloadUazapi.text || ''),
      created_at: String(item.created_at || ''),
    } satisfies RelatorioMensagemDia
  })
}

export async function handleMensagemWebhook(fluxo: FluxoMensagemKey, payload: unknown) {
  const items = parseItems(payload)
  const payloadObject = parseObject(payload)

  if (!items.length) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Nenhum item válido foi enviado no payload.' },
    }
  }

  const { configuracao, cliente } = await resolveConfiguracaoDestino(items[0] || payloadObject)

  if (!configuracao) {
    await registrarLogMensagem({
      fluxo,
      statusEnvio: 'erro',
      erro: 'Configuração de mensagem do vendedor não encontrada.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 404,
      body: { error: 'Configuração de mensagem do vendedor não encontrada.' },
    }
  }

  if (configuracao.ativo === false) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      telefone: cliente?.whatsapp || null,
      statusEnvio: 'erro',
      erro: 'Configuração de mensagem do vendedor está inativa.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'Configuração de mensagem inativa para este vendedor.' },
    }
  }

  if (cliente && cliente.cliente_desbloqueado_regua !== true) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente.razao_social,
      telefone: cliente.whatsapp,
      statusEnvio: 'erro',
      erro: 'Cliente bloqueado para cobrança pela régua.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'Cliente bloqueado para cobrança.' },
    }
  }

  if (cliente && cliente.em_negociacao === true) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente.razao_social,
      telefone: cliente.whatsapp,
      statusEnvio: 'erro',
      erro: 'Cliente em negociação ativa.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'Cliente em negociação ativa.' },
    }
  }

  if (!configuracao.uazapi_instance || !configuracao.uazapi_token) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      telefone: cliente?.whatsapp || null,
      statusEnvio: 'erro',
      erro: 'Server URL ou token da Uazapi não configurados.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'Server URL ou token da Uazapi não configurados.' },
    }
  }

  const sendUrl = buildUazapiSendUrl(configuracao.uazapi_instance)
  const resultados: Array<Record<string, unknown>> = []
  let sucesso = 0
  let erro = 0

  for (const item of items) {
    const clienteItem = await resolveClienteMensagem(item)
    const telefone = resolveTelefoneMensagem({
      ...item,
      whatsapp:
        item.numero_destino || item.whatsapp || item.chatid || clienteItem?.whatsapp || '',
    })
    const mensagem = resolveMensagemPronta(item)

    if (!telefone || !mensagem) {
      erro += 1

      await registrarLogMensagem({
        fluxo,
        usuarioId: configuracao.usuario_id,
        nomeVendedor: configuracao.nome_vendedor,
        clienteNome: clienteItem?.razao_social || null,
        contato: String(item.contato || ''),
        telefone: telefone || null,
        statusEnvio: 'erro',
        erro: !telefone
          ? 'Telefone de destino não informado no payload.'
          : 'Mensagem pronta não foi enviada no payload.',
        payloadEntrada: item,
      })

      resultados.push({
        ok: false,
        telefone: telefone || null,
        erro: !telefone
          ? 'Telefone de destino não informado no payload.'
          : 'Mensagem pronta não foi enviada no payload.',
      })
      continue
    }

    const payloadUazapi = {
      number: telefone,
      text: mensagem,
    }

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: configuracao.uazapi_token,
      },
      body: JSON.stringify(payloadUazapi),
    })

    let respostaUazapi: Record<string, unknown> = {}
    try {
      respostaUazapi = (await response.json()) as Record<string, unknown>
    } catch {
      respostaUazapi = {}
    }

    if (!response.ok) {
      erro += 1

      await registrarLogMensagem({
        fluxo,
        usuarioId: configuracao.usuario_id,
        nomeVendedor: configuracao.nome_vendedor,
        clienteNome: clienteItem?.razao_social || null,
        contato: String(item.contato || ''),
        telefone,
        statusEnvio: 'erro',
        erro: String(
          respostaUazapi.message || respostaUazapi.error || 'Erro ao enviar pela Uazapi.'
        ),
        httpStatus: response.status,
        payloadEntrada: item,
        payloadUazapi,
        respostaUazapi,
      })

      resultados.push({
        ok: false,
        telefone,
        erro: 'Erro ao enviar mensagem pela Uazapi.',
        detalhe: respostaUazapi,
      })
      continue
    }

    sucesso += 1

    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: clienteItem?.razao_social || null,
      contato: String(item.contato || ''),
      telefone,
      statusEnvio: 'sucesso',
      httpStatus: response.status,
      payloadEntrada: item,
      payloadUazapi,
      respostaUazapi,
    })

    resultados.push({
      ok: true,
      telefone,
      mensagem,
      resposta_uazapi: respostaUazapi,
    })
  }

  if (!sucesso) {
    return {
      ok: false,
      status: 502,
      body: {
        error: 'Nenhuma mensagem foi enviada com sucesso.',
        fluxo,
        sucesso,
        erro,
        resultados,
      },
    }
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      fluxo,
      sucesso,
      erro,
      resultados,
    },
  }
}
