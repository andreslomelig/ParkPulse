import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type SupabaseSessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function hasStorageMethods(value: unknown): value is SupabaseSessionStorage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as SupabaseSessionStorage).getItem === "function" &&
      typeof (value as SupabaseSessionStorage).setItem === "function" &&
      typeof (value as SupabaseSessionStorage).removeItem === "function"
  );
}

export function isNativeStorageUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    message.includes("Native module is null") ||
    message.includes("cannot access legacy storage")
  );
}

export function createMemoryStorage(): SupabaseSessionStorage {
  const store = new Map<string, string>();

  return {
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

export function createSessionStorage(
  nativeStorage: unknown = AsyncStorage
): SupabaseSessionStorage {
  const memoryStorage = createMemoryStorage();
  const safeNativeStorage = hasStorageMethods(nativeStorage) ? nativeStorage : null;
  let hasWarned = false;

  const warnAndFallback = async <T>(fallback: () => Promise<T>) => {
    if (!hasWarned) {
      hasWarned = true;
      console.warn(
        "AsyncStorage nativo no esta disponible. Se usara una sesion en memoria para evitar fallos de autenticacion."
      );
    }

    return fallback();
  };

  const runWithFallback = async <T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ) => {
    try {
      return await operation();
    } catch (error) {
      if (!isNativeStorageUnavailableError(error)) {
        throw error;
      }

      return warnAndFallback(fallback);
    }
  };

  if (!safeNativeStorage) {
    return memoryStorage;
  }

  return {
    async getItem(key) {
      return runWithFallback(
        () => safeNativeStorage.getItem(key),
        () => memoryStorage.getItem(key)
      );
    },
    async setItem(key, value) {
      return runWithFallback(
        () => safeNativeStorage.setItem(key, value),
        () => memoryStorage.setItem(key, value)
      );
    },
    async removeItem(key) {
      return runWithFallback(
        () => safeNativeStorage.removeItem(key),
        () => memoryStorage.removeItem(key)
      );
    },
  };
}

export const sessionStorage = createSessionStorage();

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
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
