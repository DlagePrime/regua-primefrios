'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const supabase = createSupabaseClient()

type PerfilSistema = 'master' | 'vendedor'

type UsuarioDashboard = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
  criado_em: string
}

type PerfilUsuario = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
}

function perfilValido(perfil: string | null | undefined): perfil is PerfilSistema {
  return perfil === 'master' || perfil === 'vendedor'
}

function normalizarPerfil(perfil: string | null | undefined): PerfilSistema {
  return perfil === 'master' ? 'master' : 'vendedor'
}

function formatarData(data?: string | null) {
  if (!data) return '-'

  const parsed = new Date(data)
  if (Number.isNaN(parsed.getTime())) return data

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}

const inputClassName =
  'rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[rgba(81,150,206,0.5)] focus:bg-white/[0.1] focus:ring-1 focus:ring-[rgba(81,150,206,0.35)]'

const panelClassName =
  'rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.14)] backdrop-blur-xl'

export default function UsuariosPage() {
  const router = useRouter()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvandoStatusId, setSalvandoStatusId] = useState<string | null>(null)
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState<string | null>(null)
  const [salvandoSenhaId, setSalvandoSenhaId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const [perfilUsuario, setPerfilUsuario] = useState<PerfilUsuario | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioDashboard[]>([])
  const [vendedoresDisponiveis, setVendedoresDisponiveis] = useState<string[]>([])

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perfil, setPerfil] = useState<PerfilSistema>('vendedor')
  const [nomeVendedor, setNomeVendedor] = useState('')
  const [ativo, setAtivo] = useState(true)

  const [usuarioEditandoId, setUsuarioEditandoId] = useState<string | null>(null)
  const [perfilEdicao, setPerfilEdicao] = useState<PerfilSistema>('vendedor')
  const [nomeVendedorEdicao, setNomeVendedorEdicao] = useState('')
  const [novaSenhaEdicao, setNovaSenhaEdicao] = useState('')

  async function carregarPagina() {
    setCarregando(true)
    setErro(null)

    const {
      data: { user },
      error: erroAuth,
    } = await supabase.auth.getUser()

    if (erroAuth || !user) {
      router.push('/login')
      return
    }

    const { data: perfilLogado, error: erroPerfil } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, email, nome, perfil, nome_vendedor, ativo')
      .eq('id', user.id)
      .single()

    if (erroPerfil || !perfilLogado) {
      setErro('Usuário sem acesso.')
      setCarregando(false)
      return
    }

    if (perfilLogado.ativo !== true) {
      setErro('Usuário inativo.')
      setCarregando(false)
      return
    }

    if (perfilLogado.perfil !== 'master') {
      router.push('/')
      return
    }

    setPerfilUsuario(perfilLogado)

    const { data, error } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .select('id, email, nome, perfil, nome_vendedor, ativo, criado_em')
      .order('criado_em', { ascending: false })

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setUsuarios(data || [])

    const { data: vendedoresData } = await supabase
      .schema('omie_core')
      .from('clientes')
      .select('nome_vendedor_padrao_snapshot')
      .not('nome_vendedor_padrao_snapshot', 'is', null)

    setVendedoresDisponiveis(
      Array.from(
        new Set(
          (vendedoresData || [])
            .map((item) => item.nome_vendedor_padrao_snapshot?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    )
    setCarregando(false)
  }

  async function criarUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMensagem(null)
    setErro(null)
    setSalvando(true)

    const payload = {
      nome,
      email,
      password,
      perfil,
      nome_vendedor: perfil === 'vendedor' ? nomeVendedor.trim() : '',
      ativo,
    }

    if (
      perfil === 'vendedor' &&
      vendedoresDisponiveis.length > 0 &&
      !vendedoresDisponiveis.includes(nomeVendedor.trim())
    ) {
      setErro('Escolha um vendedor existente na base de clientes.')
      setSalvando(false)
      return
    }

    const response = await fetch('/api/usuarios/criar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao criar usuário.')
      setSalvando(false)
      return
    }

    setMensagem('Usuário criado com sucesso.')
    setNome('')
    setEmail('')
    setPassword('')
    setPerfil('vendedor')
    setNomeVendedor('')
    setAtivo(true)

    await carregarPagina()
    setSalvando(false)
  }

  async function alternarStatusUsuario(usuario: UsuarioDashboard) {
    setMensagem(null)
    setErro(null)

    if (perfilUsuario?.id === usuario.id) {
      setErro('Você não pode alterar o status do seu próprio usuário.')
      return
    }

    const novoStatus = !usuario.ativo
    setSalvandoStatusId(usuario.id)

    const response = await fetch(`/api/usuarios/${usuario.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ativo: novoStatus,
      }),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao atualizar status do usuário.')
      setSalvandoStatusId(null)
      return
    }

    setUsuarios((listaAtual) =>
      listaAtual.map((item) =>
        item.id === usuario.id
          ? {
              ...item,
              ativo: resultado.usuario?.ativo ?? novoStatus,
            }
          : item
      )
    )

    setMensagem(
      resultado.usuario?.ativo === true
        ? 'Usuário ativado com sucesso.'
        : 'Usuário desativado com sucesso.'
    )

    setSalvandoStatusId(null)
  }

  function iniciarEdicao(usuario: UsuarioDashboard) {
    setMensagem(null)
    setErro(null)
    setUsuarioEditandoId(usuario.id)
    setPerfilEdicao(normalizarPerfil(usuario.perfil))
    setNomeVendedorEdicao(usuario.nome_vendedor || '')
    setNovaSenhaEdicao('')
  }

  function cancelarEdicao() {
    setUsuarioEditandoId(null)
    setPerfilEdicao('vendedor')
    setNomeVendedorEdicao('')
    setNovaSenhaEdicao('')
  }

  async function salvarEdicaoUsuario(usuario: UsuarioDashboard) {
    setMensagem(null)
    setErro(null)

    if (perfilUsuario?.id === usuario.id) {
      setErro('Você não pode editar o seu próprio perfil por aqui.')
      return
    }

    if (perfilEdicao === 'vendedor' && !nomeVendedorEdicao.trim()) {
      setErro('Informe o vendedor vinculado.')
      return
    }

    if (
      perfilEdicao === 'vendedor' &&
      vendedoresDisponiveis.length > 0 &&
      !vendedoresDisponiveis.includes(nomeVendedorEdicao.trim())
    ) {
      setErro('Escolha um vendedor existente na base de clientes.')
      return
    }

    setSalvandoEdicaoId(usuario.id)

    const payload = {
      perfil: normalizarPerfil(perfilEdicao),
      nome_vendedor:
        perfilEdicao === 'vendedor' ? nomeVendedorEdicao.trim() : null,
    }

    const response = await fetch(`/api/usuarios/${usuario.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao atualizar usuário.')
      setSalvandoEdicaoId(null)
      return
    }

    setUsuarios((listaAtual) =>
      listaAtual.map((item) =>
        item.id === usuario.id
          ? {
              ...item,
              perfil: resultado.usuario?.perfil ?? payload.perfil,
              nome_vendedor:
                resultado.usuario?.nome_vendedor ??
                (payload.nome_vendedor === null ? null : payload.nome_vendedor),
            }
          : item
      )
    )

    setMensagem('Usuário atualizado com sucesso.')
    setUsuarioEditandoId(null)
    setPerfilEdicao('vendedor')
    setNomeVendedorEdicao('')
    setNovaSenhaEdicao('')
    setSalvandoEdicaoId(null)
  }

  async function trocarSenhaUsuario(usuario: UsuarioDashboard) {
    setMensagem(null)
    setErro(null)

    if (perfilUsuario?.id === usuario.id) {
      setErro('Você não pode trocar a sua própria senha por esta tela.')
      return
    }

    if (novaSenhaEdicao.trim().length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setSalvandoSenhaId(usuario.id)

    const response = await fetch(`/api/usuarios/${usuario.id}/senha`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: novaSenhaEdicao.trim(),
      }),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao atualizar senha do usuário.')
      setSalvandoSenhaId(null)
      return
    }

    setMensagem('Senha atualizada com sucesso.')
    setNovaSenhaEdicao('')
    setSalvandoSenhaId(null)
  }

  async function excluirUsuario(usuario: UsuarioDashboard) {
    setMensagem(null)
    setErro(null)

    if (perfilUsuario?.id === usuario.id) {
      setErro('Você não pode excluir o seu próprio usuário.')
      return
    }

    const confirmado = window.confirm(
      `Excluir o usuário ${usuario.nome || usuario.email || 'selecionado'}? Essa ação remove o acesso no Supabase Auth e no schema omie_core.`
    )

    if (!confirmado) return

    setExcluindoId(usuario.id)

    const response = await fetch(`/api/usuarios/${usuario.id}`, {
      method: 'DELETE',
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao excluir usuário.')
      setExcluindoId(null)
      return
    }

    setUsuarios((listaAtual) => listaAtual.filter((item) => item.id !== usuario.id))

    if (usuarioEditandoId === usuario.id) {
      cancelarEdicao()
    }

    setMensagem('Usuário excluído com sucesso.')
    setExcluindoId(null)
  }

  useEffect(() => {
    carregarPagina()
  }, [])

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
                    Gestão de usuários
                  </span>
                  <span className="rounded-full border border-[rgba(254,132,146,0.25)] bg-[rgba(254,132,146,0.14)] px-3 py-1 text-[#ffe1e4]">
                    Acesso master
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Controle de acesso no mesmo padrão da operação
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/80">
                  Cadastre, edite e acompanhe os usuários internos com a mesma
                  linguagem visual da dashboard principal, mantendo foco em
                  segurança, vínculo com vendedor e status de acesso.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-slate-200/80">
                  {carregando ? 'Carregando usuários...' : `${usuarios.length} usuários disponíveis`}
                </div>
                <button
                  onClick={() => router.push('/')}
                  className="rounded-2xl border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.14)] px-4 py-4 text-sm font-medium text-[#d7eeff] transition hover:bg-[rgba(81,150,206,0.2)]"
                >
                  Voltar para a dashboard
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-5 sm:px-8 xl:grid-cols-[minmax(0,1.45fr)_340px]">
            <div className="space-y-6">
              {mensagem && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {mensagem}
                </div>
              )}

              {erro && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {erro}
                </div>
              )}

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Total de usuários
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-white">{usuarios.length}</div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    Base completa da operação interna
                  </div>
                </div>
                <div className="rounded-[26px] border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.12)] p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-[#d8efff]/80">
                    Usuários ativos
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-white">
                    {usuarios.filter((usuario) => usuario.ativo).length}
                  </div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    Acessos habilitados no sistema
                  </div>
                </div>
                <div className="rounded-[26px] border border-[rgba(254,132,146,0.24)] bg-[rgba(254,132,146,0.12)] p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-[#ffe1e4]/80">
                    Usuários master
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-white">
                    {usuarios.filter((usuario) => usuario.perfil === 'master').length}
                  </div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    Visão global e gestão completa
                  </div>
                </div>
                <div className="rounded-[26px] border border-[rgba(164,37,39,0.24)] bg-[rgba(164,37,39,0.12)] p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-[#ffd4da]/80">
                    Usuários vendedores
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-white">
                    {usuarios.filter((usuario) => usuario.perfil === 'vendedor').length}
                  </div>
                  <div className="mt-2 text-sm text-slate-300/80">
                    Perfis vinculados às carteiras
                  </div>
                </div>
              </section>

              <section className={panelClassName}>
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Usuários cadastrados</h2>
                    <p className="mt-1 text-sm text-slate-300/75">
                      Gerencie perfil, vínculo de vendedor e status sem sair do
                      padrão visual da operação.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
                    {usuarios.length} registros
                  </div>
                </div>

                {carregando && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
                    Carregando usuários...
                  </div>
                )}

                {!carregando && usuarios.length === 0 && !erro && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
                    Nenhum usuário encontrado.
                  </div>
                )}

                {!carregando && usuarios.length > 0 && (
                  <div className="grid gap-4">
                    {usuarios.map((usuario) => {
                      const alterandoStatus = salvandoStatusId === usuario.id
                      const salvandoEdicao = salvandoEdicaoId === usuario.id
                      const salvandoSenha = salvandoSenhaId === usuario.id
                      const excluindo = excluindoId === usuario.id
                      const ehUsuarioLogado = perfilUsuario?.id === usuario.id
                      const estaEditando = usuarioEditandoId === usuario.id
                      const usuarioTemPerfilInvalido = !perfilValido(usuario.perfil)

                      return (
                        <article
                          key={usuario.id}
                          className="rounded-[26px] border border-white/10 bg-[rgba(40,47,69,0.24)] p-5"
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:justify-between">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <h3 className="text-xl font-semibold text-white">
                                  {usuario.nome || '-'}
                                </h3>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    usuario.ativo
                                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                      : 'border-[rgba(164,37,39,0.3)] bg-[rgba(164,37,39,0.14)] text-[#ffd4da]'
                                  }`}
                                >
                                  {usuario.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs ${
                                    usuario.perfil === 'master'
                                      ? 'border border-[rgba(254,132,146,0.28)] bg-[rgba(254,132,146,0.16)] text-[#ffe1e4]'
                                      : 'border border-[rgba(81,150,206,0.35)] bg-[rgba(81,150,206,0.18)] text-[#cfeaff]'
                                  }`}
                                >
                                  {usuarioTemPerfilInvalido
                                    ? `${usuario.perfil} (inválido)`
                                    : usuario.perfil}
                                </span>
                                {ehUsuarioLogado && (
                                  <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-slate-200">
                                    Usuário atual
                                  </span>
                                )}
                              </div>

                              <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                    E-mail
                                  </div>
                                  <div className="mt-1">{usuario.email || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                    Vendedor vinculado
                                  </div>
                                  <div className="mt-1">{usuario.nome_vendedor || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                    Criado em
                                  </div>
                                  <div className="mt-1">{formatarData(usuario.criado_em)}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                    ID
                                  </div>
                                  <div className="mt-1 truncate">{usuario.id}</div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-3 xl:w-[240px]">
                              <button
                                onClick={() => alternarStatusUsuario(usuario)}
                                disabled={alterandoStatus || ehUsuarioLogado || estaEditando || excluindo}
                                className={`rounded-2xl px-4 py-3 text-sm font-medium text-white transition ${
                                  alterandoStatus || ehUsuarioLogado || estaEditando || excluindo
                                    ? 'cursor-not-allowed bg-white/10 text-slate-400'
                                    : usuario.ativo
                                      ? 'bg-[rgba(164,37,39,0.92)] hover:bg-[rgba(164,37,39,1)]'
                                      : 'bg-[rgba(81,150,206,0.92)] hover:bg-[rgba(81,150,206,1)]'
                                }`}
                              >
                                {alterandoStatus
                                  ? 'Salvando...'
                                  : ehUsuarioLogado
                                    ? 'Usuário atual'
                                    : usuario.ativo
                                      ? 'Desativar usuário'
                                      : 'Ativar usuário'}
                              </button>

                              {!ehUsuarioLogado && !estaEditando && (
                                <button
                                  onClick={() => iniciarEdicao(usuario)}
                                  disabled={excluindo}
                                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                                    excluindo
                                      ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                                      : 'border-[rgba(81,150,206,0.3)] bg-[rgba(81,150,206,0.14)] text-[#d7eeff] hover:bg-[rgba(81,150,206,0.2)]'
                                  }`}
                                >
                                  Editar usuário
                                </button>
                              )}
                              {!ehUsuarioLogado && (
                                <button
                                  onClick={() => excluirUsuario(usuario)}
                                  disabled={estaEditando || excluindo || alterandoStatus}
                                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                                    estaEditando || excluindo || alterandoStatus
                                      ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                                      : 'border-[rgba(164,37,39,0.3)] bg-[rgba(164,37,39,0.14)] text-[#ffd4da] hover:bg-[rgba(164,37,39,0.22)]'
                                  }`}
                                >
                                  {excluindo ? 'Excluindo...' : 'Excluir usuário'}
                                </button>
                              )}
                            </div>
                          </div>

                          {estaEditando && (
                            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                                    Edição
                                  </div>
                                  <div className="mt-2 text-lg font-semibold text-white">
                                    Ajustar perfil e vínculo
                                  </div>
                                </div>
                                {usuarioTemPerfilInvalido && (
                                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                                    O perfil salvo estava inválido. Escolha o correto e salve.
                                  </div>
                                )}
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <select
                                  value={perfilEdicao}
                                  onChange={(e) => setPerfilEdicao(normalizarPerfil(e.target.value))}
                                  className={inputClassName}
                                >
                                  <option value="vendedor">Vendedor</option>
                                  <option value="master">Master</option>
                                </select>

                                {perfilEdicao === 'vendedor' && (
                                  <input
                                    type="text"
                                    placeholder="Nome do vendedor exatamente igual ao cadastro"
                                    list="vendedores-disponiveis"
                                    value={nomeVendedorEdicao}
                                    onChange={(e) => setNomeVendedorEdicao(e.target.value)}
                                    className={inputClassName}
                                  />
                                )}
                              </div>

                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  onClick={() => salvarEdicaoUsuario(usuario)}
                                  disabled={salvandoEdicao}
                                  className={`rounded-2xl px-4 py-3 text-sm font-medium text-white transition ${
                                    salvandoEdicao
                                      ? 'cursor-not-allowed bg-white/10 text-slate-400'
                                      : 'bg-[rgba(81,150,206,0.92)] hover:bg-[rgba(81,150,206,1)]'
                                  }`}
                                >
                                  {salvandoEdicao ? 'Salvando...' : 'Salvar edição'}
                                </button>

                                <button
                                  onClick={cancelarEdicao}
                                  disabled={salvandoEdicao || salvandoSenha}
                                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                                    salvandoEdicao || salvandoSenha
                                      ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500'
                                      : 'border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]'
                                  }`}
                                >
                                  Cancelar
                                </button>
                              </div>

                              <div className="mt-5 rounded-[22px] border border-[rgba(81,150,206,0.16)] bg-[rgba(81,150,206,0.08)] p-4">
                                <div className="text-xs uppercase tracking-[0.28em] text-[#d8efff]/80">
                                  Troca de senha
                                </div>
                                <div className="mt-2 text-sm text-slate-300/80">
                                  A nova senha será aplicada diretamente no Supabase Auth.
                                </div>
                                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                  <input
                                    type="password"
                                    placeholder="Nova senha"
                                    value={novaSenhaEdicao}
                                    onChange={(e) => setNovaSenhaEdicao(e.target.value)}
                                    className={`${inputClassName} md:flex-1`}
                                  />
                                  <button
                                    onClick={() => trocarSenhaUsuario(usuario)}
                                    disabled={salvandoSenha}
                                    className={`rounded-2xl px-4 py-3 text-sm font-medium text-white transition ${
                                      salvandoSenha
                                        ? 'cursor-not-allowed bg-white/10 text-slate-400'
                                        : 'bg-[rgba(81,150,206,0.92)] hover:bg-[rgba(81,150,206,1)]'
                                    }`}
                                  >
                                    {salvandoSenha ? 'Atualizando...' : 'Trocar senha'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <section className={panelClassName}>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Perfil logado
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="text-sm text-slate-400">Usuário</div>
                    <div className="mt-1 font-medium text-white">
                      {perfilUsuario?.nome || perfilUsuario?.email || '-'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="text-sm text-slate-400">Perfil</div>
                    <div className="mt-1 font-medium uppercase text-white">
                      {perfilUsuario?.perfil || '-'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="text-sm text-slate-400">Vendedor vinculado</div>
                    <div className="mt-1 font-medium text-white">
                      {perfilUsuario?.nome_vendedor || 'Não se aplica'}
                    </div>
                  </div>
                </div>
              </section>

              <section className={panelClassName}>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  Cadastrar usuário
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  Novo acesso interno
                </div>
                <p className="mt-2 text-sm text-slate-300/75">
                  Crie perfis master ou vendedor e vincule corretamente quem deve
                  enxergar cada carteira.
                </p>

                <form onSubmit={criarUsuario} className="mt-5 grid gap-3">
                  <input
                    type="text"
                    placeholder="Nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    className={inputClassName}
                  />

                  <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClassName}
                  />

                  <input
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={inputClassName}
                  />

                  <select
                    value={perfil}
                    onChange={(e) => setPerfil(normalizarPerfil(e.target.value))}
                    className={inputClassName}
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="master">Master</option>
                  </select>

                  {perfil === 'vendedor' && (
                    <input
                      type="text"
                      placeholder="Nome do vendedor exatamente igual ao cadastro"
                      list="vendedores-disponiveis"
                      value={nomeVendedor}
                      onChange={(e) => setNomeVendedor(e.target.value)}
                      required
                      className={inputClassName}
                    />
                  )}

                  {vendedoresDisponiveis.length > 0 && (
                    <datalist id="vendedores-disponiveis">
                      {vendedoresDisponiveis.map((vendedor) => (
                        <option key={vendedor} value={vendedor} />
                      ))}
                    </datalist>
                  )}

                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={(e) => setAtivo(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#5196CE]"
                    />
                    Usuário ativo
                  </label>

                  <button
                    type="submit"
                    disabled={salvando}
                    className={`rounded-2xl px-4 py-3 text-sm font-medium text-white transition ${
                      salvando
                        ? 'cursor-not-allowed bg-white/10 text-slate-400'
                        : 'bg-[rgba(81,150,206,0.92)] hover:bg-[rgba(81,150,206,1)]'
                    }`}
                  >
                    {salvando ? 'Salvando...' : 'Cadastrar usuário'}
                  </button>
                </form>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}
