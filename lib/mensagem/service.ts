import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  FLUXOS_MENSAGEM,
  FluxoMensagemKey,
  TemplateMensagem,
  getTemplatesMensagemDefault,
} from '@/lib/mensagem/config'
import { renderMensagemTemplate, resolveTelefoneMensagem } from '@/lib/mensagem/template'

const SCHEMA = 'omie_core'

type ConfiguracaoMensagemRow = {
  usuario_id: string
  nome_vendedor: string | null
  uazapi_instance: string | null
  uazapi_token: string | null
  ativo: boolean | null
}

type TemplateMensagemRow = {
  usuario_id: string
  fluxo: FluxoMensagemKey
  nome_template: string | null
  conteudo: string | null
  ativo: boolean | null
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
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
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

  const { data: templatesData, error: templatesError } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_templates')
    .select('usuario_id, fluxo, nome_template, conteudo, ativo')
    .eq('usuario_id', usuarioId)
    .returns<TemplateMensagemRow[]>()

  if (templatesError) {
    throw templatesError
  }

  const defaults = getTemplatesMensagemDefault()
  const templates: TemplateMensagem[] = defaults.map((defaultTemplate) => {
    const saved = (templatesData || []).find((item) => item.fluxo === defaultTemplate.fluxo)

    return {
      fluxo: defaultTemplate.fluxo,
      nome_template: saved?.nome_template?.trim() || defaultTemplate.nome_template,
      conteudo: saved?.conteudo?.trim() || defaultTemplate.conteudo,
      variaveis:
        FLUXOS_MENSAGEM.find((fluxo) => fluxo.key === defaultTemplate.fluxo)?.variaveis || [],
    }
  })

  return {
    configuracao: {
      uazapi_server_url: configuracao?.uazapi_instance || '',
      uazapi_token: configuracao?.uazapi_token || '',
      ativo: configuracao?.ativo !== false,
      nome_vendedor: configuracao?.nome_vendedor || null,
    },
    templates,
  }
}

export async function saveMensagemConfiguracao(input: {
  usuarioId: string
  nomeVendedor: string | null
  uazapiServerUrl: string
  uazapiToken: string
  ativo: boolean
  templates: TemplateMensagem[]
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

  const rows = input.templates.map((template) => ({
    usuario_id: input.usuarioId,
    fluxo: template.fluxo,
    nome_template: template.nome_template.trim(),
    conteudo: template.conteudo.trim(),
    ativo: true,
  }))

  const { error: templateError } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_templates')
    .upsert(rows, { onConflict: 'usuario_id,fluxo' })

  if (templateError) {
    throw templateError
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

async function loadTemplateByUsuario(usuarioId: string, fluxo: FluxoMensagemKey) {
  const { data } = await supabaseAdmin
    .schema(SCHEMA)
    .from('mensagem_templates')
    .select('usuario_id, fluxo, nome_template, conteudo, ativo')
    .eq('usuario_id', usuarioId)
    .eq('fluxo', fluxo)
    .maybeSingle<TemplateMensagemRow>()

  return data || null
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

export async function handleMensagemWebhook(fluxo: FluxoMensagemKey, payload: unknown) {
  const payloadObject = parseObject(payload)
  const { configuracao, cliente } = await resolveConfiguracaoDestino(payloadObject)

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

  const template = await loadTemplateByUsuario(configuracao.usuario_id, fluxo)
  if (!template?.conteudo?.trim()) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      telefone: cliente?.whatsapp || null,
      statusEnvio: 'erro',
      erro: 'Template do fluxo não configurado.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'Template do fluxo não configurado para este vendedor.' },
    }
  }

  const telefone = resolveTelefoneMensagem({
    ...payloadObject,
    whatsapp: payloadObject.whatsapp || cliente?.whatsapp || '',
  })

  if (!telefone) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      statusEnvio: 'erro',
      erro: 'Telefone de destino não informado no payload.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 400,
      body: { error: 'Telefone de destino não informado.' },
    }
  }

  if (!configuracao.uazapi_instance || !configuracao.uazapi_token) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      telefone,
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

  const mensagem = renderMensagemTemplate(template.conteudo, payloadObject).trim()
  if (!mensagem) {
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      telefone,
      statusEnvio: 'erro',
      erro: 'Mensagem final ficou vazia após aplicar o template.',
      payloadEntrada: payloadObject,
    })

    return {
      ok: false,
      status: 409,
      body: { error: 'A mensagem final ficou vazia.' },
    }
  }

  const sendUrl = buildUazapiSendUrl(configuracao.uazapi_instance)
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
    await registrarLogMensagem({
      fluxo,
      usuarioId: configuracao.usuario_id,
      nomeVendedor: configuracao.nome_vendedor,
      clienteNome: cliente?.razao_social || null,
      contato: String(payloadObject.contato || ''),
      telefone,
      statusEnvio: 'erro',
      erro: String(respostaUazapi.message || respostaUazapi.error || 'Erro ao enviar pela Uazapi.'),
      httpStatus: response.status,
      payloadEntrada: payloadObject,
      payloadUazapi,
      respostaUazapi,
    })

    return {
      ok: false,
      status: 502,
      body: { error: 'Erro ao enviar mensagem pela Uazapi.', detalhe: respostaUazapi },
    }
  }

  await registrarLogMensagem({
    fluxo,
    usuarioId: configuracao.usuario_id,
    nomeVendedor: configuracao.nome_vendedor,
    clienteNome: cliente?.razao_social || null,
    contato: String(payloadObject.contato || ''),
    telefone,
    statusEnvio: 'sucesso',
    httpStatus: response.status,
    payloadEntrada: payloadObject,
    payloadUazapi,
    respostaUazapi,
  })

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      fluxo,
      telefone,
      mensagem,
      resposta_uazapi: respostaUazapi,
    },
  }
}
