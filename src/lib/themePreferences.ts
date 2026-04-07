import { createSessionStorage } from "./supabase";
import { toTrimmedString } from "./parkingShared";

export type AppThemeName = "ocean" | "sunset" | "forest";

export type AppThemePalette = {
  name: AppThemeName;
  label: string;
  description: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
};

const STORAGE_KEY_PREFIX = "parkpulse:theme:";
const DEFAULT_THEME_NAME: AppThemeName = "ocean";
const themePreferenceStorage = createSessionStorage();

export const APP_THEME_PALETTES: Record<AppThemeName, AppThemePalette> = {
  ocean: {
    name: "ocean",
    label: "Océano",
    description: "Azules limpios para un estilo fresco y técnico.",
    primary: "#0f172a",
    primarySoft: "#e0f2fe",
    accent: "#0891b2",
    accentSoft: "#cffafe",
    surface: "#f8fafc",
    surfaceAlt: "#ffffff",
    text: "#0f172a",
    textMuted: "#475569",
  },
  sunset: {
    name: "sunset",
    label: "Atardecer",
    description: "Naranjas y vino para un perfil más cálido.",
    primary: "#7c2d12",
    primarySoft: "#ffedd5",
    accent: "#ea580c",
    accentSoft: "#fed7aa",
    surface: "#fff7ed",
    surfaceAlt: "#ffffff",
    text: "#431407",
    textMuted: "#9a3412",
  },
  forest: {
    name: "forest",
    label: "Bosque",
    description: "Verdes sobrios para una interfaz más tranquila.",
    primary: "#14532d",
    primarySoft: "#dcfce7",
    accent: "#16a34a",
    accentSoft: "#bbf7d0",
    surface: "#f0fdf4",
    surfaceAlt: "#ffffff",
    text: "#052e16",
    textMuted: "#166534",
  },
};

function getThemeStorageKey(userId: string) {
  const normalizedUserId = toTrimmedString(userId);
  if (!normalizedUserId) {
    throw new Error("El usuario es obligatorio para consultar el tema.");
  }

  return `${STORAGE_KEY_PREFIX}${normalizedUserId}`;
}

export function normalizeAppThemeName(value: unknown): AppThemeName {
  const normalizedValue = toTrimmedString(value)?.toLowerCase();

  if (
    normalizedValue === "ocean" ||
    normalizedValue === "sunset" ||
    normalizedValue === "forest"
  ) {
    return normalizedValue;
  }

  return DEFAULT_THEME_NAME;
}

export async function fetchThemePreferenceForUser(userId: string): Promise<AppThemeName> {
  const rawValue = await themePreferenceStorage.getItem(getThemeStorageKey(userId));
  return normalizeAppThemeName(rawValue);
}

export async function saveThemePreferenceForUser(
  userId: string,
  themeName: AppThemeName
): Promise<AppThemeName> {
  const normalizedThemeName = normalizeAppThemeName(themeName);
  await themePreferenceStorage.setItem(
    getThemeStorageKey(userId),
    normalizedThemeName
  );

  return normalizedThemeName;
}

export function getThemePalette(themeName: AppThemeName | null | undefined) {
  return APP_THEME_PALETTES[normalizeAppThemeName(themeName)];
}
