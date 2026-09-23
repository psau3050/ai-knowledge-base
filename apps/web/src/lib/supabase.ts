import { createBrowserClient } from '@supabase/ssr';
import { env } from './env';

/**
 * The browser only talks to Supabase for authentication; all data goes through the API.
 * The session lives in cookies so the proxy can refresh it and gate routes server-side.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
