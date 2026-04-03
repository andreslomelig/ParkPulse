import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function getSupabaseClient() {
  return supabase;
}

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Supabase no esta configurado. Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return supabase;
}
