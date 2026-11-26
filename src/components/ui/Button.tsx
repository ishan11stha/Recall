import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const isDisabled = disabled || loading;

  const bgColor =
    variant === 'primary'
      ? colors.accent
      : variant === 'secondary'
      ? colors.surface
      : variant === 'danger'
      ? colors.dangerSoft
      : 'transparent';

  const borderColor =
    variant === 'secondary'
      ? colors.border
      : variant === 'danger'
      ? colors.danger
      : 'transparent';

  const textColor =
    variant === 'primary'
      ? 'inverse'
      : variant === 'danger'
      ? 'danger'
      : variant === 'ghost'
      ? 'accent'
      : 'primary';

  const heights: Record<ButtonSize, number> = {
    sm: 36,
    md: 44,
    lg: 50,
  };

  const padH: Record<ButtonSize, number> = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: heights[size],
          paddingHorizontal: padH[size],
          borderRadius: radius.md,
          backgroundColor: bgColor,
          borderColor,
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.82 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.accentText : colors.accent}
        />
      ) : (
        <>
          {icon}
          <AppText
            variant={size === 'sm' ? 'label' : 'bodySmall'}
            color={textColor}
            style={{ fontWeight: '600' }}
          >
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
