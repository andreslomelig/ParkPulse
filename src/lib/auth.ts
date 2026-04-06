import { toTrimmedString } from "./parkingShared";
import { getSupabaseClient, requireSupabaseClient } from "./supabase";

export type AuthenticatedAppUser = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
};

export type SignUpResult = {
  user: AuthenticatedAppUser;
  needsEmailConfirmation: boolean;
};

type RawAuthUser = {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  user_metadata?: {
    full_name?: string | null;
    phone?: string | null;
  } | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_DIGIT_REGEX = /\d/;
const PASSWORD_SIGN_REGEX = /[^A-Za-z0-9]/;
const PHONE_DIGIT_REGEX = /\d/g;

function mapAuthUser(user: RawAuthUser | null | undefined): AuthenticatedAppUser | null {
  const id = toTrimmedString(user?.id);
  const email = toTrimmedString(user?.email);

  if (!id || !email) return null;

  return {
    id,
    email,
    fullName: toTrimmedString(user?.user_metadata?.full_name),
    phone: toTrimmedString(user?.phone) ?? toTrimmedString(user?.user_metadata?.phone),
  };
}

function readPassword(value: unknown) {
  if (typeof value !== "string") return null;
  return value;
}

function validateEmail(email: string | null) {
  return Boolean(email && EMAIL_REGEX.test(email));
}

function validatePhone(phone: string | null) {
  if (!phone) return false;

  const digitCount = (phone.match(PHONE_DIGIT_REGEX) ?? []).length;
  return digitCount >= 8 && digitCount <= 15;
}

function validatePassword(password: string | null) {
  if (!password) return false;
  if (password.length < 8 || password.length > 20) return false;
  if (!PASSWORD_UPPERCASE_REGEX.test(password)) return false;
  if (!PASSWORD_DIGIT_REGEX.test(password)) return false;
  if (!PASSWORD_SIGN_REGEX.test(password)) return false;
  return true;
}

export function normalizeSignInInput(input: SignInInput) {
  const email = toTrimmedString(input.email);
  const password = readPassword(input.password);

  if (!email || !validateEmail(email)) {
    throw new Error("Ingresa un correo valido.");
  }

  if (!password) {
    throw new Error("La contrasena es obligatoria.");
  }

  return {
    email,
    password,
  };
}

export function normalizeSignUpInput(input: SignUpInput) {
  const fullName = toTrimmedString(input.fullName);
  const email = toTrimmedString(input.email);
  const phone = toTrimmedString(input.phone);
  const password = readPassword(input.password);

  if (!fullName) {
    throw new Error("El nombre completo es obligatorio.");
  }

  if (!email || !validateEmail(email)) {
    throw new Error("Ingresa un correo valido.");
  }

  if (!validatePhone(phone)) {
    throw new Error("Ingresa un telefono valido.");
  }

  if (!validatePassword(password)) {
    throw new Error(
      "La contrasena debe tener 8 a 20 caracteres, una mayuscula, un numero y un signo."
    );
  }

  return {
    fullName,
    email,
    phone: phone as string,
    password: password as string,
  };
}

export async function getCurrentAuthUser(): Promise<AuthenticatedAppUser | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  return mapAuthUser(data.session?.user);
}

export function subscribeToAuthChanges(
  listener: (user: AuthenticatedAppUser | null) => void
) {
  const client = getSupabaseClient();
  if (!client) {
    return () => undefined;
  }

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    listener(mapAuthUser(session?.user));
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithPassword(
  input: SignInInput
): Promise<AuthenticatedAppUser> {
  const normalizedInput = normalizeSignInInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedInput.email,
    password: normalizedInput.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = mapAuthUser(data.user);
  if (!user) {
    throw new Error("No se pudo iniciar sesion.");
  }

  return user;
}

export async function signUpWithPassword(
  input: SignUpInput
): Promise<SignUpResult> {
  const normalizedInput = normalizeSignUpInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.auth.signUp({
    email: normalizedInput.email,
    password: normalizedInput.password,
    options: {
      data: {
        full_name: normalizedInput.fullName,
        phone: normalizedInput.phone,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = mapAuthUser(data.user);
  if (!user) {
    throw new Error("No se pudo crear la cuenta.");
  }

  return {
    user,
    needsEmailConfirmation: !data.session,
  };
}

export async function signOutCurrentUser() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}
