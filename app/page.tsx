'use client'

import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { CobrancaManagerModal } from '@/app/components/cobranca-manager-modal'

const supabase = createSupabaseClient()
const PAGE_SIZE = 10
const VENCIDOS = 'clientes_meta'

type Etapa = 'dia_vencimento' | 'vencido_3_mais' | 'vencido_6_mais' | 'fora_regua'
type Cliente = {
  id: string
  razao_social: string | null
  nome_fantasia?: string | null
  cnpj_cpf: string | null
  whatsapp: string | null
  contato: string | null
  ativo?: boolean | null
  nome_vendedor_padrao_snapshot: string | null
  cliente_desbloqueado_regua: boolean | null
  em_negociacao?: boolean | null
  ultima_negociacao_status?: string | null
  ultima_negociacao_valor_divida?: number
  ultima_negociacao_quantidade_parcelas?: number
  ultima_negociacao_frequencia?: string | null
  ultima_negociacao_observacoes?: string | null
  tem_titulo?: boolean
  qtd_titulos_vencidos?: number
  valor_total_titulos_vencidos?: number
  valor_total_a_vencer?: number
  max_dias_atraso?: number
  etapa_regua?: Etapa
}

type Perfil = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
}

type ResumoVencidos = {
  total: number
  inadimplentes: number
}

type TituloTratado = {
  id: string
  numero_pedido: string | null
  numero_parcela: string | null
  valor_documento: number | string | null
  data_vencimento: string | null
  status_envio: string | null
}

type TituloVencido = {
  id: string
  doc: string | null
  status: string | null
  parcela: string | null
  emissao: string | null
  vencimento: string | null
  valor_fatura: string | null
}

type FrequenciaNegociacao = 'semanal' | 'quinzenal' | 'mensal'
type DiaSemanaNegociacao =
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'
  | 'domingo'

type ModoNegociacao = 'criar' | 'retomar'

type NegociacaoResumo = {
  negociacao_id: string
  cnpj_cpf: string
  razao_social: string
  frequencia: string
  quantidade_parcelas: number
  valor_total_divida: number
  data_inicio: string | null
  data_quitacao_prevista: string | null
  status_negociacao: string
  observacoes: string | null
  total_parcelas: number
  parcelas_pagas: number
  parcelas_pendentes: number
  parcelas_vencidas: number
  parcelas_canceladas: number
  valor_total_parcelas: number
  valor_total_pago: number
  proximo_vencimento: string | null
}

type ParcelaNegociacao = {
  id: string
  negociacao_id: string
  numero_parcela: number
  vencimento: string
  valor_parcela: number
  status_parcela: string
  pago_em: string | null
  valor_pago: number | null
}

const money = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v)

const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0)

const badge = (e: Etapa) =>
  ({
    dia_vencimento:
      'border border-[rgba(81,150,206,0.35)] bg-[rgba(81,150,206,0.18)] text-[#cfeaff]',
    vencido_3_mais:
      'border border-[rgba(254,132,146,0.28)] bg-[rgba(254,132,146,0.16)] text-[#ffe1e4]',
    vencido_6_mais:
      'border border-[rgba(164,37,39,0.34)] bg-[rgba(164,37,39,0.2)] text-[#ffd0d2]',
    fora_regua: 'border border-white/10 bg-white/8 text-slate-200',
  }[e])
const etapaLabel = (e: Etapa) => ({ dia_vencimento: 'Dia do vencimento', vencido_3_mais: 'Vencido 3+', vencido_6_mais: 'Vencido 6+', fora_regua: 'Fora da régua' }[e])

function parseMoney(v?: string | number | null) {
  if (!v) return 0

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0
  }

  const n = Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function Home() {
  const router = useRouter()
  const [status, setStatus] = useState('Carregando carteira...')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const buscaNow = useDeferredValue(busca)
  const [filtroRegua, setFiltroRegua] = useState('todos')
  const [filtroNegociacao, setFiltroNegociacao] = useState('todos')
  const [filtroTitulos, setFiltroTitulos] = useState('todos')
  const [filtroEtapa, setFiltroEtapa] = useState<Etapa | 'todos'>('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [saindo, setSaindo] = useState(false)
  const [modal, setModal] = useState<'tratados' | 'vencidos' | 'negociacao' | 'negociacao_detalhe' | 'gerenciar_cobranca' | null>(null)
  const [clienteModal, setClienteModal] = useState<Cliente | null>(null)
  const [tratados, setTratados] = useState<TituloTratado[]>([])
  const [vencidos, setVencidos] = useState<TituloVencido[]>([])
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvandoNegociacao, setSalvandoNegociacao] = useState(false)
  const [modoNegociacao, setModoNegociacao] = useState<ModoNegociacao>('criar')
  const [negociacaoValorTotal, setNegociacaoValorTotal] = useState('')
  const [negociacaoValorParcela, setNegociacaoValorParcela] = useState('')
  const [negociacaoQuantidadeParcelas, setNegociacaoQuantidadeParcelas] = useState('4')
  const [negociacaoFrequencia, setNegociacaoFrequencia] =
    useState<FrequenciaNegociacao>('semanal')
  const [negociacaoDiaSemana, setNegociacaoDiaSemana] =
    useState<DiaSemanaNegociacao>('sexta')
  const [negociacaoDataInicio, setNegociacaoDataInicio] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [negociacaoObservacoes, setNegociacaoObservacoes] = useState('')
  const [negociacaoResumo, setNegociacaoResumo] = useState<NegociacaoResumo | null>(null)
  const [negociacaoParcelas, setNegociacaoParcelas] = useState<ParcelaNegociacao[]>([])
  const [carregandoNegociacao, setCarregandoNegociacao] = useState(false)
  const [salvandoParcelaId, setSalvandoParcelaId] = useState<string | null>(null)
  const [finalizandoNegociacao, setFinalizandoNegociacao] = useState<string | null>(null)
  const [valorPagoParcelas, setValorPagoParcelas] = useState<Record<string, string>>({})
  const [pagoEmParcelas, setPagoEmParcelas] = useState<Record<string, string>>({})
  const [resumoVencidosFonte, setResumoVencidosFonte] = useState<ResumoVencidos>({
    total: 0,
    inadimplentes: 0,
  })

  async function carregar(silencioso = false) {
    if (!silencioso) {
      setStatus('Carregando carteira...')
    }
    if (!silencioso) {
      setMensagem(null)
    }
    setErro(null)
    const response = await fetch('/api/clientes/carteira', {
      method: 'GET',
      cache: 'no-store',
    })
    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao carregar carteira.')
      return
    }

    setPerfil(resultado.perfil || null)
    setClientes(resultado.clientes || [])
    setResumoVencidosFonte(
      resultado.resumoVencidosFonte || {
        total: 0,
        inadimplentes: 0,
      }
    )
    setStatus(resultado.status || 'Carteira carregada.')
  }

  async function toggleRegua(cliente: Cliente) {
    const response = await fetch(`/api/clientes/${cliente.id}/regua`, {
      method: 'PATCH',
    })

    const resultado = await response.json()
    if (!response.ok) return alert(resultado.error || 'Erro ao atualizar régua do cliente.')

    setClientes((list) =>
      list.map((c) =>
        c.id === cliente.id
          ? { ...c, cliente_desbloqueado_regua: resultado.cliente_desbloqueado_regua === true }
          : c
      )
    )
  }

  async function openTratados(cliente: Cliente) {
    setClienteModal(cliente); setModal('tratados'); setTratados([])
    const { data } = await supabase.schema('omie_core').from('regua_dia_vencimento').select('id, numero_pedido, numero_parcela, valor_documento, data_vencimento, status_envio').eq('cnpj_cpf', cliente.cnpj_cpf || '').order('data_vencimento', { ascending: true })
    setTratados(data || [])
  }

  async function openVencidos(cliente: Cliente) {
    setClienteModal(cliente)
    setModal('vencidos')
    setVencidos([])
    setErro(null)

    const response = await fetch(`/api/clientes/${cliente.id}/vencidos`)
    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao carregar títulos vencidos.')
      return
    }

    setVencidos(resultado.vencidos || [])
  }

  function openNegociacao(cliente: Cliente) {
    setClienteModal(cliente)
    setModal('negociacao')
    setErro(null)
    setMensagem(null)
    setModoNegociacao(
      cliente.ultima_negociacao_status === 'inadimplente' ? 'retomar' : 'criar'
    )
    const valorBase =
      cliente.ultima_negociacao_status === 'inadimplente' &&
      (cliente.ultima_negociacao_valor_divida || 0) > 0
        ? cliente.ultima_negociacao_valor_divida || 0
        : cliente.valor_total_titulos_vencidos || 0

    setNegociacaoValorTotal(
      valorBase ? String(valorBase.toFixed(2)).replace('.', ',') : ''
    )
    setNegociacaoValorParcela('')
    setNegociacaoQuantidadeParcelas(
      cliente.ultima_negociacao_status === 'inadimplente' &&
        (cliente.ultima_negociacao_quantidade_parcelas || 0) > 0
        ? String(cliente.ultima_negociacao_quantidade_parcelas)
        : '4'
    )
    setNegociacaoFrequencia(
      cliente.ultima_negociacao_status === 'inadimplente' &&
        ['semanal', 'quinzenal', 'mensal'].includes(
          cliente.ultima_negociacao_frequencia || ''
        )
        ? (cliente.ultima_negociacao_frequencia as FrequenciaNegociacao)
        : 'semanal'
    )
    setNegociacaoDiaSemana('sexta')
    setNegociacaoDataInicio(new Date().toISOString().slice(0, 10))
    setNegociacaoObservacoes(
      cliente.ultima_negociacao_status === 'inadimplente'
        ? cliente.ultima_negociacao_observacoes || ''
        : ''
    )
  }

  function refazerNegociacaoAtual() {
    if (!clienteModal) return

    openNegociacao({
      ...clienteModal,
      ultima_negociacao_status: 'inadimplente',
      ultima_negociacao_valor_divida:
        Number(negociacaoResumo?.valor_total_divida || clienteModal.ultima_negociacao_valor_divida || 0),
      ultima_negociacao_quantidade_parcelas:
        Number(
          negociacaoResumo?.quantidade_parcelas ||
            clienteModal.ultima_negociacao_quantidade_parcelas ||
            0
        ),
      ultima_negociacao_frequencia:
        negociacaoResumo?.frequencia || clienteModal.ultima_negociacao_frequencia || null,
      ultima_negociacao_observacoes:
        negociacaoResumo?.observacoes || clienteModal.ultima_negociacao_observacoes || null,
    })
  }

  async function openDetalheNegociacao(cliente: Cliente) {
    setClienteModal(cliente)
    setErro(null)
    setMensagem(null)
    setCarregandoNegociacao(true)
    setNegociacaoResumo(null)
    setNegociacaoParcelas([])
    setModal('negociacao_detalhe')

    const response = await fetch(`/api/clientes/${cliente.id}/negociacao`)
    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao carregar negociação.')
      setCarregandoNegociacao(false)
      return
    }

    setNegociacaoResumo(resultado.negociacao || null)
    setNegociacaoParcelas(resultado.parcelas || [])
    setValorPagoParcelas(
      Object.fromEntries(
        (resultado.parcelas || []).map((parcela: ParcelaNegociacao) => [
          parcela.id,
          parcela.valor_pago ? String(parcela.valor_pago).replace('.', ',') : '',
        ])
      )
    )
    setPagoEmParcelas(
      Object.fromEntries(
        (resultado.parcelas || []).map((parcela: ParcelaNegociacao) => [
          parcela.id,
          parcela.pago_em || new Date().toISOString().slice(0, 10),
        ])
      )
    )
    setCarregandoNegociacao(false)
  }

  async function salvarParcelaNegociacao(parcela: ParcelaNegociacao) {
    if (!clienteModal) return

    setErro(null)
    setMensagem(null)
    setSalvandoParcelaId(parcela.id)

    const response = await fetch(
      `/api/clientes/${clienteModal.id}/negociacao/parcela/${parcela.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valor_pago: valorPagoParcelas[parcela.id] || '',
          pago_em: pagoEmParcelas[parcela.id] || '',
        }),
      }
    )

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao atualizar parcela.')
      setSalvandoParcelaId(null)
      return
    }

    setNegociacaoResumo(resultado.resumo || null)
    setNegociacaoParcelas(resultado.parcelas || [])
    setValorPagoParcelas(
      Object.fromEntries(
        (resultado.parcelas || []).map((item: ParcelaNegociacao) => [
          item.id,
          item.valor_pago ? String(item.valor_pago).replace('.', ',') : '',
        ])
      )
    )
    setPagoEmParcelas(
      Object.fromEntries(
        (resultado.parcelas || []).map((item: ParcelaNegociacao) => [
          item.id,
          item.pago_em || new Date().toISOString().slice(0, 10),
        ])
      )
    )
    setMensagem('Parcela atualizada com sucesso.')
    setSalvandoParcelaId(null)
  }

  async function finalizarNegociacao(statusFinal: 'quitada' | 'cancelada' | 'inadimplente') {
    if (!clienteModal || !negociacaoResumo) return

    setErro(null)
    setMensagem(null)
    setFinalizandoNegociacao(statusFinal)

    const response = await fetch(`/api/clientes/${clienteModal.id}/negociacao`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status_negociacao: statusFinal,
      }),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao finalizar negociação.')
      setFinalizandoNegociacao(null)
      return
    }

    setNegociacaoResumo(resultado.resumo || null)
    setNegociacaoParcelas(resultado.parcelas || [])
    setClientes((list) =>
      list.map((cliente) =>
        cliente.id === clienteModal.id
          ? { ...cliente, em_negociacao: false, ultima_negociacao_status: statusFinal }
          : cliente
      )
    )
    setMensagem(`Negociação marcada como ${statusFinal}.`)
    setFinalizandoNegociacao(null)
  }

  async function criarNegociacao() {
    if (!clienteModal) return

    setErro(null)
    setMensagem(null)
    setSalvandoNegociacao(true)

    const retomando =
      modoNegociacao === 'retomar' &&
      clienteModal.ultima_negociacao_status === 'inadimplente'

    const response = await fetch(`/api/clientes/${clienteModal.id}/negociacao`, {
      method: retomando ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(retomando ? { acao: 'retomar' } : {}),
        valor_total_divida: negociacaoValorTotal,
        valor_parcela: negociacaoValorParcela,
        quantidade_parcelas: Number(negociacaoQuantidadeParcelas),
        frequencia: negociacaoFrequencia,
        dia_semana: negociacaoDiaSemana,
        data_inicio: negociacaoDataInicio,
        observacoes: negociacaoObservacoes,
      }),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(
        resultado.error ||
          (retomando ? 'Erro ao retomar negociação.' : 'Erro ao criar negociação.')
      )
      setSalvandoNegociacao(false)
      return
    }

    setClientes((list) =>
      list.map((cliente) =>
        cliente.id === clienteModal.id
          ? {
              ...cliente,
              em_negociacao: true,
              ultima_negociacao_status: 'ativa',
              ultima_negociacao_valor_divida: parseMoney(negociacaoValorTotal),
              ultima_negociacao_quantidade_parcelas: Number(
                retomando
                  ? resultado.resumo?.quantidade_parcelas || negociacaoQuantidadeParcelas
                  : resultado.negociacao?.quantidade_parcelas || negociacaoQuantidadeParcelas
              ),
              ultima_negociacao_frequencia: negociacaoFrequencia,
              ultima_negociacao_observacoes: negociacaoObservacoes || null,
            }
          : cliente
      )
    )
    if (retomando) {
      setNegociacaoResumo(resultado.resumo || null)
      setNegociacaoParcelas(resultado.parcelas || [])
      setValorPagoParcelas(
        Object.fromEntries(
          (resultado.parcelas || []).map((parcela: ParcelaNegociacao) => [
            parcela.id,
            parcela.valor_pago ? String(parcela.valor_pago).replace('.', ',') : '',
          ])
        )
      )
      setPagoEmParcelas(
        Object.fromEntries(
          (resultado.parcelas || []).map((parcela: ParcelaNegociacao) => [
            parcela.id,
            parcela.pago_em || new Date().toISOString().slice(0, 10),
          ])
        )
      )
      setMensagem('Negociação retomada com sucesso.')
      setModal('negociacao_detalhe')
    } else {
      setMensagem('Negociação criada com sucesso.')
      setModal(null)
    }
    setSalvandoNegociacao(false)
  }

  function clienteTemHistoricoNegociacao(cliente: Cliente) {
    return cliente.em_negociacao === true || Boolean(cliente.ultima_negociacao_status)
  }

  function acaoNegociacaoLabel(cliente: Cliente) {
    if (perfil?.perfil === 'master') {
      if (cliente.em_negociacao === true) return 'Ver negociação'
      if (cliente.ultima_negociacao_status === 'inadimplente') return 'Retomar negociação'
      return 'Negociação'
    }

    return 'Ver negociação'
  }

  function abrirAcaoNegociacao(cliente: Cliente) {
    if (perfil?.perfil === 'master') {
      if (cliente.em_negociacao === true || cliente.ultima_negociacao_status === 'inadimplente') {
        return openDetalheNegociacao(cliente)
      }

      return openNegociacao(cliente)
    }

    if (clienteTemHistoricoNegociacao(cliente)) {
      return openDetalheNegociacao(cliente)
    }
  }

  const metricas = useMemo(() => ({
    totalVencido: resumoVencidosFonte.total,
    totalAVencer: clientes.reduce((s, c) => s + (c.valor_total_a_vencer || 0), 0),
    inadimplentes: resumoVencidosFonte.inadimplentes,
    liberados: clientes.filter((c) => c.cliente_desbloqueado_regua === true).length,
    risco: clientes.filter((c) => (c.max_dias_atraso || 0) >= 6).length,
    hoje: clientes.filter((c) => c.etapa_regua === 'dia_vencimento').length,
    tres: clientes.filter((c) => c.etapa_regua === 'vencido_3_mais').length,
    seis: clientes.filter((c) => c.etapa_regua === 'vencido_6_mais').length,
    negociacoesAtivas: clientes.filter((c) => c.em_negociacao === true).length,
    valorNegociacoesAtivas: clientes.reduce(
      (s, c) => s + (c.em_negociacao === true ? c.ultima_negociacao_valor_divida || 0 : 0),
      0
    ),
  }), [clientes, resumoVencidosFonte])

  const metricasCobranca = useMemo(
    () => ({
      aptos: clientes.filter(
        (cliente) =>
          cliente.cliente_desbloqueado_regua === true && cliente.em_negociacao !== true
      ).length,
      bloqueados: clientes.filter(
        (cliente) => cliente.cliente_desbloqueado_regua !== true
      ).length,
      emNegociacao: clientes.filter((cliente) => cliente.em_negociacao === true).length,
    }),
    [clientes]
  )

  const vendedores = useMemo(
    () =>
      perfil?.perfil === 'master'
        ? Array.from(
            new Set(
              clientes
                .map((c) => c.nome_vendedor_padrao_snapshot)
                .filter((value): value is string => Boolean(value))
            )
          ).sort()
        : [],
    [clientes, perfil]
  )

  const filtrados = useMemo(() => clientes.filter((c) => {
    const texto = [c.razao_social || '', c.nome_fantasia || '', c.cnpj_cpf || '', c.whatsapp || ''].join(' ').toLowerCase()
    const buscaOk = !buscaNow.trim() || texto.includes(buscaNow.toLowerCase())
    const reguaOk = filtroRegua === 'todos' ? true : filtroRegua === 'liberados' ? c.cliente_desbloqueado_regua === true : c.cliente_desbloqueado_regua !== true
    const negociacaoOk =
      filtroNegociacao === 'todos'
        ? true
        : filtroNegociacao === 'em_negociacao'
          ? c.em_negociacao === true
          : c.em_negociacao !== true
    const tituloOk = filtroTitulos === 'todos' ? true : filtroTitulos === 'tratados' ? c.tem_titulo === true : (c.qtd_titulos_vencidos || 0) > 0
    const etapaOk = filtroEtapa === 'todos' ? true : c.etapa_regua === filtroEtapa
    const vendOk = perfil?.perfil !== 'master' ? true : filtroVendedor === 'todos' ? true : (c.nome_vendedor_padrao_snapshot || '') === filtroVendedor
    return buscaOk && reguaOk && negociacaoOk && tituloOk && etapaOk && vendOk
  }), [buscaNow, clientes, filtroEtapa, filtroNegociacao, filtroRegua, filtroTitulos, filtroVendedor, perfil])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaAtual = useMemo(() => filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [filtrados, pagina])
  const recarregarAoVivo = useEffectEvent(() => {
    void carregar(true)
  })

  useEffect(() => { carregar() }, [])
  useEffect(() => { setPagina(1) }, [buscaNow, filtroRegua, filtroNegociacao, filtroTitulos, filtroEtapa, filtroVendedor])
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas) }, [pagina, totalPaginas])
  useEffect(() => {
    let timeoutId: number | null = null

    const agendarRecarga = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }

      timeoutId = window.setTimeout(() => {
        recarregarAoVivo()
      }, 700)
    }

    const channel = supabase
      .channel('dashboard-live-sync')
      .on('postgres_changes', { event: '*', schema: 'omie_core', table: 'regua_dia_vencimento' }, agendarRecarga)
      .on('postgres_changes', { event: '*', schema: 'omie_core', table: VENCIDOS }, agendarRecarga)
      .on('postgres_changes', { event: '*', schema: 'omie_core', table: 'clientes' }, agendarRecarga)
      .on('postgres_changes', { event: '*', schema: 'omie_core', table: 'usuarios_dashboard' }, agendarRecarga)
      .subscribe()

    const intervalId = window.setInterval(() => {
      recarregarAoVivo()
    }, 30000)

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      window.clearInterval(intervalId)
      void supabase.removeChannel(channel)
    }
  }, [recarregarAoVivo])
  useEffect(() => {
    if (!modal) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setModal(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modal])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(81,150,206,0.14),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(164,37,39,0.16),_transparent_22%),linear-gradient(180deg,_rgba(40,47,69,0.88)_0%,_rgba(40,24,32,0.78)_52%,_rgba(69,20,27,0.72)_100%)] text-slate-100">
      <div className="mx-auto max-w-[1550px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-[30px] border border-white/10 bg-[rgba(40,47,69,0.22)] shadow-[0_30px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-5 sm:px-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-[#d8efff]/80">
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1">
                    Prime Frios
                  </span>
                  <span className="rounded-full border border-[rgba(81,150,206,0.25)] bg-[rgba(81,150,206,0.14)] px-3 py-1 text-[#d7eeff]">
                    Títulos A Vencer
                  </span>
                  <span className="rounded-full border border-[rgba(164,37,39,0.25)] bg-[rgba(164,37,39,0.14)] px-3 py-1 text-[#ffd4da]">
                    Títulos Vencidos
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Gestão de Clientes e Titulos A vencer e Vencidos
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/80">
                  Aqui é o Espaço para ativar ou desativar cobranças ou lembretes - 
                  Funçao = Liberar régua - ativa enviar mensagem para o cliente 
                  Funçao = Bloquear régua - bloqueio o envio de mensagem ao CLiente

                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-slate-200/80">
                  {status}
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.26em] text-[#d8efff]/80">
                    Em operação
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {metricas.hoje + metricas.tres + metricas.seis}
                  </div>
                  <div className="text-sm text-slate-200/75">
                    clientes dentro da régua
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-5 sm:px-8 xl:grid-cols-[minmax(0,1.55fr)_320px]">
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Total vencido', money(metricas.totalVencido), 'destaque em vermelho para títulos vencidos', 'red'],
                  ...(perfil?.perfil === 'master'
                    ? [['Total a vencer', money(metricas.totalAVencer), 'somente visão master', 'blue'] as const]
                    : []),
                  ['Clientes inadimplentes', String(metricas.inadimplentes), `${pct(metricas.inadimplentes, clientes.length)}% da carteira`, 'default'],
                  ['Régua liberada', String(metricas.liberados), `${pct(metricas.liberados, clientes.length)}% dos clientes`, 'blue'],
                  ['Risco alto', String(metricas.risco), 'atraso igual ou superior a 6 dias', 'red'],
                ].map(([t, v, s, tone]) => (
                  <div
                    key={t}
                    className={`rounded-[26px] border p-5 ${
                      tone === 'red'
                        ? 'border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.12)]'
                        : tone === 'blue'
                          ? 'border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.12)]'
                          : 'border-white/10 bg-white/[0.06]'
                    }`}
                  >
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      {t}
                    </div>
                    <div className="mt-4 text-3xl font-semibold text-white">{v}</div>
                    <div className="mt-2 text-sm text-slate-300/80">{s}</div>
                  </div>
                ))}
              </section>

              <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="flex flex-wrap gap-2">{[['dia_vencimento', metricas.hoje], ['vencido_3_mais', metricas.tres], ['vencido_6_mais', metricas.seis]].map(([e, v]) => <button key={e} onClick={() => setFiltroEtapa(e as Etapa)} className={`rounded-full px-4 py-2 text-sm ${badge(e as Etapa)}`}>{etapaLabel(e as Etapa)}: {String(v)}</button>)}</div><p className="mt-4 text-sm text-slate-300">A régua respeita sua necessidade: dia do vencimento, vencido 3+ e vencido 6+, com leitura mais leve e contraste visual melhor entre a vencer e vencidos.</p></section>

              <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por razão social, nome fantasia, CNPJ ou WhatsApp"
                    className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm outline-none placeholder:text-slate-500"
                  />
                  <select
                    value={filtroRegua}
                    onChange={(e) => setFiltroRegua(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
                  >
                    <option value="todos">Régua: todos</option>
                    <option value="liberados">Régua: liberados</option>
                    <option value="bloqueados">Régua: bloqueados</option>
                  </select>
                  <select
                    value={filtroNegociacao}
                    onChange={(e) => setFiltroNegociacao(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
                  >
                    <option value="todos">Negociação: todos</option>
                    <option value="em_negociacao">Em negociação</option>
                    <option value="sem_negociacao">Sem negociação</option>
                  </select>
                  <select
                    value={filtroTitulos}
                    onChange={(e) => setFiltroTitulos(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
                  >
                    <option value="todos">Títulos: todos</option>
                    <option value="tratados">Com Títulos A Vencer</option>
                    <option value="vencidos">Com Títulos Vencidos</option>
                  </select>
                  <select
                    value={filtroEtapa}
                    onChange={(e) => setFiltroEtapa(e.target.value as Etapa | 'todos')}
                    className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
                  >
                    <option value="todos">Etapa: todas</option>
                    <option value="dia_vencimento">Dia do vencimento</option>
                    <option value="vencido_3_mais">Vencido 3+</option>
                    <option value="vencido_6_mais">Vencido 6+</option>
                  </select>
                  {perfil?.perfil === 'master' && (
                    <select
                      value={filtroVendedor}
                      onChange={(e) => setFiltroVendedor(e.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
                    >
                      <option value="todos">Vendedor: todos</option>
                      {vendedores.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </section>

              <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-white">Carteira operacional</h2><div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">{filtrados.length} clientes</div></div>{mensagem && <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{mensagem}</div>}{erro && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{erro}</div>}<div className="grid gap-4">{paginaAtual.map((c) => <article key={c.id} className="rounded-[26px] border border-white/10 bg-[rgba(40,47,69,0.24)] p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><div><h3 className="text-xl font-semibold text-white">{c.razao_social || '-'}</h3>{c.nome_fantasia && c.nome_fantasia !== c.razao_social && <div className="mt-1 text-sm text-[#d8efff]/80">{c.nome_fantasia}</div>}</div><span className={`rounded-full px-3 py-1 text-xs font-medium ${badge(c.etapa_regua || 'fora_regua')}`}>{etapaLabel(c.etapa_regua || 'fora_regua')}</span><span className={`rounded-full border px-3 py-1 text-xs ${c.cliente_desbloqueado_regua ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-[#ffd4da]'}`}>{c.cliente_desbloqueado_regua ? 'Régua liberada' : 'Régua bloqueada'}</span>{c.em_negociacao && <span className="rounded-full border border-[rgba(254,132,146,0.3)] bg-[rgba(254,132,146,0.14)] px-3 py-1 text-xs text-[#ffe1e4]">Em negociação</span>}{!c.em_negociacao && c.ultima_negociacao_status === 'inadimplente' && <span className="rounded-full border border-[rgba(164,37,39,0.3)] bg-[rgba(164,37,39,0.18)] px-3 py-1 text-xs text-[#ffd4da]">Negociação inadimplente</span>}</div><div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4"><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">CNPJ / CPF</div><div className="mt-1">{c.cnpj_cpf || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">WhatsApp</div><div className="mt-1">{c.whatsapp || 'Não informado'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Contato</div><div className="mt-1">{c.contato || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Vendedor</div><div className="mt-1">{c.nome_vendedor_padrao_snapshot || '-'}</div></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Títulos A Vencer</div><div className="mt-2 text-2xl font-semibold text-white">{c.tem_titulo ? 'Sim' : 'Não'}</div></div><div className="rounded-2xl border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Títulos Vencidos</div><div className="mt-2 text-2xl font-semibold text-white">{c.qtd_titulos_vencidos || 0}</div></div><div className="rounded-2xl border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Valor A Vencer</div><div className="mt-2 text-2xl font-semibold text-white">{money(c.valor_total_a_vencer || 0)}</div></div><div className="rounded-2xl border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Valor vencido</div><div className="mt-2 text-2xl font-semibold text-white">{money(c.valor_total_titulos_vencidos || 0)}</div></div></div></div><div className="grid gap-3 xl:w-[240px]"><button onClick={() => toggleRegua(c)} className={`rounded-2xl px-4 py-3 text-sm font-medium ${c.cliente_desbloqueado_regua ? 'bg-[rgba(164,37,39,0.92)] text-white' : 'bg-[rgba(81,150,206,0.92)] text-white'}`}>{c.cliente_desbloqueado_regua ? 'Bloquear régua' : 'Liberar régua'}</button><button onClick={() => openTratados(c)} className="rounded-2xl border border-[rgba(81,150,206,0.3)] bg-[rgba(81,150,206,0.14)] px-4 py-3 text-sm text-[#d7eeff]">Títulos A Vencer</button><button onClick={() => openVencidos(c)} className="rounded-2xl border border-[rgba(164,37,39,0.3)] bg-[rgba(164,37,39,0.14)] px-4 py-3 text-sm text-[#ffd4da]">Títulos Vencidos</button>{((perfil?.perfil === 'master') || (perfil?.perfil === 'vendedor' && clienteTemHistoricoNegociacao(c))) && <button onClick={() => abrirAcaoNegociacao(c)} className={`rounded-2xl border px-4 py-3 text-sm ${clienteTemHistoricoNegociacao(c) ? 'border-[rgba(254,132,146,0.3)] bg-[rgba(254,132,146,0.18)] text-[#ffe1e4]' : 'border-[rgba(254,132,146,0.3)] bg-[rgba(254,132,146,0.14)] text-[#ffe1e4]'}`}>{acaoNegociacaoLabel(c)}</button>}</div></div></article>)}</div><div className="mt-5 flex flex-wrap items-center justify-center gap-3"><button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1} className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm disabled:opacity-40">Anterior</button><span className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm text-slate-300">Página {pagina} de {totalPaginas}</span><button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm disabled:opacity-40">Próxima</button></div></section>
            </div>

            <aside className="space-y-6"><section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="text-xs uppercase tracking-[0.28em] text-slate-400">Perfil logado</div><div className="mt-4 grid gap-3"><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="text-sm text-slate-400">Usuário</div><div className="mt-1 font-medium text-white">{perfil?.nome || perfil?.email || '-'}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="text-sm text-slate-400">Perfil</div><div className="mt-1 font-medium text-white">{perfil?.perfil || '-'}</div></div></div><div className="mt-4 grid gap-3"><button onClick={() => setModal('gerenciar_cobranca')} className="rounded-2xl border border-[rgba(81,150,206,0.3)] bg-[rgba(81,150,206,0.14)] px-4 py-3 text-sm font-medium text-[#d7eeff]">Gerenciar cobrança</button>{perfil?.perfil === 'master' && <button onClick={() => router.push('/usuarios')} className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950">Gerenciar usuários</button>}<button onClick={async () => { setSaindo(true); await supabase.auth.signOut(); router.push('/login'); router.refresh() }} disabled={saindo} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm">{saindo ? 'Saindo...' : 'Encerrar sessão'}</button></div></section><section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="text-xs uppercase tracking-[0.28em] text-slate-400">Resumo</div><div className="mt-4 space-y-3">{[['Dia do vencimento', metricas.hoje, 'bg-cyan-400'], ['Vencido 3+', metricas.tres, 'bg-amber-400'], ['Vencido 6+', metricas.seis, 'bg-rose-500']].map(([t, v, cor]) => <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center justify-between gap-4"><div><div className="text-sm text-slate-300">{t}</div><div className="mt-2 text-2xl font-semibold text-white">{String(v)}</div></div><div className={`h-11 w-11 rounded-2xl ${cor}`} /></div></div>)}<div className="rounded-2xl border border-[rgba(88,126,74,0.38)] bg-[rgba(88,126,74,0.18)] p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-sm text-[#dce9d6]">Negociações em aberto</div><div className="mt-2 text-2xl font-semibold text-white">{metricas.negociacoesAtivas}</div><div className="mt-2 text-sm text-[#dce9d6]/85">{money(metricas.valorNegociacoesAtivas)}</div></div><div className="h-11 w-11 rounded-2xl bg-[rgb(88,126,74)]" /></div></div></div></section></aside>
          </div>
        </div>
      </div>

      {modal === 'gerenciar_cobranca' && (
        <CobrancaManagerModal
          perfil={perfil}
          clientesAptos={metricasCobranca.aptos}
          clientesBloqueados={metricasCobranca.bloqueados}
          clientesEmNegociacao={metricasCobranca.emNegociacao}
          onClose={() => setModal(null)}
        />
      )}

      {modal && modal !== 'gerenciar_cobranca' && <div onClick={() => setModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(40,24,32,0.42)] px-4 py-6 backdrop-blur-md"><div onClick={(event) => event.stopPropagation()} className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-[28px] border border-white/10 bg-[rgba(40,47,69,0.34)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.18)]"><div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5"><div><div className="text-xs uppercase tracking-[0.28em] text-slate-400">{modal === 'tratados' ? 'Títulos A Vencer' : modal === 'vencidos' ? 'Títulos Vencidos' : modal === 'negociacao' ? modoNegociacao === 'retomar' ? 'Retomar negociação' : 'Nova negociação' : negociacaoResumo?.status_negociacao === 'inadimplente' ? 'Negociação inadimplente' : 'Negociação ativa'}</div><h2 className="mt-2 text-2xl font-semibold text-white">{clienteModal?.razao_social || '-'}</h2><div className="mt-2 text-sm text-slate-400">{clienteModal?.cnpj_cpf || '-'}</div></div><button onClick={() => setModal(null)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm">Fechar</button></div>{modal === 'tratados' && <div className="mt-5 grid gap-3">{tratados.map((t) => <div key={t.id} className="rounded-[24px] border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] p-5"><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4"><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Pedido</div><div className="mt-1 text-white">{t.numero_pedido || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Parcela</div><div className="mt-1 text-white">{t.numero_parcela || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Valor</div><div className="mt-1 text-white">{typeof t.valor_documento === 'number' ? money(t.valor_documento) : t.valor_documento || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Vencimento</div><div className="mt-1 text-white">{t.data_vencimento || '-'}</div></div></div></div>)}</div>}{modal === 'vencidos' && <div className="mt-5 grid gap-3">{vencidos.map((t) => <div key={t.id} className="rounded-[24px] border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-5"><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-6"><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Documento</div><div className="mt-1 text-white">{t.doc || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Status</div><div className="mt-1 text-white">{t.status || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Parcela</div><div className="mt-1">{t.parcela || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Valor</div><div className="mt-1">{t.valor_fatura ? money(parseMoney(t.valor_fatura)) : '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Emissão</div><div className="mt-1">{t.emissao || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Vencimento</div><div className="mt-1">{t.vencimento || '-'}</div></div></div></div>)}</div>}{modal === 'negociacao' && <div className="mt-5 grid gap-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><label className="grid gap-2 text-sm text-slate-300"><span>Total da dívida</span><input value={negociacaoValorTotal} onChange={(event) => setNegociacaoValorTotal(event.target.value)} placeholder="Ex: 3500,00" className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" /></label><label className="grid gap-2 text-sm text-slate-300"><span>Quantidade de parcelas</span><input type="number" min={1} value={negociacaoQuantidadeParcelas} onChange={(event) => setNegociacaoQuantidadeParcelas(event.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" /></label><label className="grid gap-2 text-sm text-slate-300"><span>Frequência</span><select value={negociacaoFrequencia} onChange={(event) => setNegociacaoFrequencia(event.target.value as FrequenciaNegociacao)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option></select></label><label className="grid gap-2 text-sm text-slate-300"><span>Dia da semana</span><select value={negociacaoDiaSemana} onChange={(event) => setNegociacaoDiaSemana(event.target.value as DiaSemanaNegociacao)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"><option value="segunda">Segunda-feira</option><option value="terca">Terça-feira</option><option value="quarta">Quarta-feira</option><option value="quinta">Quinta-feira</option><option value="sexta">Sexta-feira</option><option value="sabado">Sábado</option><option value="domingo">Domingo</option></select></label><label className="grid gap-2 text-sm text-slate-300"><span>Data inicial</span><input type="date" value={negociacaoDataInicio} onChange={(event) => setNegociacaoDataInicio(event.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none" /></label><label className="grid gap-2 text-sm text-slate-300"><span>Valor da parcela</span><input value={negociacaoValorParcela} onChange={(event) => setNegociacaoValorParcela(event.target.value)} placeholder="Opcional. Ex: 500,00" className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" /></label></div><label className="grid gap-2 text-sm text-slate-300"><span>Observações</span><textarea value={negociacaoObservacoes} onChange={(event) => setNegociacaoObservacoes(event.target.value)} rows={4} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500" placeholder="Observações da negociação" /></label><div className="rounded-[24px] border border-[rgba(254,132,146,0.2)] bg-[rgba(254,132,146,0.08)] p-4 text-sm text-slate-200">{modoNegociacao === 'retomar' ? 'Você está retomando uma negociação inadimplente. O sistema vai atualizar a negociação existente, preservar parcelas pagas e recriar apenas as parcelas pendentes conforme o novo acordo.' : 'Este primeiro bloco cria a negociação ativa, gera as parcelas iniciais e marca o cliente como em negociação.'} {negociacaoValorParcela.trim() ? 'Quando o valor da parcela for informado, o sistema gera a quantidade desejada nesse valor e cria uma parcela final extra apenas com a diferença restante, se houver.' : ''}</div><div className="flex flex-wrap justify-end gap-3"><button onClick={() => setModal(null)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm">Cancelar</button><button onClick={() => void criarNegociacao()} disabled={salvandoNegociacao} className={`rounded-2xl px-4 py-3 text-sm font-medium text-white ${salvandoNegociacao ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-[rgba(254,132,146,0.92)]'}`}>{salvandoNegociacao ? modoNegociacao === 'retomar' ? 'Retomando...' : 'Criando...' : modoNegociacao === 'retomar' ? 'Retomar negociação' : 'Criar negociação'}</button></div></div>}{modal === 'negociacao_detalhe' && <div className="mt-5 grid gap-5">{carregandoNegociacao && <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-6 text-sm text-slate-300">Carregando negociação...</div>}{!carregandoNegociacao && negociacaoResumo && <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><div className="rounded-2xl border border-[rgba(254,132,146,0.2)] bg-[rgba(254,132,146,0.1)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffe1e4]/80">Total da dívida</div><div className="mt-2 text-2xl font-semibold text-white">{money(Number(negociacaoResumo.valor_total_divida || 0))}</div></div><div className="rounded-2xl border border-[rgba(81,150,206,0.2)] bg-[rgba(81,150,206,0.1)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Total pago</div><div className="mt-2 text-2xl font-semibold text-white">{money(Number(negociacaoResumo.valor_total_pago || 0))}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Parcelas pagas</div><div className="mt-2 text-2xl font-semibold text-white">{negociacaoResumo.parcelas_pagas || 0}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Parcelas pendentes</div><div className="mt-2 text-2xl font-semibold text-white">{negociacaoResumo.parcelas_pendentes || 0}</div></div><div className="rounded-2xl border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.1)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Parcelas vencidas</div><div className="mt-2 text-2xl font-semibold text-white">{negociacaoResumo.parcelas_vencidas || 0}</div></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Frequência</div><div className="mt-2 text-lg font-medium text-white">{negociacaoResumo.frequencia}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Quantidade de parcelas</div><div className="mt-2 text-lg font-medium text-white">{negociacaoResumo.quantidade_parcelas}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Próximo vencimento</div><div className="mt-2 text-lg font-medium text-white">{negociacaoResumo.proximo_vencimento || '-'}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Status</div><div className="mt-2 text-lg font-medium text-white">{negociacaoResumo.status_negociacao}</div></div></div><div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-4"><div className="text-sm text-slate-300">{negociacaoResumo.observacoes || 'Sem observações registradas.'}</div>{perfil?.perfil === 'master' && negociacaoResumo.status_negociacao === 'ativa' && <div className="flex flex-wrap gap-2"><button onClick={() => void finalizarNegociacao('quitada')} disabled={finalizandoNegociacao !== null} className={`rounded-xl px-3 py-2 text-sm font-medium text-white ${finalizandoNegociacao === 'quitada' ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-emerald-600'}`}>{finalizandoNegociacao === 'quitada' ? 'Salvando...' : 'Quitar negociação'}</button><button onClick={() => void finalizarNegociacao('cancelada')} disabled={finalizandoNegociacao !== null} className={`rounded-xl px-3 py-2 text-sm font-medium text-white ${finalizandoNegociacao === 'cancelada' ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-amber-600'}`}>{finalizandoNegociacao === 'cancelada' ? 'Salvando...' : 'Cancelar negociação'}</button><button onClick={() => void finalizarNegociacao('inadimplente')} disabled={finalizandoNegociacao !== null} className={`rounded-xl px-3 py-2 text-sm font-medium text-white ${finalizandoNegociacao === 'inadimplente' ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-[rgba(164,37,39,0.92)]'}`}>{finalizandoNegociacao === 'inadimplente' ? 'Salvando...' : 'Marcar inadimplente'}</button></div>}</div>{perfil?.perfil === 'master' && negociacaoResumo.status_negociacao === 'inadimplente' && <button onClick={refazerNegociacaoAtual} className="mb-4 w-full rounded-2xl border border-[rgba(254,132,146,0.32)] bg-[rgba(254,132,146,0.2)] px-5 py-4 text-base font-medium text-[#ffe1e4]">Refazer negociação</button>}<div className="grid gap-3">{negociacaoParcelas.map((parcela) => <div key={parcela.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-8"><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Parcela</div><div className="mt-1 text-white">{parcela.numero_parcela}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Vencimento</div><div className="mt-1 text-white">{parcela.vencimento}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Valor</div><div className="mt-1 text-white">{money(Number(parcela.valor_parcela || 0))}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Status</div><div className="mt-1 text-white">{parcela.status_parcela}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Valor pago</div>{perfil?.perfil === 'master' && negociacaoResumo.status_negociacao === 'ativa' ? <input value={valorPagoParcelas[parcela.id] || ''} onChange={(event) => setValorPagoParcelas((state) => ({ ...state, [parcela.id]: event.target.value }))} placeholder="0,00" className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" /> : <div className="mt-1 text-white">{parcela.valor_pago ? money(Number(parcela.valor_pago)) : '-'}</div>}</div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Pago em</div>{perfil?.perfil === 'master' && negociacaoResumo.status_negociacao === 'ativa' ? <input type="date" value={pagoEmParcelas[parcela.id] || ''} onChange={(event) => setPagoEmParcelas((state) => ({ ...state, [parcela.id]: event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none" /> : <div className="mt-1 text-white">{parcela.pago_em || '-'}</div>}</div><div className="xl:col-span-2 flex items-end">{perfil?.perfil === 'master' && negociacaoResumo.status_negociacao === 'ativa' ? <button onClick={() => void salvarParcelaNegociacao(parcela)} disabled={salvandoParcelaId === parcela.id} className={`w-full rounded-xl px-4 py-2 text-sm font-medium text-white ${salvandoParcelaId === parcela.id ? 'cursor-not-allowed bg-white/10 text-slate-400' : 'bg-[rgba(81,150,206,0.92)]'}`}>{salvandoParcelaId === parcela.id ? 'Salvando...' : 'Aplicar pagamento'}</button> : <div className="text-sm text-slate-400">Resumo final</div>}</div></div></div>)}</div></div></>}</div>}</div></div>}
    </main>
  )
}
