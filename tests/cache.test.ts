import { describe, it, expect, vi } from 'vitest'
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
