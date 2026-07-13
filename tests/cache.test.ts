import { describe, it, expect, vi, afterEach } from 'vitest'
import { createCache } from '@/services/projects/cache'

describe('createCache', () => {
  it('calls fetcher once and returns cached value on second call', async () => {
    const cache = createCache<string>(60_000)
    const fetcher = vi.fn().mockResolvedValue('data')

    const first = await cache.get('key', fetcher)
    const second = await cache.get('key', fetcher)

    expect(first).toBe('data')
    expect(second).toBe('data')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('calls fetcher again after TTL expires', async () => {
    const cache = createCache<string>(50) // 50ms TTL
    const fetcher = vi.fn().mockResolvedValue('fresh')

    await cache.get('key', fetcher)
    await new Promise(r => setTimeout(r, 70)) // wait past TTL
    await cache.get('key', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('calls fetcher separately for different keys', async () => {
    const cache = createCache<string>(60_000)
    const fetcher = vi.fn().mockResolvedValue('value')

    await cache.get('key1', fetcher)
    await cache.get('key2', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('invalidate forces a fresh fetch on next call', async () => {
    const cache = createCache<string>(60_000)
    const fetcher = vi.fn().mockResolvedValue('value')

    await cache.get('key', fetcher)
    cache.invalidate('key')
    await cache.get('key', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('createCache — fallback stale cuando el fetcher falla', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve el valor stale y advierte si el fetcher falla tras un éxito previo (TTL vencido)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createCache<string>(50) // TTL de 50ms
    const fetcher = vi.fn()
      .mockResolvedValueOnce('catalogo-v1')
      .mockRejectedValueOnce(new Error('GT API caída'))

    const first = await cache.get('key', fetcher)
    await new Promise(r => setTimeout(r, 70)) // vence el TTL
    const second = await cache.get('key', fetcher)

    expect(first).toBe('catalogo-v1')
    expect(second).toBe('catalogo-v1') // sirve el último valor bueno conocido
    expect(fetcher).toHaveBeenCalledTimes(2) // sí intentó refrescar
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stale'), expect.any(Error))
  })

  it('propaga el error si el fetcher falla y no hay valor previo', async () => {
    const cache = createCache<string>(60_000)
    const fetcher = vi.fn().mockRejectedValue(new Error('primer fetch falló'))

    await expect(cache.get('key', fetcher)).rejects.toThrow('primer fetch falló')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('un fetch exitoso posterior al fallback stale refresca el valor cacheado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createCache<string>(50)
    const fetcher = vi.fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('caída temporal'))
      .mockResolvedValueOnce('v2')

    await cache.get('key', fetcher)
    await new Promise(r => setTimeout(r, 70)) // vence el TTL
    const stale = await cache.get('key', fetcher) // falla → sirve v1
    const fresh = await cache.get('key', fetcher) // se recupera → v2 (la entrada sigue vencida, reintenta)

    expect(stale).toBe('v1')
    expect(fresh).toBe('v2')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('invalidate descarta también el valor stale: un fetch fallido posterior propaga', async () => {
    const cache = createCache<string>(60_000)
    const fetcher = vi.fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('sin red'))

    await cache.get('key', fetcher)
    cache.invalidate('key')

    await expect(cache.get('key', fetcher)).rejects.toThrow('sin red')
  })
})
