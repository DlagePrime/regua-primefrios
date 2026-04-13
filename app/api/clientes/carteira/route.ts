import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Etapa = 'dia_vencimento' | 'vencido_3_mais' | 'vencido_6_mais' | 'fora_regua'

type Perfil = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
}

type ClienteBase = {
  id: string
  razao_social: string | null
  nome_fantasia: string | null
  cnpj_cpf: string | null
  whatsapp: string | null
  contato: string | null
  nome_vendedor_padrao_snapshot: string | null
  cliente_desbloqueado_regua: boolean | null
  em_negociacao: boolean | null
}

type ClientePayload = ClienteBase & {
  ultima_negociacao_status: string | null
  ultima_negociacao_valor_divida: number
  ultima_negociacao_quantidade_parcelas: number
  ultima_negociacao_frequencia: string | null
  ultima_negociacao_observacoes: string | null
  tem_titulo: boolean
  qtd_titulos_vencidos: number
  valor_total_titulos_vencidos: number
  valor_total_a_vencer: number
  max_dias_atraso: number
  etapa_regua: Etapa
}

function parsePayload(payload: unknown) {
  if (!payload) return null
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  return typeof payload === 'object' ? payload : null
}

function parseMoney(value?: string | number | null) {
  if (!value) return 0

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Number(
    value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  )

  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDoc(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function parseDate(value?: string | null) {
  if (!value) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(`${value.slice(0, 10)}T00:00:00`)
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/')
    return new Date(`${year}-${month}-${day}T00:00:00`)
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysLate(value?: string | null) {
  const date = parseDate(value)
  if (!date) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  return Math.floor((today.getTime() - date.getTime()) / 86400000)
}

function titulos(payload: unknown) {
  const data = parsePayload(payload) as { titulos?: Array<Record<string, unknown>> } | null
  if (!data?.titulos) return []

  return data.titulos.map((titulo, index) => ({
    id: `${String(titulo.doc || 'sem-doc')}-${index}`,
    doc: String(titulo.doc || ''),
    status: String(titulo.status || ''),
    parcela: String(titulo.parcela || ''),
    emissao: String(titulo.emissao || ''),
    vencimento: String(titulo.vencimento || ''),
    valor_fatura: String(titulo.valor_fatura || ''),
  }))
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessao invalida.' }, { status: 401 })
    }

    const { data: perfilData, error: perfilErr } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, email, nome, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single<Perfil>()

    if (perfilErr || !perfilData || perfilData.ativo !== true) {
      return NextResponse.json({ error: 'Usuario sem acesso.' }, { status: 403 })
    }

    const { data: baseRegua, error: baseErr } = await supabaseAdmin
      .schema('omie_core')
      .from('regua_dia_vencimento')
      .select('cnpj_cpf, data_vencimento, valor_documento')
      .not('cnpj_cpf', 'is', null)

    if (baseErr) {
      return NextResponse.json(
        { error: baseErr.message || 'Erro ao carregar regua.' },
        { status: 400 }
      )
    }

    const { data: meta, error: metaErr } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_meta')
      .select('id, cnpj_cpf, payload_json')
      .order('id', { ascending: false })

    if (metaErr) {
      return NextResponse.json(
        { error: metaErr.message || 'Erro ao carregar clientes_meta.' },
        { status: 400 }
      )
    }

    const { data: negociacoesResumo, error: negociacoesError } = await supabaseAdmin
      .schema('omie_core')
      .from('vw_clientes_negociacoes_resumo')
      .select(
        'cnpj_cpf, status_negociacao, valor_total_divida, quantidade_parcelas, frequencia, observacoes, created_at'
      )
      .order('created_at', { ascending: false })

    if (negociacoesError) {
      return NextResponse.json(
        { error: negociacoesError.message || 'Erro ao carregar negociacoes.' },
        { status: 400 }
      )
    }

    let clientesQuery = supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select(
        'id, razao_social, nome_fantasia, cnpj_cpf, whatsapp, contato, nome_vendedor_padrao_snapshot, cliente_desbloqueado_regua, em_negociacao'
      )

    if (perfilData.perfil !== 'master') {
      clientesQuery = clientesQuery.eq(
        'nome_vendedor_padrao_snapshot',
        perfilData.nome_vendedor || ''
      )
    }

    const { data: rows, error: cliErr } = await clientesQuery
      .order('razao_social', { ascending: true })
      .returns<ClienteBase[]>()

    if (cliErr) {
      return NextResponse.json(
        { error: cliErr.message || 'Erro ao carregar clientes.' },
        { status: 400 }
      )
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const comTitulo = new Set(
      (baseRegua || []).map((item) => normalizeDoc(item.cnpj_cpf)).filter(Boolean)
    )
    const hojeSet = new Set(
      (baseRegua || [])
        .filter((item) => {
          const date = parseDate(item.data_vencimento)
          if (!date) return false
          date.setHours(0, 0, 0, 0)
          return date.getTime() === today.getTime()
        })
        .map((item) => normalizeDoc(item.cnpj_cpf))
        .filter(Boolean)
    )

    const mapaAVencer = new Map<string, number>()
    for (const item of baseRegua || []) {
      const cnpj = normalizeDoc(item.cnpj_cpf)
      if (!cnpj) continue
      mapaAVencer.set(cnpj, (mapaAVencer.get(cnpj) || 0) + parseMoney(item.valor_documento))
    }

    const mapaNegociacao = new Map<
      string,
      {
        status: string | null
        valor: number
        quantidade: number
        frequencia: string | null
        observacoes: string | null
      }
    >()

    for (const item of negociacoesResumo || []) {
      const cnpj = normalizeDoc(item.cnpj_cpf)
      if (!cnpj || mapaNegociacao.has(cnpj)) continue

      mapaNegociacao.set(cnpj, {
        status: item.status_negociacao || null,
        valor: Number(item.valor_total_divida || 0),
        quantidade: Number(item.quantidade_parcelas || 0),
        frequencia: item.frequencia || null,
        observacoes: item.observacoes || null,
      })
    }

    const mapaVencidos = new Map<string, { qtd: number; total: number; atraso: number }>()
    let totalVencidoFonte = 0
    let inadimplentesFonte = 0

    for (const item of meta || []) {
      const cnpj = normalizeDoc(item.cnpj_cpf)
      if (!cnpj || mapaVencidos.has(cnpj)) continue

      const lista = titulos(item.payload_json)
      const total = lista.reduce((sum, titulo) => sum + parseMoney(titulo.valor_fatura), 0)

      mapaVencidos.set(cnpj, {
        qtd: lista.length,
        total,
        atraso: lista.reduce(
          (max, titulo) => Math.max(max, daysLate(titulo.vencimento)),
          0
        ),
      })

      if (lista.length > 0) {
        inadimplentesFonte += 1
        totalVencidoFonte += total
      }
    }

    const clientes = (rows || []).map<ClientePayload>((cliente) => {
      const cnpjNormalizado = normalizeDoc(cliente.cnpj_cpf)
      const resumo = mapaVencidos.get(cnpjNormalizado)
      const negociacaoInfo = mapaNegociacao.get(cnpjNormalizado)
      const emNegociacaoAtiva = negociacaoInfo?.status === 'ativa'
      const temHistoricoNegociacao = Boolean(
        negociacaoInfo &&
          (negociacaoInfo.valor > 0 ||
            negociacaoInfo.quantidade > 0 ||
            negociacaoInfo.status === 'inadimplente' ||
            negociacaoInfo.status === 'ativa')
      )
      const atraso = resumo?.atraso || 0
      const etapa: Etapa =
        atraso >= 6
          ? 'vencido_6_mais'
          : atraso >= 3
            ? 'vencido_3_mais'
            : cnpjNormalizado && (hojeSet.has(cnpjNormalizado) || comTitulo.has(cnpjNormalizado))
              ? 'dia_vencimento'
              : 'fora_regua'

      return {
        ...cliente,
        em_negociacao: emNegociacaoAtiva,
        ultima_negociacao_status: temHistoricoNegociacao
          ? negociacaoInfo?.status || null
          : null,
        ultima_negociacao_valor_divida: temHistoricoNegociacao
          ? negociacaoInfo?.valor || 0
          : 0,
        ultima_negociacao_quantidade_parcelas: temHistoricoNegociacao
          ? negociacaoInfo?.quantidade || 0
          : 0,
        ultima_negociacao_frequencia: temHistoricoNegociacao
          ? negociacaoInfo?.frequencia || null
          : null,
        ultima_negociacao_observacoes: temHistoricoNegociacao
          ? negociacaoInfo?.observacoes || null
          : null,
        tem_titulo: !!cnpjNormalizado && comTitulo.has(cnpjNormalizado),
        qtd_titulos_vencidos: resumo?.qtd || 0,
        valor_total_titulos_vencidos: resumo?.total || 0,
        valor_total_a_vencer: mapaAVencer.get(cnpjNormalizado) || 0,
        max_dias_atraso: atraso,
        etapa_regua: etapa,
      }
    })

    const resumoVencidosFonte =
      perfilData.perfil === 'master'
        ? {
            total: totalVencidoFonte,
            inadimplentes: inadimplentesFonte,
          }
        : {
            total: clientes.reduce(
              (sum, cliente) => sum + (cliente.valor_total_titulos_vencidos || 0),
              0
            ),
            inadimplentes: clientes.filter(
              (cliente) => (cliente.qtd_titulos_vencidos || 0) > 0
            ).length,
          }

    const atualizadoEm = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())

    return NextResponse.json({
      ok: true,
      perfil: perfilData,
      clientes,
      resumoVencidosFonte,
      status: `Carteira carregada: ${clientes.length} clientes · Atualizado às ${atualizadoEm}`,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao carregar carteira.' },
      { status: 500 }
    )
  }
}
