// lib/redis.ts
// Optional Redis cache layer (Upstash). Gracefully degrades if not configured.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in env to enable.

let _redis: any = null

function getRedis(): any | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  if (!_redis) {
    // Dynamic import so the module doesn't break if @upstash/redis isn't installed
    try {
      const { Redis } = require("@upstash/redis")
      _redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    } catch {
      return null
    }
  }
  return _redis
}

/**
 * Cache-aside helper. Falls back to fetcher() if Redis is unavailable.
 * @param key   Cache key
 * @param ttl   TTL in seconds
 * @param fetcher  Async function to call on cache miss
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = getRedis()

  if (redis) {
    try {
      const cached = await redis.get<T>(key)
      if (cached !== null && cached !== undefined) return cached
    } catch {}
  }

  const fresh = await fetcher()

  if (redis) {
    try {
      await redis.set(key, fresh, { ex: ttl })
    } catch {}
  }

  return fresh
}

/**
 * Invalidate one or more cache keys.
 * Silently ignores errors.
 */
export async function bust(...keys: string[]): Promise<void> {
  const redis = getRedis()
  if (!redis || keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch {}
}

/** Cache key helpers — keep keys consistent across the codebase */
export const CK = {
  miniContext: (founderId: string) => `mc:${founderId}`,
  teamWorkload: (founderId: string) => `tw:${founderId}`,
  projects: (founderId: string) => `proj:${founderId}`,
  vaultFiles: (founderId: string, projectId: string) => `vault:${founderId}:${projectId}`,
}