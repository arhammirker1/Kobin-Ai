// Centralized cache configuration for the entire app
// Import this in components instead of hardcoding SWR options

export const CACHE_CONFIG = {
  // Tasks — revalidate every 30s, stale for 10s
  tasks: {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000,
    refreshInterval: 30000,
  },
  // Projects — revalidate every 60s
  projects: {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
    refreshInterval: 60000,
  },
  // Team members — revalidate every 5 minutes
  team: {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    refreshInterval: 300000,
  },
  // CRM — revalidate every 60s
  crm: {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
    refreshInterval: 60000,
  },
  // Events/Calendar — revalidate every 2 minutes
  events: {
    revalidateOnFocus: true,
    dedupingInterval: 30000,
    refreshInterval: 120000,
  },
} as const