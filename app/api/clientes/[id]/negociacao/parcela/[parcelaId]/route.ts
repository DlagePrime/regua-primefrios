import { NextResponse } from 'next/server'
import { requireMasterUser } from '@/lib/supabase/require-master'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{
    id: string
    parcelaId: string
  }>
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

function parseDateOnly(value: unknown) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return new Date().toISOString().slice(0, 10)
  }

  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return normalized
}

export async function PATCH(request: Request, context: Params) {
  try {
    const auth = await requireMasterUser()
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { id, parcelaId } = await context.params
    if (!id || !parcelaId) {
      return NextResponse.json({ error: 'Parcela inválida.' }, { status: 400 })
    }

    const body = await request.json()
    const valorPago = parseCurrency(body.valor_pago)
    const pagoEm = parseDateOnly(body.pago_em)

    if (valorPago <= 0) {
      return NextResponse.json(
        { error: 'Informe um valor pago maior que zero.' },
        { status: 400 }
      )
    }

    if (!pagoEm) {
      return NextResponse.json(
        { error: 'Informe uma data de pagamento válida.' },
        { status: 400 }
      )
    }

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes')
      .select('id, cnpj_cpf, em_negociacao')
      .eq('id', id)
      .single()

    if (clienteError || !cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }

    const { data: negociacao, error: negociacaoError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes')
      .select('id, cnpj_cpf, valor_total_divida, status_negociacao')
      .eq('cliente_id', cliente.id)
      .eq('status_negociacao', 'ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (negociacaoError || !negociacao) {
      return NextResponse.json(
        { error: negociacaoError?.message || 'Negociação ativa não encontrada.' },
        { status: 404 }
      )
    }

    const { data: parcelas, error: parcelasError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes_parcelas')
      .select('id, negociacao_id, numero_parcela, vencimento, valor_parcela, status_parcela, pago_em, valor_pago')
      .eq('negociacao_id', negociacao.id)
      .order('numero_parcela', { ascending: true })

    if (parcelasError || !parcelas || parcelas.length === 0) {
      return NextResponse.json(
        { error: parcelasError?.message || 'Parcelas não encontradas.' },
        { status: 404 }
      )
    }

    const parcelaAtual = parcelas.find((parcela) => parcela.id === parcelaId)
    if (!parcelaAtual) {
      return NextResponse.json({ error: 'Parcela não encontrada.' }, { status: 404 })
    }

    const ultimaParcela = parcelas[parcelas.length - 1]

    const { error: updateParcelaError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes_parcelas')
      .update({
        valor_pago: valorPago,
        pago_em: pagoEm,
        status_parcela: 'paga',
      })
      .eq('id', parcelaId)

    if (updateParcelaError) {
      return NextResponse.json(
        { error: updateParcelaError.message || 'Erro ao atualizar parcela.' },
        { status: 400 }
      )
    }

    if (ultimaParcela.id !== parcelaId) {
      const parcelasRecalculadas = parcelas.map((parcela) =>
        parcela.id === parcelaId
          ? {
              ...parcela,
              valor_pago: valorPago,
              pago_em: pagoEm,
              status_parcela: 'paga',
            }
          : parcela
      )

      const somaSemUltima = parcelasRecalculadas
        .filter((parcela) => parcela.id !== ultimaParcela.id)
        .reduce((total, parcela) => {
          if (parcela.status_parcela === 'paga' && parcela.valor_pago !== null) {
            return total + Number(parcela.valor_pago)
          }

          return total + Number(parcela.valor_parcela)
        }, 0)

      const novoValorUltimaParcela = Math.max(
        0,
        roundMoney(Number(negociacao.valor_total_divida) - somaSemUltima)
      )

      const { error: ultimaParcelaError } = await supabaseAdmin
        .schema('omie_core')
        .from('clientes_negociacoes_parcelas')
        .update({
          valor_parcela: novoValorUltimaParcela,
        })
        .eq('id', ultimaParcela.id)

      if (ultimaParcelaError) {
        return NextResponse.json(
          {
            error:
              ultimaParcelaError.message ||
              'Erro ao recalcular a última parcela da negociação.',
          },
          { status: 400 }
        )
      }
    }

    const { data: resumoAtualizado, error: resumoError } = await supabaseAdmin
      .schema('omie_core')
      .from('vw_clientes_negociacoes_resumo')
      .select(
        'negociacao_id, cnpj_cpf, razao_social, frequencia, quantidade_parcelas, valor_total_divida, data_inicio, data_quitacao_prevista, status_negociacao, observacoes, total_parcelas, parcelas_pagas, parcelas_pendentes, parcelas_vencidas, parcelas_canceladas, valor_total_parcelas, valor_total_pago, proximo_vencimento'
      )
      .eq('negociacao_id', negociacao.id)
      .maybeSingle()

    if (resumoError) {
      return NextResponse.json(
        { error: resumoError.message || 'Erro ao atualizar resumo da negociação.' },
        { status: 400 }
      )
    }

    const { data: parcelasAtualizadas, error: parcelasAtualizadasError } = await supabaseAdmin
      .schema('omie_core')
      .from('clientes_negociacoes_parcelas')
      .select('id, negociacao_id, numero_parcela, vencimento, valor_parcela, status_parcela, pago_em, valor_pago')
      .eq('negociacao_id', negociacao.id)
      .order('numero_parcela', { ascending: true })

    if (parcelasAtualizadasError) {
      return NextResponse.json(
        {
          error:
            parcelasAtualizadasError.message ||
            'Erro ao carregar parcelas atualizadas da negociação.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      resumo: resumoAtualizado,
      parcelas: parcelasAtualizadas || [],
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao atualizar parcela da negociação.' },
      { status: 500 }
    )
  }
}
