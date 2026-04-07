import { toTrimmedString } from "./parkingShared";
import { getSupabaseClient, requireSupabaseClient } from "./supabase";

export type UserProfile = {
  userId: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  preferredName: string | null;
  avatarUrl: string | null;
  source: "remote";
};

export type UpsertCurrentUserProfileInput = {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  preferredName?: string | null;
  avatarUrl?: string | null;
};

type RawUserProfile = {
  user_id?: string | null;
  email?: string | null;
  phone?: string | null;
  full_name?: string | null;
  preferred_name?: string | null;
  avatar_url?: string | null;
};

function mapRawProfile(profile: RawUserProfile | null | undefined): UserProfile | null {
  const userId = toTrimmedString(profile?.user_id);
  const email = toTrimmedString(profile?.email);

  if (!userId || !email) return null;

  return {
    userId,
    email,
    phone: toTrimmedString(profile?.phone),
    fullName: toTrimmedString(profile?.full_name),
    preferredName: toTrimmedString(profile?.preferred_name),
    avatarUrl: toTrimmedString(profile?.avatar_url),
    source: "remote",
  };
}

async function getAuthenticatedUser() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  return data.user ?? null;
}

export async function fetchCurrentUserProfile(): Promise<UserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) {
    throw new Error(authError.message);
  }

  if (!authData.user?.id) return null;

  const { data, error } = await client
    .from("user_profiles")
    .select("user_id, email, phone, full_name, preferred_name, avatar_url")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapRawProfile((data as RawUserProfile | null) ?? null);
}

export async function upsertCurrentUserProfile(
  input: UpsertCurrentUserProfileInput
): Promise<UserProfile> {
  const client = requireSupabaseClient();
  const user = await getAuthenticatedUser();

  if (!user?.id) {
    throw new Error("Debes iniciar sesión para actualizar tu perfil.");
  }

  const email = toTrimmedString(input.email) ?? toTrimmedString(user.email);
  if (!email) {
    throw new Error("El correo del perfil es obligatorio.");
  }

  const payload = {
    user_id: user.id,
    email,
    phone: toTrimmedString(input.phone),
    full_name: toTrimmedString(input.fullName),
    preferred_name: toTrimmedString(input.preferredName),
    avatar_url: toTrimmedString(input.avatarUrl),
  };

  const { data, error } = await client
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, email, phone, full_name, preferred_name, avatar_url")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const mappedProfile = mapRawProfile((data as RawUserProfile | null) ?? null);
  if (!mappedProfile) {
    throw new Error("No se pudo interpretar el perfil actualizado.");
  }

  return mappedProfile;
}
