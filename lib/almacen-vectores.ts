import { getServiceClient } from '@/lib/supabase'
import { MODELO_EMBEDDINGS, type AlmacenVectores } from '@/lib/memoria'

/**
 * Almacén de vectores en Supabase (tabla memoria_vectores, migración 023).
 * Cada texto se vectoriza una sola vez en la vida; la similitud la calcula
 * Postgres con pgvector y aquí solo vuelven los hashes ganadores.
 *
 * Si la migración no está aplicada, cada método lanza y `recuperar` baja al
 * cálculo en el proceso — Daniela responde igual.
 */

/** pgvector recibe el vector como texto "[0.1,0.2,…]" */
function aTexto(v: number[]): string {
  return `[${v.join(',')}]`
}

export function almacenSupabase(modelo = MODELO_EMBEDDINGS): AlmacenVectores {
  const db = getServiceClient()
  return {
    async faltantes(hashes) {
      if (!hashes.length) return []
      const { data, error } = await db.rpc('memoria_faltantes', { p_hashes: hashes, p_modelo: modelo })
      if (error) throw new Error(`memoria_faltantes: ${error.message}`)
      return ((data as unknown[]) ?? []).map(r => (typeof r === 'string' ? r : String(Object.values(r as object)[0])))
    },
    async guardar(filas) {
      if (!filas.length) return
      const { error } = await db
        .from('memoria_vectores')
        .upsert(
          filas.map(f => ({ hash: f.hash, modelo, fuente: f.fuente, vector: aTexto(f.vector) })),
          { onConflict: 'hash,modelo', ignoreDuplicates: true },
        )
      if (error) throw new Error(`memoria_vectores: ${error.message}`)
    },
    async cercanos(consulta, hashes, k) {
      if (!hashes.length) return []
      const { data, error } = await db.rpc('memoria_cercanos', {
        p_consulta: aTexto(consulta), p_hashes: hashes, p_modelo: modelo, p_k: k,
      })
      if (error) throw new Error(`memoria_cercanos: ${error.message}`)
      return ((data as { hash: string; similitud: number }[]) ?? []).map(r => ({ hash: r.hash, similitud: Number(r.similitud) }))
    },
  }
}
