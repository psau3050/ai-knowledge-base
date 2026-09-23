import { Inject, Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import type { Database } from './database.types.js';

export type DbClient = SupabaseClient<Database>;

// The API is stateless: never persist or refresh sessions server-side.
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

@Injectable()
export class SupabaseService {
  private readonly authClient: DbClient;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.authClient = createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
      auth: SERVER_AUTH,
    });
  }

  /**
   * Returns the user id for a valid Supabase access token, or null.
   * `getClaims` verifies asymmetric tokens locally against the project's JWKS and falls back to asking
   * the Auth server for symmetric ones.
   */
  async verifyAccessToken(token: string): Promise<string | null> {
    const { data, error } = await this.authClient.auth.getClaims(token);
    if (error || !data?.claims.sub) return null;
    return data.claims.sub;
  }

  /**
   * A client that acts as the user: PostgREST receives their JWT, so Row Level Security applies to
   * every query. The API never uses the service-role key.
   */
  forUser(accessToken: string): DbClient {
    return createClient<Database>(this.config.supabase.url, this.config.supabase.publishableKey, {
      auth: SERVER_AUTH,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
}
