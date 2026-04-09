'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
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
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        padding: 20,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: '#fff',
          border: '1px solid #ddd',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 20 }}>Login</h1>

        <form onSubmit={entrar} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            placeholder="Seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: 12,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            style={{
              padding: 12,
              border: '1px solid #ccc',
              borderRadius: 8,
            }}
          />

          <button
            type="submit"
            disabled={carregando}
            style={{
              padding: '12px 14px',
              border: 'none',
              borderRadius: 8,
              cursor: carregando ? 'not-allowed' : 'pointer',
              backgroundColor: carregando ? '#999' : '#1d4ed8',
              color: '#fff',
            }}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {mensagem && (
          <div style={{ marginTop: 14 }}>
            {mensagem}
          </div>
        )}
      </div>
    </main>
  )
}