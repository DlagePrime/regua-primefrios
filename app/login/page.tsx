'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-slate-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.75 11.2 13a1.5 1.5 0 0 0 1.6 0L21 7.75" />
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-slate-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 1 1 8 0V10" />
      <path d="M12 13.5v3" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCarregando(true)
    setMensagem('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setMensagem(`Erro: ${error.message}`)
      setCarregando(false)
      return
    }

    setMensagem('Login realizado com sucesso.')
    router.push('/')
    router.refresh()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_bottom,_rgba(81,150,206,0.28),_transparent_30%),radial-gradient(circle_at_top,_rgba(164,37,39,0.24),_transparent_24%),linear-gradient(180deg,_rgba(40,24,32,0.94)_0%,_rgba(40,47,69,0.86)_58%,_rgba(40,24,32,0.9)_100%)] px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.07),_transparent_28%),linear-gradient(90deg,transparent,rgba(255,255,255,0.025),transparent)]" />

      <div className="relative w-full max-w-[540px] border border-white/10 bg-[rgba(40,47,69,0.14)] px-8 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-12 sm:py-14">
        <div className="mb-12 text-center">
          <div className="text-[11px] uppercase tracking-[0.42em] text-slate-400">
            Prime Frios
          </div>
          <h1 className="mt-8 text-[2rem] font-light tracking-[0.18em] text-slate-200 sm:text-[2.35rem]">
            Member Login
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-200/80">
            Acesse a régua de cobrança, a carteira de clientes e os indicadores da operação.
          </p>
        </div>

        <form onSubmit={entrar} className="space-y-10">
          <label className="block">
            <div className="flex items-center gap-4 border-b border-white/25 pb-3 transition focus-within:border-[#5196CE]">
              <MailIcon />
              <input
                type="email"
                placeholder="Email ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-transparent text-lg font-light tracking-[0.06em] text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </label>

          <label className="block">
            <div className="flex items-center gap-4 border-b border-white/25 pb-3 transition focus-within:border-[#FE8492]">
              <LockIcon />
              <input
                type="password"
                placeholder="Password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-transparent text-lg font-light tracking-[0.06em] text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </label>

          <div className="flex flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
                className="h-3.5 w-3.5 rounded-none border border-white/30 bg-transparent accent-white"
              />
              <span>Lembrar de mim</span>
            </label>

            <span className="italic text-slate-400">
              Recuperação de acesso sob gestão do administrador
            </span>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full border border-white/25 bg-white/[0.04] px-6 py-4 text-sm font-semibold tracking-[0.28em] text-slate-100 transition hover:border-[#5196CE] hover:bg-[rgba(81,150,206,0.16)] hover:text-white disabled:cursor-not-allowed disabled:border-white/15 disabled:text-slate-500"
          >
            {carregando ? 'ENTRANDO...' : 'LOGIN'}
          </button>
        </form>

        {mensagem && (
          <div
            className={`mt-8 border px-4 py-3 text-sm ${
              mensagem.startsWith('Erro:')
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            {mensagem}
          </div>
        )}
      </div>
    </main>
  )
}
