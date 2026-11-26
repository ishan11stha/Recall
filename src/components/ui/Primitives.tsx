import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';

interface CardProps extends ViewProps {
  padded?: boolean;
  subtle?: boolean;
  onPress?: () => void;
}

export function Card({
  padded = true,
  subtle = false,
  onPress,
  style,
  children,
  ...rest
}: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const baseStyle: ViewStyle = {
    backgroundColor: subtle ? colors.surfaceSubtle : colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: padded ? spacing.lg : 0,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [baseStyle, { opacity: pressed ? 0.86 : 1 }, style]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[baseStyle, style]} {...rest}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}

export function Chip({ label, selected = false, onPress, icon }: ChipProps) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon}
      <AppText
        variant="caption"
        color={selected ? 'accent' : 'secondary'}
        style={{ fontWeight: selected ? '600' : '500' }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

interface InputProps extends TextInputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  style,
  ...rest
}: InputProps) {
  const { colors, radius, fonts, fontScale } = useTheme();
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <AppText variant="label" color="secondary">
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: errorText ? colors.danger : colors.border,
            borderRadius: radius.md,
            color: colors.textPrimary,
            fontFamily: fonts.sansRegular,
            fontSize: Math.round(15 * fontScale),
          },
          style,
        ]}
        {...rest}
      />
      {errorText ? (
        <AppText variant="caption" color="danger">
          {errorText}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" color="tertiary">
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.emptyBox,
        {
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {icon ? <View style={{ marginBottom: 4 }}>{icon}</View> : null}
      <AppText variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="bodySmall" color="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.emptyAction,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.md,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppText variant="label" color="inverse" style={{ fontWeight: '600' }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SkeletonBlock({ height = 64, style }: { height?: number; style?: ViewStyle }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        {
          height,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSubtle,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    />
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, leftAction, rightAction }: ScreenHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.headerRow, { paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>
      <View style={styles.headerLeft}>
        {leftAction}
        <View style={{ flex: 1 }}>
          <AppText variant="h1" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {rightAction ? <View style={styles.headerRight}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  emptyBox: {
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyAction: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
