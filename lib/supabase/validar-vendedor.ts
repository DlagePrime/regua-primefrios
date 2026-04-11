import { supabaseAdmin } from '@/lib/supabase/admin'

export async function vendedorExisteNaBase(nomeVendedor: string) {
  const nomeNormalizado = nomeVendedor.trim()

  if (!nomeNormalizado) {
    return false
  }

  const { data, error } = await supabaseAdmin
    .schema('omie_core')
    .from('clientes')
    .select('id')
    .eq('nome_vendedor_padrao_snapshot', nomeNormalizado)
    .limit(1)

  if (error) {
    throw error
  }

  return (data || []).length > 0
}
