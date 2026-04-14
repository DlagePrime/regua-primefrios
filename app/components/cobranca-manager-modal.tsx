'use client'

import { useEffect, useMemo, useState } from 'react'
import { FLUXOS_MENSAGEM } from '@/lib/mensagem/config'

type Perfil = {
  nome: string | null
  email: string | null
  perfil: string
  nome_vendedor?: string | null
}

type Props = {
  perfil: Perfil | null
  clientesAptos: number
  clientesBloqueados: number
  clientesEmNegociacao: number
  onClose: () => void
}

type ConfiguracaoMensagem = {
  uazapi_server_url: string
  uazapi_token: string
  ativo: boolean
  nome_vendedor: string | null
}

type RelatorioMensagemDia = {
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

const EMPTY_CONFIG: ConfiguracaoMensagem = {
  uazapi_server_url: '',
  uazapi_token: '',
  ativo: true,
  nome_vendedor: null,
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function CobrancaManagerModal({
  perfil,
  clientesAptos,
  clientesBloqueados,
  clientesEmNegociacao,
  onClose,
}: Props) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [configuracao, setConfiguracao] = useState<ConfiguracaoMensagem>(EMPTY_CONFIG)
  const [relatorioDia, setRelatorioDia] = useState<RelatorioMensagemDia[]>([])

  useEffect(() => {
    setOrigin(window.location.origin)

    let active = true

    async function carregarConfiguracao() {
      setCarregando(true)
      setErro(null)

      const response = await fetch('/api/mensagem/configuracao', {
        method: 'GET',
        cache: 'no-store',
      })
      const resultado = await response.json()

      if (!active) return

      if (!response.ok) {
        setErro(resultado.error || 'Erro ao carregar a configuração de mensagem.')
        setCarregando(false)
        return
      }

      setConfiguracao({
        uazapi_server_url: resultado.configuracao?.uazapi_server_url || '',
        uazapi_token: resultado.configuracao?.uazapi_token || '',
        ativo: resultado.configuracao?.ativo !== false,
        nome_vendedor: resultado.configuracao?.nome_vendedor || null,
      })
      setRelatorioDia((resultado.relatorio_dia || []) as RelatorioMensagemDia[])
      setCarregando(false)
    }

    void carregarConfiguracao()

    return () => {
      active = false
    }
  }, [])

  const fluxos = useMemo(
    () =>
      FLUXOS_MENSAGEM.map((fluxo) => ({
        ...fluxo,
        url: origin ? `${origin}${fluxo.path}` : fluxo.path,
      })),
    [origin]
  )

  async function salvar() {
    setSalvando(true)
    setErro(null)
    setMensagem(null)

    const response = await fetch('/api/mensagem/configuracao', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configuracao),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao salvar a configuração de mensagem.')
      setSalvando(false)
      return
    }

    setConfiguracao({
      uazapi_server_url: resultado.configuracao?.uazapi_server_url || '',
      uazapi_token: resultado.configuracao?.uazapi_token || '',
      ativo: resultado.configuracao?.ativo !== false,
      nome_vendedor: resultado.configuracao?.nome_vendedor || null,
    })
    setRelatorioDia((resultado.relatorio_dia || []) as RelatorioMensagemDia[])
    setMensagem(resultado.message || 'Configuração de mensagem salva com sucesso.')
    setSalvando(false)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(40,24,32,0.42)] px-4 py-6 backdrop-blur-md"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-[28px] border border-white/10 bg-[rgba(40,47,69,0.34)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.18)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Gestão de cobrança
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Gerenciar cobrança</h2>
            <div className="mt-2 text-sm text-slate-400">
              {perfil?.nome || perfil?.email || '-'}
              {configuracao.nome_vendedor ? ` · Vendedor ${configuracao.nome_vendedor}` : ''}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm"
          >
            Fechar
          </button>
        </div>

        {erro && (
          <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {mensagem}
          </div>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-[rgba(88,126,74,0.34)] bg-[rgba(88,126,74,0.16)] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#dce9d6]/80">
              Aptos para envio
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{clientesAptos}</div>
            <div className="mt-2 text-sm text-[#dce9d6]">
              Cliente com régua liberada e sem negociação ativa.
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(164,37,39,0.28)] bg-[rgba(164,37,39,0.16)] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#ffd4da]/80">
              Bloqueados
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{clientesBloqueados}</div>
            <div className="mt-2 text-sm text-[#ffd4da]">
              Cliente com `cliente_desbloqueado_regua = false`.
            </div>
          </div>

          <div className="rounded-[24px] border border-[rgba(254,132,146,0.28)] bg-[rgba(254,132,146,0.16)] p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#ffe1e4]/80">
              Em negociação
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">{clientesEmNegociacao}</div>
            <div className="mt-2 text-sm text-[#ffe1e4]">
              Cliente com `em_negociacao = true` deve ficar fora da cobrança.
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white">Setup do vendedor</div>
                <div className="mt-1 text-sm text-slate-400">
                  Cadastre aqui o Server URL e o token da sua Uazapi.
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={configuracao.ativo}
                  onChange={(event) =>
                    setConfiguracao((state) => ({
                      ...state,
                      ativo: event.target.checked,
                    }))
                  }
                />
                Configuração ativa
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Server URL</span>
                <input
                  value={configuracao.uazapi_server_url}
                  onChange={(event) =>
                    setConfiguracao((state) => ({
                      ...state,
                      uazapi_server_url: event.target.value,
                    }))
                  }
                  placeholder="Ex: https://primefrioscom.uazapi.com"
                  className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Token Uazapi</span>
                <input
                  value={configuracao.uazapi_token}
                  onChange={(event) =>
                    setConfiguracao((state) => ({
                      ...state,
                      uazapi_token: event.target.value,
                    }))
                  }
                  placeholder="Informe o token da instância"
                  className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
              O `n8n` entrega a mensagem pronta no payload. A API assume o `Server URL`, o
              `token`, o `numero_destino` e faz o envio para a Uazapi.
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.1)] p-5">
            <div className="text-sm font-medium text-white">Escutas para o n8n</div>
            <div className="mt-1 text-sm text-[#d7eeff]">
              Cada fluxo continua com sua própria URL de webhook.
            </div>

            <div className="mt-4 grid gap-3">
              {fluxos.map((fluxo) => (
                <div
                  key={fluxo.key}
                  className="rounded-2xl border border-white/10 bg-[rgba(10,16,29,0.22)] p-4"
                >
                  <div className="text-sm font-medium text-white">{fluxo.titulo}</div>
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-[#d7eeff]">
                    {fluxo.url}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{fluxo.descricao}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Relatório do dia</div>
              <div className="mt-1 text-sm text-slate-400">
                Mensagens enviadas hoje por este vendedor, já assumidas pela API interna.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              {relatorioDia.length} envio(s) hoje
            </div>
          </div>

          {carregando ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
              Carregando relatório do dia...
            </div>
          ) : !relatorioDia.length ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
              Nenhuma mensagem registrada hoje.
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {relatorioDia.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-white/10 bg-[rgba(10,16,29,0.18)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-medium text-white">
                        {item.cliente_nome || item.contato || item.telefone || '-'}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {item.fluxo} · {formatDateTime(item.created_at)}
                      </div>
                    </div>
                    <div
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.status_envio === 'sucesso'
                          ? 'bg-emerald-400/10 text-emerald-200'
                          : 'bg-rose-500/10 text-rose-200'
                      }`}
                    >
                      {item.status_envio}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        Telefone
                      </div>
                      <div className="mt-1 text-white">{item.telefone || '-'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        HTTP Status
                      </div>
                      <div className="mt-1 text-white">{item.http_status ?? '-'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        Erro
                      </div>
                      <div className="mt-1 text-white">{item.erro || '-'}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Mensagem enviada
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">
                      {item.mensagem || '-'}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm"
          >
            Fechar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || carregando}
            className={`rounded-2xl px-4 py-3 text-sm font-medium text-white ${
              salvando || carregando
                ? 'cursor-not-allowed bg-white/10 text-slate-400'
                : 'bg-[rgba(81,150,206,0.92)]'
            }`}
          >
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
      </div>
    </div>
  )
}
