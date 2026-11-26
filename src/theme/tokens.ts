import type { FontSizePreference } from '../types/models';

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  border: string;
  borderStrong: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
}

export const LIGHT_COLORS: ColorTokens = {
  background: '#F8F8F6',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F1EE',
  textPrimary: '#202124',
  textSecondary: '#777982',
  textTertiary: '#9B9DA5',
  accent: '#6C63D9',
  accentSoft: '#EFEEFA',
  accentText: '#FFFFFF',
  border: '#E8E8E5',
  borderStrong: '#D5D5D0',
  danger: '#C64343',
  dangerSoft: '#FBECEC',
  success: '#2E7D5B',
  successSoft: '#EAF4EF',
  warning: '#B26A1E',
  warningSoft: '#FBF3E8',
  overlay: 'rgba(21, 21, 24, 0.45)',
};

export const DARK_COLORS: ColorTokens = {
  background: '#151518',
  surface: '#202024',
  surfaceSubtle: '#28282E',
  textPrimary: '#F4F4F5',
  textSecondary: '#A0A0A8',
  textTertiary: '#71717A',
  accent: '#9991FF',
  accentSoft: '#2B2942',
  accentText: '#151518',
  border: '#34343A',
  borderStrong: '#46464F',
  danger: '#F07575',
  dangerSoft: '#3A2326',
  success: '#59B88E',
  successSoft: '#1E332B',
  warning: '#E5A95C',
  warningSoft: '#352B1E',
  overlay: 'rgba(0, 0, 0, 0.65)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 999,
} as const;

export const FONT_FAMILIES = {
  serifRegular: 'Newsreader_400Regular',
  serifMedium: 'Newsreader_500Medium',
  serifSemiBold: 'Newsreader_600SemiBold',
  sansRegular: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
} as const;

export const FONT_SCALE_MULTIPLIER: Record<FontSizePreference, number> = {
  small: 0.92,
  medium: 1.0,
  large: 1.12,
};

export interface RecallTheme {
  isDark: boolean;
  colors: ColorTokens;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  fonts: typeof FONT_FAMILIES;
  fontScale: number;
}
