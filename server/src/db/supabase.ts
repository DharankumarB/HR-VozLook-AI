import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../env.js'
import { TABLES, type TableName } from './schema.js'
import { applyDefaults, type Query, type Row, type Store } from './store.js'

/**
 * Supabase (Postgres + RLS) driver. Activated by setting SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (see DATA_MODE=supabase). The exact same tables live in supabase/migrations/0001_init.sql.
 *
 * The service-role client is used server-side only — it is never exposed to the browser.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url = env.supabase.url, key = env.supabase.serviceRoleKey) {
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Supabase driver')
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  }

  private table(table: TableName) {
    if (!TABLES[table]) throw new Error(`Unknown table: ${table}`)
    return this.client.from(table)
  }

  private normalize(table: TableName, values: Row, isInsert: boolean): Row {
    const row = applyDefaults(table, values, isInsert)
    const json = TABLES[table].jsonColumns
    const allowed = TABLES[table].columns
    const out: Row = {}
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined) continue
      if (!allowed.includes(key)) throw new Error(`Unknown column ${table}.${key}`)
      if (json.includes(key) && typeof value === 'string') {
        try {
          out[key] = JSON.parse(value)
        } catch {
          out[key] = value
        }
      } else {
        out[key] = value
      }
    }
    return out
  }

  private fail(error: { message?: string } | null, context: string): never {
    throw new Error(`Supabase ${context} failed: ${error?.message ?? 'unknown error'}`)
  }

  async insert<T = Row>(table: TableName, values: Row): Promise<T> {
    const row = this.normalize(table, values, true)
    const { data, error } = await this.table(table).insert(row).select('*').single()
    if (error) this.fail(error, `insert into ${table}`)
    return data as T
  }

  async insertMany(table: TableName, values: Row[]): Promise<Row[]> {
    if (!values.length) return []
    const rows = values.map((v) => this.normalize(table, v, true))
    const { data, error } = await this.table(table).insert(rows).select('*')
    if (error) this.fail(error, `bulk insert into ${table}`)
    return (data ?? []) as Row[]
  }

  private applyFilters(builder: any, where: Row = {}) {
    let b = builder
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue
      if (value === null) b = b.is(key, null)
      else if (Array.isArray(value)) b = b.in(key, value)
      else b = b.eq(key, value)
    }
    return b
  }

  async findOne<T = Row>(table: TableName, query: Query = {}): Promise<T | null> {
    let builder: any = this.applyFilters(this.table(table).select('*'), query.where)
    if (query.order) builder = builder.order(query.order.column, { ascending: query.order.ascending !== false })
    const { data, error } = await builder.limit(1).maybeSingle()
    if (error) this.fail(error, `select from ${table}`)
    return (data as T) ?? null
  }

  async findById<T = Row>(table: TableName, id: string): Promise<T | null> {
    return this.findOne<T>(table, { where: { id } })
  }

  async findMany<T = Row>(table: TableName, query: Query = {}): Promise<T[]> {
    let builder: any = this.applyFilters(this.table(table).select('*'), query.where)
    if (query.order) builder = builder.order(query.order.column, { ascending: query.order.ascending !== false })
    if (query.limit != null) {
      const from = query.offset ?? 0
      builder = builder.range(from, from + query.limit - 1)
    } else if (query.offset != null) {
      builder = builder.range(query.offset, query.offset + 999)
    }
    const { data, error } = await builder
    if (error) this.fail(error, `select from ${table}`)
    return (data ?? []) as T[]
  }

  async update(table: TableName, where: Row, patch: Row): Promise<number> {
    const rows = this.normalize(table, patch, false)
    if (!Object.keys(rows).length) return 0
    let builder: any = this.table(table).update(rows)
    builder = this.applyFilters(builder, where)
    const { data, error } = await builder.select('id')
    if (error) this.fail(error, `update ${table}`)
    return Array.isArray(data) ? data.length : 0
  }

  async updateById(table: TableName, id: string, patch: Row): Promise<number> {
    return this.update(table, { id }, patch)
  }

  async remove(table: TableName, where: Row): Promise<number> {
    let builder: any = this.table(table).delete()
    builder = this.applyFilters(builder, where)
    const { data, error } = await builder.select('id')
    if (error) this.fail(error, `delete from ${table}`)
    return Array.isArray(data) ? data.length : 0
  }

  async count(table: TableName, where: Row = {}): Promise<number> {
    let builder: any = this.applyFilters(this.table(table).select('id', { count: 'exact', head: true }), where)
    const { count, error } = await builder
    if (error) this.fail(error, `count ${table}`)
    return count ?? 0
  }

  async ping(): Promise<boolean> {
    const { error } = await this.client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
    return !error
  }
}
