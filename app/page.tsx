'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const supabase = createSupabaseClient()

const ITENS_POR_PAGINA = 20
const TABELA_TITULOS_VENCIDOS = 'clientes_meta'

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
}

type PerfilUsuario = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
}

type TituloTratado = {
  id: string
  numero_pedido: string | null
  numero_parcela: string | null
  valor_documento: number | string | null
  data_emissao: string | null
  data_vencimento: string | null
  tipo_fluxo: string | null
  status_envio: string | null
  mensagem_enviada_em: string | null
}

type TituloVencido = {
  id: string
  doc: string | null
  status: string | null
  parcela: string | null
  emissao: string | null
  vencimento: string | null
  valor_fatura: string | null
  valor_desconto: string | null
  valor_recebido: string | null
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

  if (typeof payload === 'object') return payload

  return null
}

function extrairTitulosVencidos(payload: unknown): TituloVencido[] {
  const dados = parsePayload(payload)

  if (!dados || !Array.isArray((dados as any).titulos)) return []

  return (dados as any).titulos.map((item: any, index: number) => ({
    id: `${item?.doc || 'sem-doc'}-${index}`,
    doc: item?.doc || null,
    status: item?.status || null,
    parcela: item?.parcela || null,
    emissao: item?.emissao || null,
    vencimento: item?.vencimento || null,
    valor_fatura: item?.valor_fatura || null,
    valor_desconto: item?.valor_desconto || null,
    valor_recebido: item?.valor_recebido || null,
  }))
}

function parseValorMoeda(valor: string | null | undefined) {
  if (!valor) return 0

  const limpo = valor
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const numero = Number(limpo)
  return Number.isFinite(numero) ? numero : 0
}

function formatarMoedaBR(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

export default function Home() {
  const router = useRouter()

  const [status, setStatus] = useState('Carregando clientes...')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [perfilUsuario, setPerfilUsuario] = useState<PerfilUsuario | null>(null)
  const [saindo, setSaindo] = useState(false)

  const [busca, setBusca] = useState('')
  const [filtroRegua, setFiltroRegua] = useState('todos')
  const [filtroTitulos, setFiltroTitulos] = useState('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [paginaAtual, setPaginaAtual] = useState(1)

  const [clienteSelecionadoTratados, setClienteSelecionadoTratados] = useState<Cliente | null>(null)
  const [titulosTratados, setTitulosTratados] = useState<TituloTratado[]>([])
  const [carregandoTratados, setCarregandoTratados] = useState(false)
  const [erroTratados, setErroTratados] = useState<string | null>(null)
  const [modalTratadosAberto, setModalTratadosAberto] = useState(false)

  const [clienteSelecionadoVencidos, setClienteSelecionadoVencidos] = useState<Cliente | null>(null)
  const [titulosVencidos, setTitulosVencidos] = useState<TituloVencido[]>([])
  const [carregandoVencidos, setCarregandoVencidos] = useState(false)
  const [erroVencidos, setErroVencidos] = useState<string | null>(null)
  const [modalVencidosAberto, setModalVencidosAberto] = useState(false)

  async function sair() {
    setSaindo(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function carregarClientes() {
    setErro(null)
    setStatus('Carregando clientes...')

    const {
      data: { user },
      error: erroAuth,
    } = await supabase.auth.getUser()

    if (erroAuth || !user) {
      setErro('Sessão inválida. Faça login novamente.')
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    const { data: perfil, error: erroPerfil } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, email, nome, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single()

    if (erroPerfil || !perfil) {
      setErro('Usuário sem acesso à dashboard.')
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    if (perfil.ativo !== true) {
      setErro('Usuário inativo.')
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    setPerfilUsuario(perfil)

    const { data: titulosBase, error: erroTitulosBase } = await supabase
      .schema('omie_core')
      .from('regua_dia_vencimento')
      .select('cnpj_cpf')
      .not('cnpj_cpf', 'is', null)

    if (erroTitulosBase) {
      setErro(erroTitulosBase.message)
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    const cnpjsComTitulo = new Set(
      (titulosBase || [])
        .map((item) => item.cnpj_cpf)
        .filter((cnpj): cnpj is string => !!cnpj)
    )

    const { data: clientesMeta, error: erroClientesMeta } = await supabase
      .schema('omie_core')
      .from(TABELA_TITULOS_VENCIDOS)
      .select('id, cnpj_cpf, payload_json')
      .order('id', { ascending: false })

    if (erroClientesMeta) {
      setErro(erroClientesMeta.message)
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    const mapaVencidos = new Map<string, { quantidade: number; total: number }>()

    for (const item of clientesMeta || []) {
      const cnpj = item.cnpj_cpf || ''
      if (!cnpj || mapaVencidos.has(cnpj)) continue

      const titulos = extrairTitulosVencidos(item.payload_json)
      const total = titulos.reduce(
        (soma, titulo) => soma + parseValorMoeda(titulo.valor_fatura),
        0
      )

      mapaVencidos.set(cnpj, {
        quantidade: titulos.length,
        total,
      })
    }

    let queryClientes = supabase
      .schema('omie_core')
      .from('clientes')
      .select(
        'id, razao_social, cnpj_cpf, whatsapp, contato, ativo, nome_vendedor_padrao_snapshot, cliente_desbloqueado_regua'
      )

    if (perfil.perfil !== 'master') {
      queryClientes = queryClientes.eq(
        'nome_vendedor_padrao_snapshot',
        perfil.nome_vendedor || ''
      )
    }

    const { data, error } = await queryClientes.order('razao_social', {
      ascending: true,
    })

    if (error) {
      setErro(error.message)
      setStatus('Erro ao carregar')
      setClientes([])
      return
    }

    const clientesTratados = (data || []).map((cliente) => {
      const vencidos = mapaVencidos.get(cliente.cnpj_cpf || '')

      return {
        ...cliente,
        tem_titulo: !!cliente.cnpj_cpf && cnpjsComTitulo.has(cliente.cnpj_cpf),
        qtd_titulos_vencidos: vencidos?.quantidade || 0,
        valor_total_titulos_vencidos: vencidos?.total || 0,
      }
    })

    setClientes(clientesTratados)
    setStatus(`Clientes carregados: ${clientesTratados.length}`)
  }

  async function alternarRegua(cliente: Cliente) {
    const novoValor = !(cliente.cliente_desbloqueado_regua === true)

    const { data, error } = await supabase
      .schema('omie_core')
      .from('clientes')
      .update({ cliente_desbloqueado_regua: novoValor })
      .eq('id', cliente.id)
      .select('id, cliente_desbloqueado_regua')
      .single()

    if (error) {
      alert(`Erro ao atualizar: ${error.message}`)
      return
    }

    setClientes((listaAtual) =>
      listaAtual.map((item) =>
        item.id === cliente.id
          ? {
              ...item,
              cliente_desbloqueado_regua: data?.cliente_desbloqueado_regua ?? novoValor,
            }
          : item
      )
    )

    if (clienteSelecionadoTratados?.id === cliente.id) {
      setClienteSelecionadoTratados((atual) =>
        atual
          ? {
              ...atual,
              cliente_desbloqueado_regua: data?.cliente_desbloqueado_regua ?? novoValor,
            }
          : atual
      )
    }

    if (clienteSelecionadoVencidos?.id === cliente.id) {
      setClienteSelecionadoVencidos((atual) =>
        atual
          ? {
              ...atual,
              cliente_desbloqueado_regua: data?.cliente_desbloqueado_regua ?? novoValor,
            }
          : atual
      )
    }
  }

  async function abrirTitulosTratados(cliente: Cliente) {
    setClienteSelecionadoTratados(cliente)
    setTitulosTratados([])
    setErroTratados(null)
    setCarregandoTratados(true)
    setModalTratadosAberto(true)

    if (!cliente.cnpj_cpf) {
      setErroTratados('Cliente sem CNPJ/CPF para buscar títulos.')
      setCarregandoTratados(false)
      return
    }

    const { data, error } = await supabase
      .schema('omie_core')
      .from('regua_dia_vencimento')
      .select(
        'id, numero_pedido, numero_parcela, valor_documento, data_emissao, data_vencimento, tipo_fluxo, status_envio, mensagem_enviada_em'
      )
      .eq('cnpj_cpf', cliente.cnpj_cpf)
      .order('data_vencimento', { ascending: true })

    if (error) {
      setErroTratados(error.message)
      setCarregandoTratados(false)
      return
    }

    setTitulosTratados(data || [])
    setCarregandoTratados(false)
  }

  async function abrirTitulosVencidos(cliente: Cliente) {
    setClienteSelecionadoVencidos(cliente)
    setTitulosVencidos([])
    setErroVencidos(null)
    setCarregandoVencidos(true)
    setModalVencidosAberto(true)

    if (!cliente.cnpj_cpf) {
      setErroVencidos('Cliente sem CNPJ/CPF para buscar títulos vencidos.')
      setCarregandoVencidos(false)
      return
    }

    const { data, error } = await supabase
      .schema('omie_core')
      .from(TABELA_TITULOS_VENCIDOS)
      .select('id, payload_json')
      .eq('cnpj_cpf', cliente.cnpj_cpf)
      .order('id', { ascending: false })
      .limit(1)

    if (error) {
      setErroVencidos(error.message)
      setCarregandoVencidos(false)
      return
    }

    const registro = data && data.length > 0 ? data[0] : null
    const lista = extrairTitulosVencidos(registro?.payload_json)

    setTitulosVencidos(lista)
    setCarregandoVencidos(false)
  }

  function fecharModalTratados() {
    setModalTratadosAberto(false)
    setClienteSelecionadoTratados(null)
    setTitulosTratados([])
    setErroTratados(null)
  }

  function fecharModalVencidos() {
    setModalVencidosAberto(false)
    setClienteSelecionadoVencidos(null)
    setTitulosVencidos([])
    setErroVencidos(null)
  }

  const vendedores = useMemo(() => {
    if (perfilUsuario?.perfil !== 'master') return []

    return Array.from(
      new Set(
        clientes
          .map((cliente) => cliente.nome_vendedor_padrao_snapshot)
          .filter((vendedor): vendedor is string => !!vendedor)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [clientes, perfilUsuario])

  const clientesFiltrados = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase()

    return clientes.filter((cliente) => {
      const textoBusca = [
        cliente.razao_social || '',
        cliente.cnpj_cpf || '',
        cliente.whatsapp || '',
      ]
        .join(' ')
        .toLowerCase()

      const passouBusca =
        buscaNormalizada === '' || textoBusca.includes(buscaNormalizada)

      const passouRegua =
        filtroRegua === 'todos'
          ? true
          : filtroRegua === 'liberados'
            ? cliente.cliente_desbloqueado_regua === true
            : cliente.cliente_desbloqueado_regua !== true

      const passouTitulos =
        filtroTitulos === 'todos'
          ? true
          : filtroTitulos === 'tratados'
            ? cliente.tem_titulo === true
            : (cliente.qtd_titulos_vencidos || 0) > 0

      const passouVendedor =
        perfilUsuario?.perfil !== 'master'
          ? true
          : filtroVendedor === 'todos'
            ? true
            : (cliente.nome_vendedor_padrao_snapshot || '') === filtroVendedor

      return passouBusca && passouRegua && passouTitulos && passouVendedor
    })
  }, [clientes, busca, filtroRegua, filtroTitulos, filtroVendedor, perfilUsuario])

  const totalPaginas = Math.max(
    1,
    Math.ceil(clientesFiltrados.length / ITENS_POR_PAGINA)
  )

  const clientesPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA
    const fim = inicio + ITENS_POR_PAGINA
    return clientesFiltrados.slice(inicio, fim)
  }, [clientesFiltrados, paginaAtual])

  useEffect(() => {
    carregarClientes()
  }, [])

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtroRegua, filtroTitulos, filtroVendedor])

  useEffect(() => {
    if (paginaAtual > totalPaginas) {
      setPaginaAtual(totalPaginas)
    }
  }, [paginaAtual, totalPaginas])

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif', color: '#111' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0 }}>Régua Prime Frios</h1>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {perfilUsuario?.perfil === 'master' && (
            <button
              onClick={() => router.push('/usuarios')}
              style={{
                padding: '10px 14px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                backgroundColor: '#1d4ed8',
                color: '#fff',
              }}
            >
              Gerenciar usuários
            </button>
          )}

          <button
            onClick={sair}
            disabled={saindo}
            style={{
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              cursor: saindo ? 'not-allowed' : 'pointer',
              backgroundColor: saindo ? '#999' : '#444',
              color: '#fff',
            }}
          >
            {saindo ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </div>

      <p>{status}</p>

      {perfilUsuario && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 10,
            backgroundColor: '#fff',
          }}
        >
          <div><strong>Usuário:</strong> {perfilUsuario.nome || perfilUsuario.email || '-'}</div>
          <div><strong>Perfil:</strong> {perfilUsuario.perfil}</div>
          <div>
            <strong>Vendedor:</strong>{' '}
            {perfilUsuario.perfil === 'master'
              ? 'Todos'
              : perfilUsuario.nome_vendedor || '-'}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          marginBottom: 20,
          padding: 16,
          border: '1px solid #ddd',
          borderRadius: 10,
          backgroundColor: '#fff',
        }}
      >
        <input
          type="text"
          placeholder="Buscar por razão social, CNPJ ou WhatsApp"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            padding: 10,
            border: '1px solid #ccc',
            borderRadius: 8,
          }}
        />

        <select
          value={filtroRegua}
          onChange={(e) => setFiltroRegua(e.target.value)}
          style={{
            padding: 10,
            border: '1px solid #ccc',
            borderRadius: 8,
          }}
        >
          <option value="todos">Régua: todos</option>
          <option value="liberados">Régua: liberados</option>
          <option value="bloqueados">Régua: bloqueados</option>
        </select>

        <select
          value={filtroTitulos}
          onChange={(e) => setFiltroTitulos(e.target.value)}
          style={{
            padding: 10,
            border: '1px solid #ccc',
            borderRadius: 8,
          }}
        >
          <option value="todos">Títulos: todos</option>
          <option value="tratados">Com títulos tratados</option>
          <option value="vencidos">Com títulos vencidos</option>
        </select>

        {perfilUsuario?.perfil === 'master' && (
          <select
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            style={{
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          >
            <option value="todos">Vendedor: todos</option>
            {vendedores.map((vendedor) => (
              <option key={vendedor} value={vendedor}>
                {vendedor}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <strong>Total filtrado:</strong> {clientesFiltrados.length}
      </div>

      {erro && (
        <div style={{ marginBottom: 16, color: 'red' }}>
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {clientesFiltrados.length === 0 && !erro && (
        <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
          Nenhum cliente encontrado.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {clientesPaginados.map((cliente) => (
          <div
            key={cliente.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <div><strong>Razão social:</strong> {cliente.razao_social || '-'}</div>
            <div><strong>CNPJ:</strong> {cliente.cnpj_cpf || '-'}</div>
            <div><strong>WhatsApp:</strong> {cliente.whatsapp || '-'}</div>
            <div><strong>Contato:</strong> {cliente.contato || '-'}</div>
            <div><strong>Vendedor:</strong> {cliente.nome_vendedor_padrao_snapshot || '-'}</div>
            <div><strong>Cadastro ativo:</strong> {cliente.ativo === true ? 'Sim' : 'Não'}</div>
            <div><strong>Tem Títulos Vencidos:</strong> {cliente.qtd_titulos_vencidos || 0}</div>
            <div>
              <strong>Valor total dos Títulos Vencidos:</strong>{' '}
              {formatarMoedaBR(cliente.valor_total_titulos_vencidos || 0)}
            </div>
            <div>
              <strong>Régua liberada:</strong>{' '}
              {cliente.cliente_desbloqueado_regua === true ? 'Sim' : 'Não'}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => alternarRegua(cliente)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor:
                    cliente.cliente_desbloqueado_regua === true ? '#b91c1c' : '#15803d',
                  color: '#fff',
                }}
              >
                {cliente.cliente_desbloqueado_regua === true
                  ? 'Bloquear régua'
                  : 'Liberar régua'}
              </button>

              <button
                onClick={() => abrirTitulosTratados(cliente)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: '#1d4ed8',
                  color: '#fff',
                }}
              >
                Ver títulos tratados
              </button>

              <button
                onClick={() => abrirTitulosVencidos(cliente)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: '#7c3aed',
                  color: '#fff',
                }}
              >
                Ver títulos vencidos
              </button>
            </div>
          </div>
        ))}
      </div>

      {clientesFiltrados.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 20,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
            disabled={paginaAtual === 1}
            style={{
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              cursor: paginaAtual === 1 ? 'not-allowed' : 'pointer',
              backgroundColor: paginaAtual === 1 ? '#ccc' : '#444',
              color: '#fff',
            }}
          >
            Anterior
          </button>

          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>

          <button
            onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
            disabled={paginaAtual === totalPaginas}
            style={{
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              cursor: paginaAtual === totalPaginas ? 'not-allowed' : 'pointer',
              backgroundColor: paginaAtual === totalPaginas ? '#ccc' : '#444',
              color: '#fff',
            }}
          >
            Próxima
          </button>
        </div>
      )}

      {modalTratadosAberto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1000,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Títulos tratados</h2>
                <div style={{ marginTop: 6 }}>
                  <strong>{clienteSelecionadoTratados?.razao_social || '-'}</strong>
                </div>
                <div>{clienteSelecionadoTratados?.cnpj_cpf || '-'}</div>
              </div>

              <button
                onClick={fecharModalTratados}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: '#444',
                  color: '#fff',
                }}
              >
                Fechar
              </button>
            </div>

            {carregandoTratados && <p>Carregando títulos tratados...</p>}

            {erroTratados && (
              <div style={{ color: 'red', marginBottom: 12 }}>
                <strong>Erro:</strong> {erroTratados}
              </div>
            )}

            {!carregandoTratados && !erroTratados && titulosTratados.length === 0 && (
              <div>Nenhum título tratado encontrado para este cliente.</div>
            )}

            {!carregandoTratados && !erroTratados && titulosTratados.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {titulosTratados.map((titulo) => (
                  <div
                    key={titulo.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      padding: 14,
                      backgroundColor: '#fafafa',
                    }}
                  >
                    <div><strong>Pedido:</strong> {titulo.numero_pedido || '-'}</div>
                    <div><strong>Parcela:</strong> {titulo.numero_parcela || '-'}</div>
                    <div><strong>Valor:</strong> {titulo.valor_documento || '-'}</div>
                    <div><strong>Emissão:</strong> {titulo.data_emissao || '-'}</div>
                    <div><strong>Vencimento:</strong> {titulo.data_vencimento || '-'}</div>
                    <div><strong>Fluxo:</strong> {titulo.tipo_fluxo || '-'}</div>
                    <div><strong>Status envio:</strong> {titulo.status_envio || '-'}</div>
                    <div>
                      <strong>Mensagem enviada em:</strong> {titulo.mensagem_enviada_em || '-'}
                    </div>
                    <div>
                      <strong>Régua:</strong>{' '}
                      {clienteSelecionadoTratados?.cliente_desbloqueado_regua === true
                        ? 'Desbloqueado'
                        : 'Bloqueado'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modalVencidosAberto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1000,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Títulos vencidos</h2>
                <div style={{ marginTop: 6 }}>
                  <strong>{clienteSelecionadoVencidos?.razao_social || '-'}</strong>
                </div>
                <div>{clienteSelecionadoVencidos?.cnpj_cpf || '-'}</div>
              </div>

              <button
                onClick={fecharModalVencidos}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  backgroundColor: '#444',
                  color: '#fff',
                }}
              >
                Fechar
              </button>
            </div>

            {carregandoVencidos && <p>Carregando títulos vencidos...</p>}

            {erroVencidos && (
              <div style={{ color: 'red', marginBottom: 12 }}>
                <strong>Erro:</strong> {erroVencidos}
              </div>
            )}

            {!carregandoVencidos && !erroVencidos && titulosVencidos.length === 0 && (
              <div>Não há títulos vencidos para este cliente.</div>
            )}

            {!carregandoVencidos && !erroVencidos && titulosVencidos.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                {titulosVencidos.map((titulo) => (
                  <div
                    key={titulo.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      padding: 14,
                      backgroundColor: '#fafafa',
                    }}
                  >
                    <div><strong>Documento:</strong> {titulo.doc || '-'}</div>
                    <div><strong>Status:</strong> {titulo.status || '-'}</div>
                    <div><strong>Parcela:</strong> {titulo.parcela || '-'}</div>
                    <div><strong>Emissão:</strong> {titulo.emissao || '-'}</div>
                    <div><strong>Vencimento:</strong> {titulo.vencimento || '-'}</div>
                    <div><strong>Valor fatura:</strong> {titulo.valor_fatura || '-'}</div>
                    <div><strong>Valor desconto:</strong> {titulo.valor_desconto || '-'}</div>
                    <div><strong>Valor recebido:</strong> {titulo.valor_recebido || '-'}</div>
                    <div>
                      <strong>Régua:</strong>{' '}
                      {clienteSelecionadoVencidos?.cliente_desbloqueado_regua === true
                        ? 'Desbloqueado'
                        : 'Bloqueado'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}