import React, { createContext, useContext, useMemo } from "react";
import {
  getThemePalette,
  type AppThemeName,
  type AppThemePalette,
} from "../lib/themePreferences";

const AppThemeContext = createContext<AppThemePalette>(getThemePalette("ocean"));

export function AppThemeProvider({
  children,
  themeName,
}: {
  children: React.ReactNode;
  themeName: AppThemeName;
}) {
  const palette = useMemo(() => getThemePalette(themeName), [themeName]);

  return (
    <AppThemeContext.Provider value={palette}>{children}</AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}
