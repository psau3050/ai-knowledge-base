import type { Request } from 'express';
import type { DbClient } from '../supabase/supabase.service.js';

/** Who is calling, and a database client that can only see what they may see. */
export interface UserContext {
  userId: string;
  db: DbClient;
}

export interface AuthenticatedRequest extends Request {
  userContext?: UserContext;
}
