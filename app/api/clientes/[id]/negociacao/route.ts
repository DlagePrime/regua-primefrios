import { NextResponse } from 'next/server'
import { requireMasterUser } from '@/lib/supabase/require-master'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Params = {
  params: Promise<{
    id: string
  }>
}

type Frequencia = 'semanal' | 'quinzenal' | 'mensal'
type DiaSemana =
  | 'domingo'
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'

const diaSemanaMap: Record<DiaSemana, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function parseCurrency(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? roundMoney(value) : 0
  }

  const parsed = Number(
    String(value || '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  )

  return Number.isFinite(parsed) ? roundMoney(parsed) : 0
}

function parseOptionalCurrency(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const parsed = parseCurrency(normalized)
  return parsed > 0 ? parsed : NaN
}

function parseDate(value: string | null | undefined) {
  if (!value) return null

  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function nextWeekdayOnOrAfter(start: Date, targetWeekday: number) {
  const date = new Date(start)
  date.setHours(0, 0, 0, 0)
  const diff = (targetWeekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + diff)
  return date
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function nextMonthlyDate(previous: Date, targetWeekday: number) {
  let year = previous.getFullYear()
  let month = previous.getMonth() + 1

  if (month > 11) {
    month = 0
    year += 1
  }

  const anchorDay = Math.min(previous.getDate(), daysInMonth(year, month))
  const seed = new Date(year, month, anchorDay)
  seed.setHours(0, 0, 0, 0)

  const candidate = new Date(seed)
  const diff = (targetWeekday - candidate.getDay() + 7) % 7
  candidate.setDate(candidate.getDate() + diff)

  if (candidate.getMonth() === month) {
    return candidate
  }

  const lastDay = new Date(year, month, daysInMonth(year, month))
  const fallback = new Date(lastDay)
  while (fallback.getDay() !== targetWeekday) {
    fallback.setDate(fallback.getDate() - 1)
  }

  return fallback
}

function buildParcelas(
  totalDivida: number,
  quantidadeParcelas: number,
  frequencia: Frequencia,
  diaSemana: DiaSemana,
  dataInicio: Date,
  valorParcelaFixa?: number | null
) {
  const targetWeekday = diaSemanaMap[diaSemana]
  const primeiraData = nextWeekdayOnOrAfter(dataInicio, targetWeekday)
  const parcelas = []
  let vencimento = primeiraData
  const quantidadesParcelasGeradas =
    valorParcelaFixa && valorParcelaFixa > 0
      ? quantidadeParcelas +
        (roundMoney(totalDivida - roundMoney(valorParcelaFixa * quantidadeParcelas)) > 0
          ? 1
          : 0)
      : quantidadeParcelas

  const valorBase =
    valorParcelaFixa && valorParcelaFixa > 0
      ? roundMoney(valorParcelaFixa)
      : roundMoney(totalDivida / quantidadeParcelas)
  const totalBase = roundMoney(valorBase * quantidadeParcelas)
  const ajusteFinal = roundMoney(totalDivida - totalBase)

  for (let index = 0; index < quantidadesParcelasGeradas; index += 1) {
    if (index > 0) {
      if (frequencia === 'semanal') {
        const next = new Date(vencimento)
        next.setDate(next.getDate() + 7)
        vencimento = next
      } else if (frequencia === 'quinzenal') {
        const next = new Date(vencimento)
        next.setDate(next.getDate() + 14)
        vencimento = next
      } else {
        vencimento = nextMonthlyDate(vencimento, targetWeekday)
      }
    }

    parcelas.push({
      numero_parcela: index + 1,
      vencimento: toDateOnly(vencimento),
      valor_parcela: (() => {
        if (valorParcelaFixa && valorParcelaFixa > 0) {
          return index < quantidadeParcelas ? valorBase : ajusteFinal
        }

        return index === quantidadeParcelas - 1
          ? roundMoney(valorBase + ajusteFinal)
          : valorBase
      })(),
      status_parcela: 'pendente',
    })
  }

  return parcelas
}

async function loadResumoAndParcelas(negociacaoId: string) {
  const { data: resumo, error: resumoError } = await supabaseAdmin
    .schema('omie_core')
    .from('vw_clientes_negociacoes_resumo')
    .select(
      'negociacao_id, cnpj_cpf, razao_social, frequencia, quantidade_parcelas, valor_total_divida, data_inicio, data_quitacao_prevista, status_negociacao, observacoes, total_parcelas, parcelas_pagas, parcelas_pendentes, parcelas_vencidas, parcelas_canceladas, valor_total_parcelas, valor_total_pago, proximo_vencimento'
    )
    .eq('negociacao_id', negociacaoId)
    .maybeSingle()

  if (resumoError) {
    return {
      error: resumoError.message || 'Erro ao carregar resumo da negociacao.',
    }
  }

  const { data: parcelas, error: parcelasError } = await supabaseAdmin
    .schema('omie_core')
    .from('clientes_negociacoes_parcelas')
    .select(
      'id, negociacao_id, numero_parcela, vencimento, valor_parcela, status_parcela, pago_em, valor_pago'
    )
    .eq('negociacao_id', negociacaoId)
    .order('numero_parcela', { ascending: true })

  if (parcelasError) {
    return {
      error: parcelasError.message || 'Erro ao carregar parcelas da negociacao.',
    }
  }

  return {
    resumo,
    parcelas: parcelas || [],
  }
}

export async function POST(request: Request, context: Params) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Cliente invalido.' }, { status: 400 })
    }

    const body = await request.json()
    const frequencia = String(body.frequencia || '').trim() as Frequencia
    const quantidadeParcelas = Number(body.quantidade_parcelas || 0)
    const valorTotalDivida = parseCurrency(body.valor_total_divida)
    const valorParcela = parseOptionalCurrency(body.valor_parcela)
    const diaSemana = String(body.dia_semana || '').trim() as DiaSemana
    const observacoes = String(body.observacoes || '').trim() || null
    const dataInicio =
      parseDate(String(body.data_inicio || '').trim()) ||
      new Date(new Date().toISOString().slice(0, 10))

    if (!['semanal', 'quinzenal', 'mensal'].includes(frequencia)) {
      return NextResponse.json({ error: 'Frequencia invalida.' }, { status: 400 })
    }

    if (
      !['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].includes(
        diaSemana
      )
    ) {
      return NextResponse.json({ error: 'Dia da semana invalido.' }, { status: 400 })
    }

    if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas <= 0) {
      return NextResponse.json(
        { error: 'Informe uma quantidade de parcelas valida.' },
        { status: 400 }
      )
    }

    if (valorTotalDivida <= 0) {
      return NextResponse.json(
        { error: 'Informe um valor total de divida valido.' },
        { status: 400 }
      )
    }

    if (Number.isNaN(valorParcela)) {
      return NextResponse.json(
        { error: 'Informe um valor de parcela valido.' },
        { status: 400 }
      )
    }

    if (
      valorParcela &&
      roundMoney(valorParcela * quantidadeParcelas) > roundMoney(valorTotalDivida)
    ) {
      return NextResponse.json(
        {
          error:
            'O valor da parcela multiplicado pela quantidade nao pode ultrapassar o total da divida.',
        },
        { status: 400 }
      )
    }

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, cnpj_cpf, razao_social')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    if (!cliente.cnpj_cpf || !cliente.razao_social) {
      return NextResponse.json(
        { error: 'Cliente sem dados basicos para negociacao.' },
        { status: 400 }
      )
    }

    const { data: negociacaoAtiva, error: ativaError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes')
      .select('id')
      .eq('cnpj_cpf', cliente.cnpj_cpf)
      .eq('status_negociacao', 'ativa')
      .maybeSingle()

    if (ativaError) {
      return NextResponse.json(
        { error: ativaError.message || 'Erro ao validar negociacao ativa.' },
        { status: 400 }
      )
    }

    if (negociacaoAtiva) {
      return NextResponse.json(
        { error: 'Este cliente ja esta em negociacao ativa.' },
        { status: 400 }
      )
    }

    const parcelas = buildParcelas(
      valorTotalDivida,
      quantidadeParcelas,
      frequencia,
      diaSemana,
      dataInicio,
      valorParcela
    )

    const { data: negociacao, error: negociacaoError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes')
      .insert({
        cliente_id: cliente.id,
        cnpj_cpf: cliente.cnpj_cpf,
        razao_social: cliente.razao_social,
        frequencia,
        quantidade_parcelas: parcelas.length,
        valor_total_divida: valorTotalDivida,
        data_inicio: toDateOnly(dataInicio),
        data_quitacao_prevista: parcelas[parcelas.length - 1]?.vencimento || null,
        status_negociacao: 'ativa',
        observacoes,
      })
      .select(
        'id, cnpj_cpf, razao_social, frequencia, quantidade_parcelas, valor_total_divida, data_inicio, data_quitacao_prevista, status_negociacao, observacoes'
      )
      .single()

    if (negociacaoError || !negociacao) {
      return NextResponse.json(
        { error: negociacaoError?.message || 'Erro ao criar negociacao.' },
        { status: 400 }
      )
    }

    const parcelasPayload = parcelas.map((parcela) => ({
      negociacao_id: negociacao.id,
      cliente_id: cliente.id,
      cnpj_cpf: cliente.cnpj_cpf,
      ...parcela,
    }))

    const { error: parcelasError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes_parcelas')
      .insert(parcelasPayload)

    if (parcelasError) {
      await supabaseAdmin
        .schema('omie_core')
        .from('clientes_negociacoes')
        .delete()
        .eq('id', negociacao.id)

      return NextResponse.json(
        { error: parcelasError.message || 'Erro ao criar parcelas da negociacao.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      negociacao,
      parcelas: parcelasPayload,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao criar negociacao.' },
      { status: 500 }
    )
  }
}

export async function GET(_: Request, context: Params) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Cliente invalido.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessao invalida.' }, { status: 401 })
    }

    const { data: perfil, error: perfilError } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil || perfil.ativo !== true) {
      return NextResponse.json({ error: 'Usuario sem acesso.' }, { status: 403 })
    }

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, cnpj_cpf, razao_social, nome_vendedor_padrao_snapshot, em_negociacao')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    if (
      perfil.perfil !== 'master' &&
      (perfil.nome_vendedor || '').trim() !==
        (cliente.nome_vendedor_padrao_snapshot || '').trim()
    ) {
      return NextResponse.json(
        { error: 'Voce nao pode visualizar a negociacao deste cliente.' },
        { status: 403 }
      )
    }

    let { data: negociacao, error: negociacaoError } = await supabaseAdmin
      .schema('omie_core')
      .from('vw_clientes_negociacoes_resumo')
      .select(
        'negociacao_id, cnpj_cpf, razao_social, frequencia, quantidade_parcelas, valor_total_divida, data_inicio, data_quitacao_prevista, status_negociacao, observacoes, created_at, updated_at, total_parcelas, parcelas_pagas, parcelas_pendentes, parcelas_vencidas, parcelas_canceladas, valor_total_parcelas, valor_total_pago, proximo_vencimento'
      )
      .eq('cnpj_cpf', cliente.cnpj_cpf)
      .eq('status_negociacao', 'ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (negociacaoError) {
      return NextResponse.json(
        { error: negociacaoError.message || 'Erro ao carregar negociacao.' },
        { status: 400 }
      )
    }

    if (!negociacao) {
      const ultimaNegociacao = await supabaseAdmin
        .schema('omie_core')
        .from('vw_clientes_negociacoes_resumo')
        .select(
          'negociacao_id, cnpj_cpf, razao_social, frequencia, quantidade_parcelas, valor_total_divida, data_inicio, data_quitacao_prevista, status_negociacao, observacoes, created_at, updated_at, total_parcelas, parcelas_pagas, parcelas_pendentes, parcelas_vencidas, parcelas_canceladas, valor_total_parcelas, valor_total_pago, proximo_vencimento'
        )
        .eq('cnpj_cpf', cliente.cnpj_cpf)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      negociacao = ultimaNegociacao.data
      negociacaoError = ultimaNegociacao.error
    }

    if (negociacaoError) {
      return NextResponse.json(
        { error: negociacaoError.message || 'Erro ao carregar negociacao.' },
        { status: 400 }
      )
    }

    if (!negociacao) {
      return NextResponse.json(
        { error: 'Nenhuma negociacao encontrada para este cliente.' },
        { status: 404 }
      )
    }

    const { data: parcelas, error: parcelasError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes_parcelas')
      .select(
        'id, negociacao_id, numero_parcela, vencimento, valor_parcela, status_parcela, pago_em, valor_pago, created_at, updated_at'
      )
      .eq('negociacao_id', negociacao.negociacao_id)
      .order('numero_parcela', { ascending: true })

    if (parcelasError) {
      return NextResponse.json(
        { error: parcelasError.message || 'Erro ao carregar parcelas.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      cliente,
      negociacao,
      parcelas: parcelas || [],
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao carregar negociacao.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Cliente invalido.' }, { status: 400 })
    }

    const body = await request.json()
    const acao = String(body.acao || 'finalizar').trim()
    const statusNegociacao = String(body.status_negociacao || '').trim()

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, cnpj_cpf')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente nao encontrado.' }, { status: 404 })
    }

    if (acao === 'retomar') {
      const frequencia = String(body.frequencia || '').trim() as Frequencia
      const quantidadeParcelas = Number(body.quantidade_parcelas || 0)
      const valorTotalDivida = parseCurrency(body.valor_total_divida)
      const valorParcela = parseOptionalCurrency(body.valor_parcela)
      const diaSemana = String(body.dia_semana || '').trim() as DiaSemana
      const observacoes = String(body.observacoes || '').trim() || null
      const dataInicio =
        parseDate(String(body.data_inicio || '').trim()) ||
        new Date(new Date().toISOString().slice(0, 10))

      if (!['semanal', 'quinzenal', 'mensal'].includes(frequencia)) {
        return NextResponse.json({ error: 'Frequencia invalida.' }, { status: 400 })
      }

      if (
        !['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].includes(
          diaSemana
        )
      ) {
        return NextResponse.json({ error: 'Dia da semana invalido.' }, { status: 400 })
      }

      if (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas <= 0) {
        return NextResponse.json(
          { error: 'Informe uma quantidade de parcelas valida.' },
          { status: 400 }
        )
      }

      if (valorTotalDivida <= 0) {
        return NextResponse.json(
          { error: 'Informe um valor total de divida valido.' },
          { status: 400 }
        )
      }

      if (Number.isNaN(valorParcela)) {
        return NextResponse.json(
          { error: 'Informe um valor de parcela valido.' },
          { status: 400 }
        )
      }

      if (
        valorParcela &&
        roundMoney(valorParcela * quantidadeParcelas) > roundMoney(valorTotalDivida)
      ) {
        return NextResponse.json(
          {
            error:
              'O valor da parcela multiplicado pela quantidade nao pode ultrapassar o total da divida.',
          },
          { status: 400 }
        )
      }

      const { data: negociacaoInadimplente, error: negociacaoInadimplenteError } =
        await supabaseAdmin
          .schema('omie_core')
          .from('clientes_negociacoes')
          .select('id')
          .eq('cliente_id', cliente.id)
          .eq('status_negociacao', 'inadimplente')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

      if (negociacaoInadimplenteError || !negociacaoInadimplente) {
        return NextResponse.json(
          {
            error:
              negociacaoInadimplenteError?.message ||
              'Negociacao inadimplente nao encontrada.',
          },
          { status: 404 }
        )
      }

      const { data: parcelasAtuais, error: parcelasAtuaisError } = await supabaseAdmin
        .schema('omie_core')
        .from('clientes_negociacoes_parcelas')
        .select(
          'id, numero_parcela, valor_parcela, valor_pago, status_parcela, vencimento, pago_em'
        )
        .eq('negociacao_id', negociacaoInadimplente.id)
        .order('numero_parcela', { ascending: true })

      if (parcelasAtuaisError) {
        return NextResponse.json(
          { error: parcelasAtuaisError.message || 'Erro ao carregar parcelas atuais.' },
          { status: 400 }
        )
      }

      const parcelasPagas = (parcelasAtuais || []).filter(
        (parcela) => parcela.status_parcela === 'paga'
      )
      const parcelasNaoPagas = (parcelasAtuais || []).filter(
        (parcela) => parcela.status_parcela !== 'paga'
      )
      const parcelasRecalculadas = buildParcelas(
        valorTotalDivida,
        quantidadeParcelas,
        frequencia,
        diaSemana,
        dataInicio,
        valorParcela
      ).map((parcela, index) => ({
        ...parcela,
        numero_parcela: parcelasPagas.length + index + 1,
      }))

      const { error: updateNegociacaoError } = await supabaseAdmin
        .schema('omie_core')
        .from('clientes_negociacoes')
        .update({
          frequencia,
          quantidade_parcelas: parcelasPagas.length + parcelasRecalculadas.length,
          valor_total_divida: valorTotalDivida,
          data_inicio: toDateOnly(dataInicio),
          data_quitacao_prevista:
            parcelasRecalculadas[parcelasRecalculadas.length - 1]?.vencimento ||
            parcelasPagas[parcelasPagas.length - 1]?.vencimento ||
            null,
          status_negociacao: 'ativa',
          observacoes,
        })
        .eq('id', negociacaoInadimplente.id)

      if (updateNegociacaoError) {
        return NextResponse.json(
          { error: updateNegociacaoError.message || 'Erro ao retomar negociacao.' },
          { status: 400 }
        )
      }

      if (parcelasNaoPagas.length > 0) {
        const { error: deleteParcelasError } = await supabaseAdmin
          .schema('omie_core')
          .from('clientes_negociacoes_parcelas')
          .delete()
          .in(
            'id',
            parcelasNaoPagas.map((parcela) => parcela.id)
          )

        if (deleteParcelasError) {
          return NextResponse.json(
            {
              error:
                deleteParcelasError.message ||
                'Erro ao limpar parcelas pendentes da negociacao.',
            },
            { status: 400 }
          )
        }
      }

      if (parcelasRecalculadas.length > 0) {
        const { error: insertParcelasError } = await supabaseAdmin
          .schema('omie_core')
          .from('clientes_negociacoes_parcelas')
          .insert(
            parcelasRecalculadas.map((parcela) => ({
              negociacao_id: negociacaoInadimplente.id,
              cliente_id: cliente.id,
              cnpj_cpf: cliente.cnpj_cpf,
              ...parcela,
            }))
          )

        if (insertParcelasError) {
          return NextResponse.json(
            {
              error:
                insertParcelasError.message ||
                'Erro ao recriar parcelas da negociacao retomada.',
            },
            { status: 400 }
          )
        }
      }

      const loaded = await loadResumoAndParcelas(negociacaoInadimplente.id)
      if ('error' in loaded) {
        return NextResponse.json({ error: loaded.error }, { status: 400 })
      }

      return NextResponse.json({
        ok: true,
        resumo: loaded.resumo,
        parcelas: loaded.parcelas,
        status_negociacao: 'ativa',
      })
    }

    if (!['quitada', 'cancelada', 'inadimplente'].includes(statusNegociacao)) {
      return NextResponse.json(
        { error: 'Status final de negociacao invalido.' },
        { status: 400 }
      )
    }

    const { data: negociacao, error: negociacaoError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes')
      .select('id, status_negociacao')
      .eq('cliente_id', cliente.id)
      .eq('status_negociacao', 'ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (negociacaoError || !negociacao) {
      return NextResponse.json(
        { error: negociacaoError?.message || 'Negociacao ativa nao encontrada.' },
        { status: 404 }
      )
    }

    const { error: updateNegociacaoError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes')
      .update({
        status_negociacao: statusNegociacao,
      })
      .eq('id', negociacao.id)

    if (updateNegociacaoError) {
      return NextResponse.json(
        { error: updateNegociacaoError.message || 'Erro ao finalizar negociacao.' },
        { status: 400 }
      )
    }

    if (statusNegociacao === 'quitada' || statusNegociacao === 'cancelada') {
      const { data: parcelasNaoPagas, error: parcelasNaoPagasError } = await supabaseAdmin
        .schema('omie_core')
        .from('clientes_negociacoes_parcelas')
        .select('id')
        .eq('negociacao_id', negociacao.id)
        .neq('status_parcela', 'paga')

      if (parcelasNaoPagasError) {
        return NextResponse.json(
          {
            error:
              parcelasNaoPagasError.message ||
              'Erro ao localizar parcelas pendentes da negociacao encerrada.',
          },
          { status: 400 }
        )
      }

      if ((parcelasNaoPagas || []).length > 0) {
        const { error: deleteParcelasError } = await supabaseAdmin
          .schema('omie_core')
          .from('clientes_negociacoes_parcelas')
          .delete()
          .in(
            'id',
            (parcelasNaoPagas || []).map((parcela) => parcela.id)
          )

        if (deleteParcelasError) {
          return NextResponse.json(
            {
              error:
                deleteParcelasError.message ||
                'Erro ao limpar parcelas restantes da negociacao encerrada.',
            },
            { status: 400 }
          )
        }
      }
    }

    const loaded = await loadResumoAndParcelas(negociacao.id)
    if ('error' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      resumo: loaded.resumo,
      parcelas: loaded.parcelas,
      status_negociacao: statusNegociacao,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao finalizar negociacao.' },
      { status: 500 }
    )
  }
}
