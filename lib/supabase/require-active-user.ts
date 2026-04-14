import { createClient } from '@/lib/supabase/server'

export type UsuarioAtivo = {
  id: string
  email: string | null
  nome: string | null
  perfil: string
  nome_vendedor: string | null
  ativo: boolean
}

export async function requireActiveUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      error: 'Sessão inválida.',
      status: 401 as const,
      user: null,
      perfil: null,
    }
  }

  const { data: perfil, error: perfilError } = await supabase
    .schema('omie_core')
    .from('usuarios_dashboard')
    .select('id, email, nome, perfil, nome_vendedor, ativo')
    .eq('id', user.id)
    .single<UsuarioAtivo>()

  if (perfilError || !perfil || perfil.ativo !== true) {
    return {
      error: 'Usuário sem acesso.',
      status: 403 as const,
      user: null,
      perfil: null,
    }
  }

  return {
    error: null,
    status: 200 as const,
    user,
    perfil,
  }
}
