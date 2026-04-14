'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FLUXOS_MENSAGEM, FluxoMensagemKey, TemplateMensagem } from '@/lib/mensagem/config'

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
  uazapi_instance: string
  uazapi_token: string
  ativo: boolean
  nome_vendedor: string | null
}

const EMPTY_CONFIG: ConfiguracaoMensagem = {
  uazapi_instance: '',
  uazapi_token: '',
  ativo: true,
  nome_vendedor: null,
}

function buildTemplateMap(templates: TemplateMensagem[]) {
  return templates.reduce<Record<string, TemplateMensagem>>((acc, template) => {
    acc[template.fluxo] = template
    return acc
  }, {})
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
  const [templates, setTemplates] = useState<Record<string, TemplateMensagem>>({})
  const textareasRef = useRef<Record<string, HTMLTextAreaElement | null>>({})

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
        uazapi_instance: resultado.configuracao?.uazapi_instance || '',
        uazapi_token: resultado.configuracao?.uazapi_token || '',
        ativo: resultado.configuracao?.ativo !== false,
        nome_vendedor: resultado.configuracao?.nome_vendedor || null,
      })
      setTemplates(buildTemplateMap((resultado.templates || []) as TemplateMensagem[]))
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
        template:
          templates[fluxo.key] ||
          ({
            fluxo: fluxo.key,
            nome_template: fluxo.titulo,
            conteudo: fluxo.exemplo,
            variaveis: [...fluxo.variaveis],
          } satisfies TemplateMensagem),
      })),
    [origin, templates]
  )

  function updateTemplate(fluxo: FluxoMensagemKey, field: 'nome_template' | 'conteudo', value: string) {
    setTemplates((state) => ({
      ...state,
      [fluxo]: {
        fluxo,
        nome_template: state[fluxo]?.nome_template || FLUXOS_MENSAGEM.find((item) => item.key === fluxo)?.titulo || fluxo,
        conteudo: state[fluxo]?.conteudo || '',
        variaveis: state[fluxo]?.variaveis || [...(FLUXOS_MENSAGEM.find((item) => item.key === fluxo)?.variaveis || [])],
        [field]: value,
      },
    }))
  }

  function inserirVariavel(fluxo: FluxoMensagemKey, variavel: string) {
    const textarea = textareasRef.current[fluxo]
    const token = `{${variavel}}`

    if (!textarea) {
      updateTemplate(
        fluxo,
        'conteudo',
        `${templates[fluxo]?.conteudo || ''}${templates[fluxo]?.conteudo ? '\n' : ''}${token}`
      )
      return
    }

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const atual = templates[fluxo]?.conteudo || ''
    const proximo = `${atual.slice(0, start)}${token}${atual.slice(end)}`

    updateTemplate(fluxo, 'conteudo', proximo)

    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + token.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    setMensagem(null)

    const payload = {
      ...configuracao,
      templates: fluxos.map((fluxo) => ({
        fluxo: fluxo.key,
        nome_template: templates[fluxo.key]?.nome_template || fluxo.titulo,
        conteudo: templates[fluxo.key]?.conteudo || '',
      })),
    }

    const response = await fetch('/api/mensagem/configuracao', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const resultado = await response.json()

    if (!response.ok) {
      setErro(resultado.error || 'Erro ao salvar a configuração de mensagem.')
      setSalvando(false)
      return
    }

    setConfiguracao({
      uazapi_instance: resultado.configuracao?.uazapi_instance || '',
      uazapi_token: resultado.configuracao?.uazapi_token || '',
      ativo: resultado.configuracao?.ativo !== false,
      nome_vendedor: resultado.configuracao?.nome_vendedor || null,
    })
    setTemplates(buildTemplateMap((resultado.templates || []) as TemplateMensagem[]))
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
            <div className="mt-3 text-3xl font-semibold text-white">
              {clientesEmNegociacao}
            </div>
            <div className="mt-2 text-sm text-[#ffe1e4]">
              Cliente com `em_negociacao = true` deve ficar fora da cobrança.
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <div className="text-sm font-medium text-white">Regras operacionais fixas</div>
          <div className="mt-3 grid gap-3 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              O `n8n` continua definindo o público e o fluxo, mas a API de mensagem faz uma
              proteção final e não envia para cliente bloqueado na régua.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              O `n8n` continua no fluxo, porém chama apenas os webhooks internos do sistema,
              e não mais a Uazapi diretamente.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              Cada um dos 4 fluxos tem sua própria escuta para ser usada no `HTTP Request` do
              `n8n`, e cada vendedor mantém o seu próprio template para aquele fluxo.
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-white">Setup do vendedor</div>
                <div className="mt-1 text-sm text-slate-400">
                  Cadastre aqui a sua instância e o seu token da Uazapi.
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
                <span>Instância Uazapi</span>
                <input
                  value={configuracao.uazapi_instance}
                  onChange={(event) =>
                    setConfiguracao((state) => ({
                      ...state,
                      uazapi_instance: event.target.value,
                    }))
                  }
                  placeholder="Ex: vendedor-prime-01"
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
                  placeholder="Informe o token da sua instância"
                  className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(81,150,206,0.24)] bg-[rgba(81,150,206,0.1)] p-5">
            <div className="text-sm font-medium text-white">Escutas para o n8n</div>
            <div className="mt-1 text-sm text-[#d7eeff]">
              Cada fluxo termina em um `HTTP Request` diferente dentro do `n8n`.
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
              <div className="text-sm font-medium text-white">Templates por fluxo</div>
              <div className="mt-1 text-sm text-slate-400">
                O vendedor edita a sua própria mensagem e escolhe as variáveis amigáveis do
                payload recebido do `n8n`.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              Exemplo de variável: <span className="font-mono text-white">{'{contato}'}</span>
            </div>
          </div>

          {carregando ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-sm text-slate-300">
              Carregando configuração de mensagem...
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {fluxos.map((fluxo) => (
                <div
                  key={fluxo.key}
                  className="rounded-[24px] border border-white/10 bg-[rgba(10,16,29,0.18)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-medium text-white">{fluxo.titulo}</div>
                      <div className="mt-1 text-sm text-slate-400">{fluxo.descricao}</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
                      Escuta: {fluxo.path}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="grid gap-4">
                      <label className="grid gap-2 text-sm text-slate-300">
                        <span>Nome do template</span>
                        <input
                          value={templates[fluxo.key]?.nome_template || fluxo.titulo}
                          onChange={(event) =>
                            updateTemplate(fluxo.key, 'nome_template', event.target.value)
                          }
                          className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                        />
                      </label>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-sm font-medium text-white">Variáveis disponíveis</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {fluxo.variaveis.map((variavel) => (
                            <button
                              key={variavel}
                              type="button"
                              onClick={() => inserirVariavel(fluxo.key, variavel)}
                              className="rounded-full border border-[rgba(81,150,206,0.28)] bg-[rgba(81,150,206,0.14)] px-3 py-1 text-xs text-[#d7eeff]"
                            >
                              {`{${variavel}}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <label className="grid gap-2 text-sm text-slate-300">
                      <span>Mensagem do fluxo</span>
                      <textarea
                        ref={(element) => {
                          textareasRef.current[fluxo.key] = element
                        }}
                        rows={8}
                        value={templates[fluxo.key]?.conteudo || fluxo.exemplo}
                        onChange={(event) =>
                          updateTemplate(fluxo.key, 'conteudo', event.target.value)
                        }
                        className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                      />
                    </label>
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
