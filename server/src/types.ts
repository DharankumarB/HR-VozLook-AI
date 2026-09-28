import type { NextFunction, Request, Response } from 'express'
import type { Row } from './db/store.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Row
      authProvider?: 'local' | 'supabase' | 'google'
      /** Populated by requireAdmin after a server-side role check. */
      adminProfile?: Row
    }
  }
}

export type Handler = (req: Request, res: Response, next: NextFunction) => unknown
