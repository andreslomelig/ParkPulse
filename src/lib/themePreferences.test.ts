import {
  APP_THEME_PALETTES,
  fetchThemePreferenceForUser,
  getThemePalette,
  normalizeAppThemeName,
  saveThemePreferenceForUser,
} from "./themePreferences";

describe("themePreferences", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("normalizes theme names and falls back safely", () => {
    expect(normalizeAppThemeName("sunset")).toBe("sunset");
    expect(normalizeAppThemeName("FOREST")).toBe("forest");
    expect(normalizeAppThemeName("invalid")).toBe("ocean");
    expect(normalizeAppThemeName(null)).toBe("ocean");
  });

  it("persists a theme per user", async () => {
    await expect(fetchThemePreferenceForUser("user-1")).resolves.toBe("ocean");
    await expect(saveThemePreferenceForUser("user-1", "forest")).resolves.toBe(
      "forest"
    );
    await expect(fetchThemePreferenceForUser("user-1")).resolves.toBe("forest");
    await expect(fetchThemePreferenceForUser("user-2")).resolves.toBe("ocean");
  });

  it("returns the palette for the requested theme", () => {
    expect(getThemePalette("sunset")).toEqual(APP_THEME_PALETTES.sunset);
    expect(getThemePalette("invalid" as never)).toEqual(APP_THEME_PALETTES.ocean);
  });

  it("requires a user id when reading or writing", async () => {
    await expect(fetchThemePreferenceForUser("")).rejects.toThrow(
      "El usuario es obligatorio para consultar el tema."
    );
    await expect(saveThemePreferenceForUser(" ", "ocean")).rejects.toThrow(
      "El usuario es obligatorio para consultar el tema."
    );
  });
});
