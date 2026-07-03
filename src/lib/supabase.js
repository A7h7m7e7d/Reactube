import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when real Supabase credentials are configured. */
export const hasSupabase = Boolean(url && anonKey)

/** Null in demo mode — the store falls back to localStorage. */
export const supabase = hasSupabase ? createClient(url, anonKey) : null
