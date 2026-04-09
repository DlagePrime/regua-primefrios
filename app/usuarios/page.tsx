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

export default function UsuariosPage() {
  const router = useRouter()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvandoStatusId, setSalvandoStatusId] = useState<string | null>(null)
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState<string | null>(null)

  const [perfilUsuario, setPerfilUsuario] = useState<PerfilUsuario | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioDashboard[]>([])

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perfil, setPerfil] = useState<PerfilSistema>('vendedor')
  const [nomeVendedor, setNomeVendedor] = useState('')
  const [ativo, setAtivo] = useState(true)

  const [usuarioEditandoId, setUsuarioEditandoId] = useState<string | null>(null)
  const [perfilEdicao, setPerfilEdicao] = useState<PerfilSistema>('vendedor')
  const [nomeVendedorEdicao, setNomeVendedorEdicao] = useState('')

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

    const { data, error } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .update({ ativo: novoStatus })
      .eq('id', usuario.id)
      .select('id, ativo')
      .single()

    if (error) {
      setErro(error.message)
      setSalvandoStatusId(null)
      return
    }

    setUsuarios((listaAtual) =>
      listaAtual.map((item) =>
        item.id === usuario.id
          ? {
              ...item,
              ativo: data?.ativo ?? novoStatus,
            }
          : item
      )
    )

    setMensagem(
      data?.ativo === true
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
  }

  function cancelarEdicao() {
    setUsuarioEditandoId(null)
    setPerfilEdicao('vendedor')
    setNomeVendedorEdicao('')
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

    setSalvandoEdicaoId(usuario.id)

    const payload = {
      perfil: normalizarPerfil(perfilEdicao),
      nome_vendedor:
        perfilEdicao === 'vendedor' ? nomeVendedorEdicao.trim() : null,
    }

    const { data, error } = await supabase
      .schema('omie_core')
      .from('usuarios_dashboard')
      .update(payload)
      .eq('id', usuario.id)
      .select('id, perfil, nome_vendedor')
      .single()

    if (error) {
      setErro(error.message)
      setSalvandoEdicaoId(null)
      return
    }

    setUsuarios((listaAtual) =>
      listaAtual.map((item) =>
        item.id === usuario.id
          ? {
              ...item,
              perfil: data?.perfil ?? payload.perfil,
              nome_vendedor:
                data?.nome_vendedor ??
                (payload.nome_vendedor === null ? null : payload.nome_vendedor),
            }
          : item
      )
    )

    setMensagem('Usuário atualizado com sucesso.')
    setUsuarioEditandoId(null)
    setPerfilEdicao('vendedor')
    setNomeVendedorEdicao('')
    setSalvandoEdicaoId(null)
  }

  useEffect(() => {
    carregarPagina()
  }, [])

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif', color: '#111' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0 }}>Usuários da Dashboard</h1>

        <button
          onClick={() => router.push('/')}
          style={{
            padding: '10px 14px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            backgroundColor: '#444',
            color: '#fff',
          }}
        >
          Voltar
        </button>
      </div>

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
        </div>
      )}

      <div
        style={{
          marginBottom: 20,
          padding: 16,
          border: '1px solid #ddd',
          borderRadius: 10,
          backgroundColor: '#fff',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Cadastrar usuário</h2>

        <form onSubmit={criarUsuario} style={{ display: 'grid', gap: 12 }}>
          <input
            type="text"
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            style={{
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          />

          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          />

          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          />

          <select
            value={perfil}
            onChange={(e) => setPerfil(normalizarPerfil(e.target.value))}
            style={{
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          >
            <option value="vendedor">Vendedor</option>
            <option value="master">Master</option>
          </select>

          {perfil === 'vendedor' && (
            <input
              type="text"
              placeholder="Nome do vendedor exatamente igual ao cadastro"
              value={nomeVendedor}
              onChange={(e) => setNomeVendedor(e.target.value)}
              required
              style={{
                padding: 10,
                border: '1px solid #ccc',
                borderRadius: 8,
              }}
            />
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Usuário ativo
          </label>

          <button
            type="submit"
            disabled={salvando}
            style={{
              padding: '10px 14px',
              border: 'none',
              borderRadius: 8,
              cursor: salvando ? 'not-allowed' : 'pointer',
              backgroundColor: salvando ? '#999' : '#1d4ed8',
              color: '#fff',
            }}
          >
            {salvando ? 'Salvando...' : 'Cadastrar usuário'}
          </button>
        </form>
      </div>

      {carregando && <p>Carregando usuários...</p>}

      {mensagem && (
        <div style={{ color: 'green', marginBottom: 16 }}>
          <strong>{mensagem}</strong>
        </div>
      )}

      {erro && (
        <div style={{ color: 'red', marginBottom: 16 }}>
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {!carregando && !erro && usuarios.length === 0 && (
        <div
          style={{
            padding: 16,
            border: '1px solid #ddd',
            borderRadius: 10,
            backgroundColor: '#fff',
          }}
        >
          Nenhum usuário encontrado.
        </div>
      )}

      {!carregando && !erro && usuarios.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {usuarios.map((usuario) => {
            const alterandoStatus = salvandoStatusId === usuario.id
            const salvandoEdicao = salvandoEdicaoId === usuario.id
            const ehUsuarioLogado = perfilUsuario?.id === usuario.id
            const estaEditando = usuarioEditandoId === usuario.id
            const usuarioTemPerfilInvalido = !perfilValido(usuario.perfil)

            return (
              <div
                key={usuario.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                }}
              >
                <div><strong>Nome:</strong> {usuario.nome || '-'}</div>
                <div><strong>E-mail:</strong> {usuario.email || '-'}</div>
                <div>
                  <strong>Perfil:</strong>{' '}
                  {usuarioTemPerfilInvalido ? `${usuario.perfil} (inválido)` : usuario.perfil}
                </div>
                <div><strong>Vendedor:</strong> {usuario.nome_vendedor || '-'}</div>
                <div><strong>Ativo:</strong> {usuario.ativo === true ? 'Sim' : 'Não'}</div>
                <div><strong>Criado em:</strong> {usuario.criado_em || '-'}</div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => alternarStatusUsuario(usuario)}
                    disabled={alterandoStatus || ehUsuarioLogado || estaEditando}
                    style={{
                      padding: '10px 14px',
                      border: 'none',
                      borderRadius: 8,
                      cursor:
                        alterandoStatus || ehUsuarioLogado || estaEditando
                          ? 'not-allowed'
                          : 'pointer',
                      backgroundColor: ehUsuarioLogado
                        ? '#999'
                        : usuario.ativo
                          ? '#b91c1c'
                          : '#15803d',
                      color: '#fff',
                    }}
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
                      style={{
                        padding: '10px 14px',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        backgroundColor: '#1d4ed8',
                        color: '#fff',
                      }}
                    >
                      Editar usuário
                    </button>
                  )}
                </div>

                {estaEditando && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      backgroundColor: '#fafafa',
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong>Editando usuário</strong>
                    </div>

                    {usuarioTemPerfilInvalido && (
                      <div style={{ color: '#b45309' }}>
                        <strong>Aviso:</strong> o perfil salvo estava inválido. Escolha o perfil correto e salve.
                      </div>
                    )}

                    <select
                      value={perfilEdicao}
                      onChange={(e) => setPerfilEdicao(normalizarPerfil(e.target.value))}
                      style={{
                        padding: 10,
                        border: '1px solid #ccc',
                        borderRadius: 8,
                      }}
                    >
                      <option value="vendedor">Vendedor</option>
                      <option value="master">Master</option>
                    </select>

                    {perfilEdicao === 'vendedor' && (
                      <input
                        type="text"
                        placeholder="Nome do vendedor exatamente igual ao cadastro"
                        value={nomeVendedorEdicao}
                        onChange={(e) => setNomeVendedorEdicao(e.target.value)}
                        style={{
                          padding: 10,
                          border: '1px solid #ccc',
                          borderRadius: 8,
                        }}
                      />
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => salvarEdicaoUsuario(usuario)}
                        disabled={salvandoEdicao}
                        style={{
                          padding: '10px 14px',
                          border: 'none',
                          borderRadius: 8,
                          cursor: salvandoEdicao ? 'not-allowed' : 'pointer',
                          backgroundColor: salvandoEdicao ? '#999' : '#15803d',
                          color: '#fff',
                        }}
                      >
                        {salvandoEdicao ? 'Salvando...' : 'Salvar edição'}
                      </button>

                      <button
                        onClick={cancelarEdicao}
                        disabled={salvandoEdicao}
                        style={{
                          padding: '10px 14px',
                          border: 'none',
                          borderRadius: 8,
                          cursor: salvandoEdicao ? 'not-allowed' : 'pointer',
                          backgroundColor: '#444',
                          color: '#fff',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}