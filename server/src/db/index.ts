import { env } from '../env.js'
import type { Store } from './store.js'
import { SqliteStore } from './sqlite.js'
import { SupabaseStore } from './supabase.js'

let instance: Store | null = null

/** Creates the storage driver once at boot (SQLite needs async WASM initialisation). */
export async function initStore(): Promise<Store> {
  if (!instance) {
    instance = env.dataMode === 'supabase' ? new SupabaseStore() : await SqliteStore.create()
  }
  return instance
}

export function getStore(): Store {
  if (!instance) {
    throw new Error('Data store has not been initialised yet — call initStore() during boot.')
  }
  return instance
}

export function setStore(store: Store) {
  instance = store
}

export function peekStore(): Store | null {
  return instance
}
