import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'mono'
  | 'stat';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse';
  tabular?: boolean;
}

export function AppText({
  variant = 'body',
  color = 'primary',
  tabular = false,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors, fonts, fontScale } = useTheme();

  const colorMap: Record<NonNullable<AppTextProps['color']>, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    inverse: colors.accentText,
  };

  const baseStyles: Record<TextVariant, TextStyle> = {
    display: {
      fontFamily: fonts.serifMedium,
      fontSize: Math.round(28 * fontScale),
      lineHeight: Math.round(34 * fontScale),
      letterSpacing: -0.4,
    },
    h1: {
      fontFamily: fonts.serifMedium,
      fontSize: Math.round(24 * fontScale),
      lineHeight: Math.round(30 * fontScale),
      letterSpacing: -0.3,
    },
    h2: {
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(17 * fontScale),
      lineHeight: Math.round(23 * fontScale),
      letterSpacing: -0.2,
    },
    h3: {
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(15 * fontScale),
      lineHeight: Math.round(20 * fontScale),
    },
    body: {
      fontFamily: fonts.sansRegular,
      fontSize: Math.round(15 * fontScale),
      lineHeight: Math.round(22 * fontScale),
    },
    bodySmall: {
      fontFamily: fonts.sansRegular,
      fontSize: Math.round(13.5 * fontScale),
      lineHeight: Math.round(19 * fontScale),
    },
    label: {
      fontFamily: fonts.sansMedium,
      fontSize: Math.round(13 * fontScale),
      lineHeight: Math.round(18 * fontScale),
    },
    caption: {
      fontFamily: fonts.sansRegular,
      fontSize: Math.round(12 * fontScale),
      lineHeight: Math.round(16 * fontScale),
    },
    mono: {
      fontFamily: fonts.monoRegular,
      fontSize: Math.round(13 * fontScale),
      lineHeight: Math.round(19 * fontScale),
    },
    stat: {
      fontFamily: fonts.sansSemiBold,
      fontSize: Math.round(24 * fontScale),
      lineHeight: Math.round(28 * fontScale),
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
  };

  return (
    <Text
      style={[
        baseStyles[variant],
        { color: colorMap[color] },
        tabular ? { fontVariant: ['tabular-nums'] } : undefined,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
