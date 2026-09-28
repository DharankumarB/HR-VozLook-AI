import type { TableName } from './schema.js'

export type Row = Record<string, any>

export interface Query {
  where?: Row
  order?: { column: string; ascending?: boolean }
  limit?: number
  offset?: number
}

/**
 * Storage-agnostic data access interface. Business logic (routes/services) only ever talks to
 * this interface, so the app runs on SQLite in local mode and on Supabase Postgres in production
 * without a single line of business logic changing.
 */
export interface Store {
  kind: 'sqlite' | 'supabase'
  insert<T = Row>(table: TableName, values: Row): Promise<T>
  insertMany(table: TableName, values: Row[]): Promise<Row[]>
  findOne<T = Row>(table: TableName, query?: Query): Promise<T | null>
  findById<T = Row>(table: TableName, id: string): Promise<T | null>
  findMany<T = Row>(table: TableName, query?: Query): Promise<T[]>
  update(table: TableName, where: Row, patch: Row): Promise<number>
  updateById(table: TableName, id: string, patch: Row): Promise<number>
  remove(table: TableName, where: Row): Promise<number>
  count(table: TableName, where?: Row): Promise<number>
  /** Health probe used by /api/health. */
  ping(): Promise<boolean>
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}

export function applyDefaults(table: TableName, values: Row, isInsert: boolean): Row {
  const out: Row = { ...values }
  const ts = nowIso()
  if (isInsert && 'id' in DEFAULT_COLUMNS[table] && !out.id) out.id = newId()
  if (isInsert && DEFAULT_COLUMNS[table].created_at && !out.created_at) out.created_at = ts
  if (DEFAULT_COLUMNS[table].updated_at) out.updated_at = ts
  return out
}

/** Which columns exist per table (mirrors db/schema.ts) so we can auto-fill id/created_at/updated_at. */
const DEFAULT_COLUMNS: Record<string, { id?: boolean; created_at?: boolean; updated_at?: boolean }> = {
  users: { id: true, created_at: true, updated_at: true },
  password_resets: { id: true, created_at: true },
  profiles: { id: true, created_at: true, updated_at: true },
  resumes: { id: true, created_at: true, updated_at: true },
  job_descriptions: { id: true, created_at: true, updated_at: true },
  interviews: { id: true, created_at: true, updated_at: true },
  interview_questions: { id: true, created_at: true },
  interview_answers: { id: true, created_at: true },
  answer_evaluations: { id: true, created_at: true },
  interview_reports: { id: true, created_at: true, updated_at: true },
  interview_progress: { id: true, created_at: true },
}
