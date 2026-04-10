import { createClient } from '@/lib/supabase/server'

export async function requireMasterUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Sessão inválida.', status: 401 as const, user: null }
  }

  const { data: perfil, error: perfilError } = await supabase
    .schema('omie_core')
    .from('usuarios_dashboard')
    .select('id, perfil, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil || perfil.ativo !== true || perfil.perfil !== 'master') {
    return { error: 'Acesso negado.', status: 403 as const, user: null }
  }

  return { error: null, status: 200 as const, user }
}
