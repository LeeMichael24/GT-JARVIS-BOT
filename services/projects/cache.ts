interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface Cache<T> {
  get(key: string, fetcher: () => Promise<T>): Promise<T>
  invalidate(key: string): void
}

export function createCache<T>(ttlMs: number): Cache<T> {
  const store = new Map<string, CacheEntry<T>>()

  return {
    async get(key: string, fetcher: () => Promise<T>): Promise<T> {
      const entry = store.get(key)
      if (entry && entry.expiresAt > Date.now()) {
        return entry.data
      }
      try {
        const data = await fetcher()
        store.set(key, { data, expiresAt: Date.now() + ttlMs })
        return data
      } catch (error) {
        // Fallback stale: si el refresh falla pero tenemos un valor previo
        // (aunque su TTL ya venció, la entrada se conserva en el Map),
        // servimos el último valor bueno conocido en vez de fallar.
        // Un catálogo desactualizado es mejor que dejar al cliente sin respuesta.
        if (entry) {
          console.warn(
            `[cache] Fetch falló para "${key}"; sirviendo el último valor conocido (stale)`,
            error,
          )
          return entry.data
        }
        // Sin valor previo no hay nada que servir: propagamos el error
        // (el caller ya lo captura y degrada, p. ej. a catálogo vacío)
        throw error
      }
    },
    invalidate(key: string): void {
      store.delete(key)
    },
  }
}
