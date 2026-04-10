'use client'

import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const supabase = createSupabaseClient()
const PAGE_SIZE = 10
const VENCIDOS = 'clientes_meta'

type Etapa = 'dia_vencimento' | 'vencido_3_mais' | 'vencido_6_mais' | 'fora_regua'
type Cliente = {
  id: string
  razao_social: string | null
  cnpj_cpf: string | null
  whatsapp: string | null
  contato: string | null
  ativo: boolean | null
  nome_vendedor_padrao_snapshot: string | null
  cliente_desbloqueado_regua: boolean | null
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

function parsePayload(payload: unknown) {
  if (!payload) return null
  if (typeof payload === 'string') try { return JSON.parse(payload) } catch { return null }
  return typeof payload === 'object' ? payload : null
}

function parseMoney(v?: string | number | null) {
  if (!v) return 0

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0
  }

  const n = Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function normalizeDoc(v?: string | null) {
  return (v || '').replace(/\D/g, '')
}

function parseDate(v?: string | null) {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(`${v.slice(0, 10)}T00:00:00`)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split('/')
    return new Date(`${y}-${m}-${d}T00:00:00`)
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysLate(v?: string | null) {
  const d = parseDate(v)
  if (!d) return 0
  const h = new Date(); h.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0)
  return Math.floor((h.getTime() - d.getTime()) / 86400000)
}

function titulos(payload: unknown): TituloVencido[] {
  const data = parsePayload(payload) as { titulos?: Array<Record<string, unknown>> } | null
  if (!data?.titulos) return []
  return data.titulos.map((t, i) => ({
    id: `${String(t.doc || 'sem-doc')}-${i}`,
    doc: String(t.doc || ''),
    status: String(t.status || ''),
    parcela: String(t.parcela || ''),
    emissao: String(t.emissao || ''),
    vencimento: String(t.vencimento || ''),
    valor_fatura: String(t.valor_fatura || ''),
  }))
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
  const [filtroTitulos, setFiltroTitulos] = useState('todos')
  const [filtroEtapa, setFiltroEtapa] = useState<Etapa | 'todos'>('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [saindo, setSaindo] = useState(false)
  const [modal, setModal] = useState<'tratados' | 'vencidos' | null>(null)
  const [clienteModal, setClienteModal] = useState<Cliente | null>(null)
  const [tratados, setTratados] = useState<TituloTratado[]>([])
  const [vencidos, setVencidos] = useState<TituloVencido[]>([])
  const [resumoVencidosFonte, setResumoVencidosFonte] = useState<ResumoVencidos>({
    total: 0,
    inadimplentes: 0,
  })

  async function carregar(silencioso = false) {
    if (!silencioso) {
      setStatus('Carregando carteira...')
    }
    setErro(null)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return setErro('Sessão inválida.')

    const { data: perfilData, error: perfilErr } = await supabase.schema('omie_core').from('usuarios_dashboard').select('id, email, nome, perfil, nome_vendedor, ativo').eq('id', user.id).single()
    if (perfilErr || !perfilData || perfilData.ativo !== true) return setErro('Usuário sem acesso.')
    setPerfil(perfilData)

    const { data: baseRegua, error: baseErr } = await supabase
      .schema('omie_core')
      .from('regua_dia_vencimento')
      .select('cnpj_cpf, data_vencimento, valor_documento')
      .not('cnpj_cpf', 'is', null)
    if (baseErr) return setErro(baseErr.message)

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const comTitulo = new Set(
      (baseRegua || []).map((i) => normalizeDoc(i.cnpj_cpf)).filter(Boolean)
    )
    const hojeSet = new Set(
      (baseRegua || [])
        .filter((i) => {
          const d = parseDate(i.data_vencimento)
          if (!d) return false
          d.setHours(0, 0, 0, 0)
          return d.getTime() === hoje.getTime()
        })
        .map((i) => normalizeDoc(i.cnpj_cpf))
        .filter(Boolean)
    )
    const mapaAVencer = new Map<string, number>()
    for (const item of baseRegua || []) {
      const cnpj = normalizeDoc(item.cnpj_cpf)
      if (!cnpj) continue
      mapaAVencer.set(cnpj, (mapaAVencer.get(cnpj) || 0) + parseMoney(item.valor_documento))
    }

    const { data: meta, error: metaErr } = await supabase.schema('omie_core').from(VENCIDOS).select('id, cnpj_cpf, payload_json').order('id', { ascending: false })
    if (metaErr) return setErro(metaErr.message)

    const mapa = new Map<string, { qtd: number; total: number; atraso: number }>()
    let totalVencidoFonte = 0
    let inadimplentesFonte = 0
    for (const item of meta || []) {
      const cnpj = normalizeDoc(item.cnpj_cpf)
      if (!cnpj || mapa.has(cnpj)) continue
      const lista = titulos(item.payload_json)
      const total = lista.reduce((s, t) => s + parseMoney(t.valor_fatura), 0)
      mapa.set(cnpj, { qtd: lista.length, total, atraso: lista.reduce((m, t) => Math.max(m, daysLate(t.vencimento)), 0) })
      if (lista.length > 0) {
        inadimplentesFonte += 1
        totalVencidoFonte += total
      }
    }

    let query = supabase.schema('omie_core').from('clientes').select('id, razao_social, cnpj_cpf, whatsapp, contato, ativo, nome_vendedor_padrao_snapshot, cliente_desbloqueado_regua')
    if (perfilData.perfil !== 'master') query = query.eq('nome_vendedor_padrao_snapshot', perfilData.nome_vendedor || '')
    const { data: rows, error: cliErr } = await query.order('razao_social', { ascending: true })
    if (cliErr) return setErro(cliErr.message)

    const data = (rows || []).map((c) => {
      const cnpjNormalizado = normalizeDoc(c.cnpj_cpf)
      const resumo = mapa.get(cnpjNormalizado)
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
        ...c,
        tem_titulo: !!cnpjNormalizado && comTitulo.has(cnpjNormalizado),
        qtd_titulos_vencidos: resumo?.qtd || 0,
        valor_total_titulos_vencidos: resumo?.total || 0,
        valor_total_a_vencer: mapaAVencer.get(cnpjNormalizado) || 0,
        max_dias_atraso: atraso,
        etapa_regua: etapa,
      }
    })

    setClientes(data)
    setResumoVencidosFonte(
      perfilData.perfil === 'master'
        ? {
            total: totalVencidoFonte,
            inadimplentes: inadimplentesFonte,
          }
        : {
            total: data.reduce((s, c) => s + (c.valor_total_titulos_vencidos || 0), 0),
            inadimplentes: data.filter((c) => (c.qtd_titulos_vencidos || 0) > 0).length,
          }
    )
    const atualizadoEm = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())
    setStatus(`Carteira carregada: ${data.length} clientes · Atualizado às ${atualizadoEm}`)
  }

  async function toggleRegua(cliente: Cliente) {
    const novo = !(cliente.cliente_desbloqueado_regua === true)
    const { error } = await supabase.schema('omie_core').from('clientes').update({ cliente_desbloqueado_regua: novo }).eq('id', cliente.id)
    if (error) return alert(error.message)
    setClientes((list) => list.map((c) => c.id === cliente.id ? { ...c, cliente_desbloqueado_regua: novo } : c))
  }

  async function openTratados(cliente: Cliente) {
    setClienteModal(cliente); setModal('tratados'); setTratados([])
    const { data } = await supabase.schema('omie_core').from('regua_dia_vencimento').select('id, numero_pedido, numero_parcela, valor_documento, data_vencimento, status_envio').eq('cnpj_cpf', cliente.cnpj_cpf || '').order('data_vencimento', { ascending: true })
    setTratados(data || [])
  }

  async function openVencidos(cliente: Cliente) {
    setClienteModal(cliente); setModal('vencidos'); setVencidos([])
    const { data } = await supabase.schema('omie_core').from(VENCIDOS).select('payload_json').eq('cnpj_cpf', cliente.cnpj_cpf || '').order('id', { ascending: false }).limit(1)
    setVencidos(titulos(data?.[0]?.payload_json))
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
  }), [clientes, resumoVencidosFonte])

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
    const texto = [c.razao_social || '', c.cnpj_cpf || '', c.whatsapp || ''].join(' ').toLowerCase()
    const buscaOk = !buscaNow.trim() || texto.includes(buscaNow.toLowerCase())
    const reguaOk = filtroRegua === 'todos' ? true : filtroRegua === 'liberados' ? c.cliente_desbloqueado_regua === true : c.cliente_desbloqueado_regua !== true
    const tituloOk = filtroTitulos === 'todos' ? true : filtroTitulos === 'tratados' ? c.tem_titulo === true : (c.qtd_titulos_vencidos || 0) > 0
    const etapaOk = filtroEtapa === 'todos' ? true : c.etapa_regua === filtroEtapa
    const vendOk = perfil?.perfil !== 'master' ? true : filtroVendedor === 'todos' ? true : (c.nome_vendedor_padrao_snapshot || '') === filtroVendedor
    return buscaOk && reguaOk && tituloOk && etapaOk && vendOk
  }), [buscaNow, clientes, filtroEtapa, filtroRegua, filtroTitulos, filtroVendedor, perfil])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaAtual = useMemo(() => filtrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [filtrados, pagina])
  const recarregarAoVivo = useEffectEvent(() => {
    void carregar(true)
  })

  useEffect(() => { carregar() }, [])
  useEffect(() => { setPagina(1) }, [buscaNow, filtroRegua, filtroTitulos, filtroEtapa, filtroVendedor])
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por razão social, CNPJ ou WhatsApp"
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

              <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold text-white">Carteira operacional</h2><div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">{filtrados.length} clientes</div></div>{erro && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{erro}</div>}<div className="grid gap-4">{paginaAtual.map((c) => <article key={c.id} className="rounded-[26px] border border-white/10 bg-[rgba(40,47,69,0.24)] p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold text-white">{c.razao_social || '-'}</h3><span className={`rounded-full px-3 py-1 text-xs font-medium ${badge(c.etapa_regua || 'fora_regua')}`}>{etapaLabel(c.etapa_regua || 'fora_regua')}</span><span className={`rounded-full border px-3 py-1 text-xs ${c.cliente_desbloqueado_regua ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-[#ffd4da]'}`}>{c.cliente_desbloqueado_regua ? 'Régua liberada' : 'Régua bloqueada'}</span></div><div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4"><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">CNPJ / CPF</div><div className="mt-1">{c.cnpj_cpf || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">WhatsApp</div><div className="mt-1">{c.whatsapp || 'Não informado'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Contato</div><div className="mt-1">{c.contato || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Vendedor</div><div className="mt-1">{c.nome_vendedor_padrao_snapshot || '-'}</div></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Títulos A Vencer</div><div className="mt-2 text-2xl font-semibold text-white">{c.tem_titulo ? 'Sim' : 'Não'}</div></div><div className="rounded-2xl border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Títulos Vencidos</div><div className="mt-2 text-2xl font-semibold text-white">{c.qtd_titulos_vencidos || 0}</div></div><div className="rounded-2xl border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-4"><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Valor vencido</div><div className="mt-2 text-2xl font-semibold text-white">{money(c.valor_total_titulos_vencidos || 0)}</div></div></div></div><div className="grid gap-3 xl:w-[240px]"><button onClick={() => toggleRegua(c)} className={`rounded-2xl px-4 py-3 text-sm font-medium ${c.cliente_desbloqueado_regua ? 'bg-[rgba(164,37,39,0.92)] text-white' : 'bg-[rgba(81,150,206,0.92)] text-white'}`}>{c.cliente_desbloqueado_regua ? 'Bloquear régua' : 'Liberar régua'}</button><button onClick={() => openTratados(c)} className="rounded-2xl border border-[rgba(81,150,206,0.3)] bg-[rgba(81,150,206,0.14)] px-4 py-3 text-sm text-[#d7eeff]">Títulos A Vencer</button><button onClick={() => openVencidos(c)} className="rounded-2xl border border-[rgba(164,37,39,0.3)] bg-[rgba(164,37,39,0.14)] px-4 py-3 text-sm text-[#ffd4da]">Títulos Vencidos</button></div></div></article>)}</div><div className="mt-5 flex flex-wrap items-center justify-center gap-3"><button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1} className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm disabled:opacity-40">Anterior</button><span className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm text-slate-300">Página {pagina} de {totalPaginas}</span><button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm disabled:opacity-40">Próxima</button></div></section>
            </div>

            <aside className="space-y-6"><section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="text-xs uppercase tracking-[0.28em] text-slate-400">Perfil logado</div><div className="mt-4 grid gap-3"><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="text-sm text-slate-400">Usuário</div><div className="mt-1 font-medium text-white">{perfil?.nome || perfil?.email || '-'}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><div className="text-sm text-slate-400">Perfil</div><div className="mt-1 font-medium text-white">{perfil?.perfil || '-'}</div></div></div><div className="mt-4 grid gap-3">{perfil?.perfil === 'master' && <button onClick={() => router.push('/usuarios')} className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950">Gerenciar usuários</button>}<button onClick={async () => { setSaindo(true); await supabase.auth.signOut(); router.push('/login'); router.refresh() }} disabled={saindo} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm">{saindo ? 'Saindo...' : 'Encerrar sessão'}</button></div></section><section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5"><div className="text-xs uppercase tracking-[0.28em] text-slate-400">Pulso da régua</div><div className="mt-4 space-y-3">{[['Dia do vencimento', metricas.hoje, 'bg-cyan-400'], ['Vencido 3+', metricas.tres, 'bg-amber-400'], ['Vencido 6+', metricas.seis, 'bg-rose-500']].map(([t, v, cor]) => <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center justify-between gap-4"><div><div className="text-sm text-slate-300">{t}</div><div className="mt-2 text-2xl font-semibold text-white">{String(v)}</div></div><div className={`h-11 w-11 rounded-2xl ${cor}`} /></div></div>)}</div></section></aside>
          </div>
        </div>
      </div>

      {modal && <div onClick={() => setModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(40,24,32,0.42)] px-4 py-6 backdrop-blur-md"><div onClick={(event) => event.stopPropagation()} className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-[28px] border border-white/10 bg-[rgba(40,47,69,0.34)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.18)]"><div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5"><div><div className="text-xs uppercase tracking-[0.28em] text-slate-400">{modal === 'tratados' ? 'Títulos A Vencer' : 'Títulos Vencidos'}</div><h2 className="mt-2 text-2xl font-semibold text-white">{clienteModal?.razao_social || '-'}</h2><div className="mt-2 text-sm text-slate-400">{clienteModal?.cnpj_cpf || '-'}</div></div><button onClick={() => setModal(null)} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm">Fechar</button></div>{modal === 'tratados' && <div className="mt-5 grid gap-3">{tratados.map((t) => <div key={t.id} className="rounded-[24px] border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] p-5"><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4"><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Pedido</div><div className="mt-1 text-white">{t.numero_pedido || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Parcela</div><div className="mt-1 text-white">{t.numero_parcela || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Valor</div><div className="mt-1 text-white">{typeof t.valor_documento === 'number' ? money(t.valor_documento) : t.valor_documento || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#d8efff]/80">Vencimento</div><div className="mt-1 text-white">{t.data_vencimento || '-'}</div></div></div></div>)}</div>}{modal === 'vencidos' && <div className="mt-5 grid gap-3">{vencidos.map((t) => <div key={t.id} className="rounded-[24px] border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.14)] p-5"><div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-6"><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Documento</div><div className="mt-1 text-white">{t.doc || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Status</div><div className="mt-1 text-white">{t.status || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Parcela</div><div className="mt-1">{t.parcela || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Valor</div><div className="mt-1">{t.valor_fatura ? money(parseMoney(t.valor_fatura)) : '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Emissão</div><div className="mt-1">{t.emissao || '-'}</div></div><div><div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">Vencimento</div><div className="mt-1">{t.vencimento || '-'}</div></div></div></div>)}</div>}</div></div>}
    </main>
  )
}
