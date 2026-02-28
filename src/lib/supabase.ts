/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

/**
 * Helper to fetch Supabase config from the server if not provided via environment variables.
 * This is useful when using platform "Secrets" which are not prefixed with VITE_.
 */
export async function getSupabaseConfigFromServer() {
  try {
    const response = await fetch('/api/supabase-config');
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error('Failed to fetch Supabase config from server:', e);
    return null;
  }
}

/**
 * Re-initialize the Supabase client with new config
 */
export function initSupabase(url: string, key: string) {
  if (!url || !key) return null;
  return createClient(url, key);
}
