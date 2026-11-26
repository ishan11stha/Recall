import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  DARK_COLORS,
  FONT_FAMILIES,
  FONT_SCALE_MULTIPLIER,
  LIGHT_COLORS,
  RADIUS,
  SPACING,
  type RecallTheme,
} from './tokens';
import type { FontSizePreference, ThemeMode } from '../types/models';

interface ThemeContextValue {
  theme: RecallTheme;
  mode: ThemeMode;
  fontSize: FontSizePreference;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: {
    isDark: false,
    colors: LIGHT_COLORS,
    spacing: SPACING,
    radius: RADIUS,
    fonts: FONT_FAMILIES,
    fontScale: 1,
  },
  mode: 'system',
  fontSize: 'medium',
});

interface ThemeProviderProps {
  mode: ThemeMode;
  fontSize: FontSizePreference;
  children: React.ReactNode;
}

export function ThemeProvider({ mode, fontSize, children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      fontSize,
      theme: {
        isDark,
        colors: isDark ? DARK_COLORS : LIGHT_COLORS,
        spacing: SPACING,
        radius: RADIUS,
        fonts: FONT_FAMILIES,
        fontScale: FONT_SCALE_MULTIPLIER[fontSize],
      },
    }),
    [isDark, mode, fontSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): RecallTheme {
  return useContext(ThemeContext).theme;
}
