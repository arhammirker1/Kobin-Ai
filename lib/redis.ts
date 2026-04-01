// lib/redis.ts
// Optional Redis cache layer (Upstash). Gracefully degrades if not configured.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in env to enable.

import { aiLogger } from "./ai/performance-logger"

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

// In-memory L1 cache for ultra-fast repeated accesses within same request
const L1_CACHE = new Map<string, { value: any; expiresAt: number }>()
const L1_TTL_MS = 5000 // 5 seconds

function getL1(key: string): any | null {
  const entry = L1_CACHE.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    L1_CACHE.delete(key)
    return null
  }
  return entry.value
}

function setL1(key: string, value: any): void {
  L1_CACHE.set(key, { value, expiresAt: Date.now() + L1_TTL_MS })
  // Cleanup old entries periodically
  if (L1_CACHE.size > 100) {
    const now = Date.now()
    for (const [k, v] of L1_CACHE.entries()) {
      if (now > v.expiresAt) L1_CACHE.delete(k)
    }
  }
}

// Request context for logging
let _requestId: string | null = null
export function setRequestId(id: string): void {
  _requestId = id
}
export function getRequestId(): string | null {
  return _requestId
}

/**
 * Cache-aside helper. Falls back to fetcher() if Redis is unavailable.
 * Uses L1 (memory) + L2 (Redis) caching strategy.
 * @param key   Cache key
 * @param ttl   TTL in seconds
 * @param fetcher  Async function to call on cache miss
 */
export async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const requestId = getRequestId() || "unknown"

  // Check L1 cache first (in-memory)
  const l1Hit = getL1(key)
  if (l1Hit !== null) {
    aiLogger.cache.hit(requestId, key + " [L1]")
    return l1Hit
  }

  const redis = getRedis()

  if (redis) {
    try {
      const start = Date.now()
      const cached = await redis.get<T>(key)
      const elapsed = Date.now() - start

      if (cached !== null && cached !== undefined) {
        aiLogger.cache.hit(requestId, key + " [L2]")
        // Store in L1 for fast repeated access
        setL1(key, cached)
        return cached
      }
      aiLogger.cache.miss(requestId, key)
    } catch (err) {
      aiLogger.error(requestId, "Redis get", err)
    }
  }

  // Cache miss - fetch fresh data
  const fetchStart = Date.now()
  const fresh = await fetcher()
  const fetchDuration = Date.now() - fetchStart

  if (redis) {
    try {
      const serialized = JSON.stringify(fresh)
      aiLogger.cache.write(requestId, key, ttl, serialized.length)
      await redis.set(key, fresh, { ex: ttl })
    } catch (err) {
      aiLogger.error(requestId, "Redis set", err)
    }
  }

  // Store in L1 cache
  setL1(key, fresh)

  return fresh
}

/**
 * Invalidate one or more cache keys.
 * Silently ignores errors.
 */
export async function bust(...keys: string[]): Promise<void> {
  const requestId = getRequestId() || "unknown"
  
  // Clear from L1 cache
  for (const key of keys) {
    L1_CACHE.delete(key)
  }

  const redis = getRedis()
  if (!redis || keys.length === 0) return
  try {
    await redis.del(...keys)
    console.log(`[${requestId}] 💾 CACHE BUST → ${keys.join(", ")}`)
  } catch (err) {
    aiLogger.error(requestId, "Redis bust", err)
  }
}

/** Cache key helpers — keep keys consistent across the codebase */
export const CK = {
  miniContext: (founderId: string) => `mc:${founderId}`,
  teamWorkload: (founderId: string) => `tw:${founderId}`,
  projects: (founderId: string) => `proj:${founderId}`,
  vaultFiles: (founderId: string, projectId: string) => `vault:${founderId}:${projectId}`,
  overview: (founderId: string) => `overview:${founderId}`,
  tasks: (founderId: string, filter: string) => `tasks:${founderId}:${filter}`,
  calendar: (founderId: string, range: string) => `cal:${founderId}:${range}`,
}