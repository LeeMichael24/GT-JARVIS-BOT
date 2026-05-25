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
      const data = await fetcher()
      store.set(key, { data, expiresAt: Date.now() + ttlMs })
      return data
    },
    invalidate(key: string): void {
      store.delete(key)
    },
  }
}
