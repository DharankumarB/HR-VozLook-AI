import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { env } from '../env.js'
import { TABLES, type TableName } from './schema.js'
import { applyDefaults, type Query, type Row, type Store } from './store.js'

/**
 * Local / self-hosted driver: SQLite compiled to WebAssembly (sql.js).
 *
 * Why WASM: it needs no native toolchain, so `npm install` works on any machine — including
 * sandboxes and laptops without build tools. The database is kept in memory and flushed to disk
 * atomically (temp file + rename), with a flush on every write plus process-exit hooks.
 */

const require = createRequire(import.meta.url)

let sqlJs: SqlJsStatic | null = null

function resolveWasm(): string {
  const candidates: string[] = []
  try {
    candidates.push(path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'))
  } catch {
    /* ignore */
  }
  // Walk up from this file (works for both node_modules layouts and monorepo hoisting).
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  candidates.push(path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('Unable to locate sql-wasm.wasm from the sql.js package')
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs
  const wasmPath = resolveWasm()
  sqlJs = await initSqlJs({ locateFile: () => wasmPath })
  return sqlJs
}

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  auth_provider TEXT DEFAULT 'password',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  target_role TEXT,
  company TEXT,
  experience_level TEXT,
  preferred_mode TEXT,
  preferred_language TEXT DEFAULT 'en',
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  extracted_text TEXT,
  parsed_data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_descriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  company TEXT,
  description TEXT,
  parsed_requirements TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resume_id TEXT,
  job_description_id TEXT,
  job_role TEXT NOT NULL,
  interview_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  interview_mode TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  settings TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  current_question_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  overall_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interview_questions (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL,
  question_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  expected_topics TEXT,
  resume_anchor TEXT,
  is_follow_up INTEGER DEFAULT 0,
  parent_question_id TEXT,
  generation TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interview_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE,
  interview_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  answer_text TEXT,
  audio_url TEXT,
  video_url TEXT,
  duration_seconds REAL,
  media_metrics TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS answer_evaluations (
  id TEXT PRIMARY KEY,
  answer_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  relevance_score REAL,
  technical_score REAL,
  completeness_score REAL,
  clarity_score REAL,
  structure_score REAL,
  communication_score REAL,
  problem_solving_score REAL,
  confidence_score REAL,
  coverage TEXT,
  feedback TEXT,
  strengths TEXT,
  improvements TEXT,
  signals TEXT,
  engine TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interview_reports (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  overall_score REAL,
  technical_score REAL,
  communication_score REAL,
  problem_solving_score REAL,
  relevance_score REAL,
  confidence_score REAL,
  role_alignment_score REAL,
  summary TEXT,
  strengths TEXT,
  weaknesses TEXT,
  recommendations TEXT,
  improvement_plan TEXT,
  recommended_topics TEXT,
  question_reviews TEXT,
  scoring_methodology TEXT,
  report_json TEXT,
  engine TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interview_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_interview ON interview_questions(interview_id, question_number);
CREATE INDEX IF NOT EXISTS idx_answers_interview ON interview_answers(interview_id);
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON interview_progress(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_user_status ON interviews(user_id, status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, created_at DESC);
`

/**
 * Forward-only, additive migrations: any column declared in schema.ts but missing from an
 * existing database file is added on boot, so local databases survive app upgrades.
 */
function migrateColumns(db: Database) {
  for (const [table, def] of Object.entries(TABLES)) {
    const info = db.exec(`PRAGMA table_info(${table})`)
    const row = info[0]
    if (!row) continue
    const existing = new Set(row.values.map((values) => String(values[1])))
    for (const column of def.columns) {
      if (existing.has(column)) continue
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
        console.log(`[vozlook][sqlite] added missing column ${table}.${column}`)
      } catch (error) {
        console.warn(`[vozlook][sqlite] could not add ${table}.${column}:`, (error as Error).message)
      }
    }
  }
}

export class SqliteStore implements Store {
  readonly kind = 'sqlite' as const
  private db: Database
  private file: string
  private flushTimer: NodeJS.Timeout | null = null
  private closed = false

  private constructor(db: Database, file: string) {
    this.db = db
    this.file = file
    const flush = () => this.flushSync()
    process.once('exit', flush)
    process.once('SIGINT', () => {
      flush()
      process.exit(0)
    })
    process.once('SIGTERM', () => {
      flush()
      process.exit(0)
    })
  }

  static async create(file: string = env.dbFile): Promise<SqliteStore> {
    const SQL = await loadSqlJs()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const existing = fs.existsSync(file) ? fs.readFileSync(file) : null
    const db = existing && existing.length ? new SQL.Database(existing) : new SQL.Database()
    db.exec(DDL)
    migrateColumns(db)
    return new SqliteStore(db, file)
  }

  /* ----------------------------- persistence ----------------------------- */

  private scheduleFlush(delay = 60) {
    if (this.closed) return
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flushSync(), delay)
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref()
  }

  flushSync() {
    if (this.closed) return
    try {
      const data = this.db.export()
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, Buffer.from(data))
      fs.renameSync(tmp, this.file)
    } catch (error) {
      console.error('[vozlook][sqlite] failed to persist database:', (error as Error).message)
    }
  }

  /* ------------------------------ primitives ------------------------------ */

  private all(sql: string, params: unknown[] = []): Row[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params as any)
      const rows: Row[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as Row)
      return rows
    } finally {
      stmt.free()
    }
  }

  private get(sql: string, params: unknown[] = []): Row | undefined {
    return this.all(sql, params)[0]
  }

  private mutate(sql: string, params: unknown[] = []) {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params as any)
      stmt.step()
    } finally {
      stmt.free()
    }
  }

  /* ------------------------- validation / encoding ------------------------ */

  private assertTable(table: TableName) {
    if (!TABLES[table]) throw new Error(`Unknown table: ${table}`)
  }

  private assertColumns(table: TableName, values: Row) {
    const allowed = TABLES[table].columns
    for (const key of Object.keys(values)) {
      if (!allowed.includes(key)) throw new Error(`Unknown column ${table}.${key}`)
    }
  }

  private encode(table: TableName, values: Row): Row {
    const json = TABLES[table].jsonColumns
    const out: Row = {}
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue
      out[key] = json.includes(key) && value !== null ? JSON.stringify(value) : value
    }
    return out
  }

  private decode(table: TableName, row: Row | undefined): Row | null {
    if (!row) return null
    const json = TABLES[table].jsonColumns
    const out: Row = { ...row }
    for (const key of json) {
      const raw = out[key]
      if (typeof raw === 'string' && raw.length) {
        try {
          out[key] = JSON.parse(raw)
        } catch {
          out[key] = raw
        }
      }
    }
    return out
  }

  private whereClause(where: Row = {}, prefix = ''): { sql: string; params: unknown[] } {
    const parts: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue
      const col = `${prefix}${key}`
      if (value === null) parts.push(`${col} IS NULL`)
      else if (Array.isArray(value)) {
        if (!value.length) {
          parts.push('0 = 1')
          continue
        }
        parts.push(`${col} IN (${value.map(() => '?').join(', ')})`)
        params.push(...value)
      } else {
        parts.push(`${col} = ?`)
        params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value)
      }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params }
  }

  /* ------------------------------- Store API ------------------------------ */

  async insert<T = Row>(table: TableName, values: Row): Promise<T> {
    return this.insertSync(table, values) as T
  }

  insertSync(table: TableName, values: Row): Row {
    this.assertTable(table)
    const row = applyDefaults(table, values, true)
    this.assertColumns(table, row)
    const encoded = this.encode(table, row)
    const cols = Object.keys(encoded)
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    this.mutate(sql, cols.map((c) => encoded[c]))
    this.scheduleFlush()
    return this.decode(table, this.get(`SELECT * FROM ${table} WHERE id = ?`, [row.id]))!
  }

  async insertMany(table: TableName, values: Row[]): Promise<Row[]> {
    return values.map((value) => this.insertSync(table, value))
  }

  async findOne<T = Row>(table: TableName, query: Query = {}): Promise<T | null> {
    this.assertTable(table)
    const where = this.whereClause(query.where)
    const order = query.order ? ` ORDER BY ${query.order.column} ${query.order.ascending === false ? 'DESC' : 'ASC'}` : ''
    return this.decode(table, this.get(`SELECT * FROM ${table}${where.sql}${order} LIMIT 1`, where.params)) as T | null
  }

  async findById<T = Row>(table: TableName, id: string): Promise<T | null> {
    return this.findOne<T>(table, { where: { id } })
  }

  async findMany<T = Row>(table: TableName, query: Query = {}): Promise<T[]> {
    this.assertTable(table)
    const where = this.whereClause(query.where)
    const order = query.order ? ` ORDER BY ${query.order.column} ${query.order.ascending === false ? 'DESC' : 'ASC'}` : ''
    let sql = `SELECT * FROM ${table}${where.sql}${order}`
    if (query.limit != null) sql += ` LIMIT ${Number(query.limit)}`
    if (query.offset != null) sql += ` OFFSET ${Number(query.offset)}`
    return this.all(sql, where.params).map((row) => this.decode(table, row)) as T[]
  }

  async update(table: TableName, where: Row, patch: Row): Promise<number> {
    this.assertTable(table)
    const encoded = this.encode(table, applyDefaults(table, patch, false))
    this.assertColumns(table, encoded)
    const cols = Object.keys(encoded)
    if (!cols.length) return 0
    const before = await this.count(table, where)
    const w = this.whereClause(where)
    const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}${w.sql}`
    this.mutate(sql, [...cols.map((c) => encoded[c]), ...w.params])
    this.scheduleFlush()
    return before
  }

  async updateById(table: TableName, id: string, patch: Row): Promise<number> {
    return this.update(table, { id }, patch)
  }

  async remove(table: TableName, where: Row): Promise<number> {
    this.assertTable(table)
    const before = await this.count(table, where)
    const w = this.whereClause(where)
    this.mutate(`DELETE FROM ${table}${w.sql}`, w.params)
    this.scheduleFlush()
    return before
  }

  async count(table: TableName, where: Row = {}): Promise<number> {
    this.assertTable(table)
    const w = this.whereClause(where)
    const row = this.get(`SELECT COUNT(*) as c FROM ${table}${w.sql}`, w.params)
    return Number(row?.c ?? 0)
  }

  async ping(): Promise<boolean> {
    try {
      this.get('SELECT 1 as ok')
      return true
    } catch {
      return false
    }
  }

  close() {
    this.closed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushSync()
    this.db.close()
  }
}
