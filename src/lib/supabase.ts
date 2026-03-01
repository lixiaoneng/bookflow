/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = !!supabaseUrl && !!supabaseAnonKey;

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

/**
 * Re-initialize the Supabase client with new config
 */
export function initSupabase(url: string, key: string) {
  if (!url || !key) return null;
  return createClient(url, key);
}
