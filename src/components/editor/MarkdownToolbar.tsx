import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Bold,
  Camera,
  CheckSquare,
  Heading,
  Highlighter,
  Image as ImageIcon,
  Italic,
  List,
  Palette,
  Paperclip,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';

export type TextColorKey = 'default' | 'accent' | 'green' | 'amber' | 'red' | 'muted';

export interface FormatAction {
  key:
    | 'check'
    | 'heading'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'strike'
    | 'highlight'
    | 'bullet'
    | 'quote';
}

const PRIMARY_ACTIONS: { key: FormatAction['key']; label: string; Icon: typeof CheckSquare }[] = [
  { key: 'check', label: 'Checkbox', Icon: CheckSquare },
  { key: 'heading', label: 'Heading', Icon: Heading },
  { key: 'bold', label: 'Bold', Icon: Bold },
  { key: 'italic', label: 'Italic', Icon: Italic },
  { key: 'underline', label: 'Underline', Icon: Underline },
  { key: 'bullet', label: 'Bullet list', Icon: List },
  { key: 'quote', label: 'Quote', Icon: Quote },
];

interface MarkdownToolbarProps {
  onApply: (action: FormatAction) => void;
  onApplyColor?: (color: TextColorKey) => void;
  onCapturePhoto?: () => void;
  onAttachImage?: () => void;
  onAttachFile?: () => void;
}

export function MarkdownToolbar({
  onApply,
  onApplyColor,
  onCapturePhoto,
  onAttachImage,
  onAttachFile,
}: MarkdownToolbarProps) {
  const { colors, radius } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const swatches: { key: TextColorKey; hex: string; label: string }[] = [
    { key: 'default', hex: colors.textPrimary, label: 'Default color' },
    { key: 'accent', hex: colors.accent, label: 'Indigo' },
    { key: 'green', hex: colors.success, label: 'Green' },
    { key: 'amber', hex: colors.warning, label: 'Amber' },
    { key: 'red', hex: colors.danger, label: 'Red' },
    { key: 'muted', hex: colors.textSecondary, label: 'Muted' },
  ];

  return (
    <View style={{ flexShrink: 0, flexGrow: 0 }}>
      {/* Compact Color & Extra-Style Popover Strip */}
      {paletteOpen ? (
        <View
          style={[
            styles.paletteRow,
            { backgroundColor: colors.surfaceSubtle, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.swatchGroup}>
            {swatches.map((sw) => (
              <Pressable
                key={sw.key}
                accessibilityLabel={sw.label}
                onPress={() => {
                  onApplyColor?.(sw.key);
                  setPaletteOpen(false);
                }}
                hitSlop={6}
                style={[
                  styles.swatch,
                  { backgroundColor: sw.hex, borderColor: colors.border },
                ]}
              />
            ))}
          </View>

          <View style={[styles.sep, { backgroundColor: colors.border }]} />

          <View style={styles.extraGroup}>
            <Pressable
              accessibilityLabel="Highlight"
              onPress={() => {
                onApply({ key: 'highlight' });
                setPaletteOpen(false);
              }}
              hitSlop={4}
              style={[styles.btn, { borderRadius: radius.sm }]}
            >
              <Highlighter size={16} color={colors.warning} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              accessibilityLabel="Strikethrough"
              onPress={() => {
                onApply({ key: 'strike' });
                setPaletteOpen(false);
              }}
              hitSlop={4}
              style={[styles.btn, { borderRadius: radius.sm }]}
            >
              <Strikethrough size={16} color={colors.textPrimary} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Main Single-Row Compact Toolbar */}
      <View
        style={[
          styles.wrapper,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        {PRIMARY_ACTIONS.map(({ Icon, label, key }) => (
          <Pressable
            key={key}
            accessibilityLabel={label}
            onPress={() => onApply({ key })}
            hitSlop={3}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: pressed ? colors.accentSoft : 'transparent',
                borderRadius: radius.sm,
              },
            ]}
          >
            <Icon size={16} color={colors.textPrimary} strokeWidth={1.8} />
          </Pressable>
        ))}

        {onApplyColor ? (
          <Pressable
            accessibilityLabel="Text color and highlight"
            onPress={() => setPaletteOpen((o) => !o)}
            hitSlop={3}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor:
                  paletteOpen || pressed ? colors.accentSoft : 'transparent',
                borderRadius: radius.sm,
              },
            ]}
          >
            <Palette
              size={16}
              color={paletteOpen ? colors.accent : colors.textPrimary}
              strokeWidth={1.8}
            />
          </Pressable>
        ) : null}

        <View style={[styles.sep, { backgroundColor: colors.border }]} />

        {onCapturePhoto ? (
          <Pressable
            accessibilityLabel="Take photo"
            onPress={onCapturePhoto}
            hitSlop={3}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: pressed ? colors.accentSoft : 'transparent', borderRadius: radius.sm },
            ]}
          >
            <Camera size={16} color={colors.accent} strokeWidth={1.8} />
          </Pressable>
        ) : null}

        {onAttachImage ? (
          <Pressable
            accessibilityLabel="Insert image"
            onPress={onAttachImage}
            hitSlop={3}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: pressed ? colors.accentSoft : 'transparent', borderRadius: radius.sm },
            ]}
          >
            <ImageIcon size={16} color={colors.accent} strokeWidth={1.8} />
          </Pressable>
        ) : null}

        {onAttachFile ? (
          <Pressable
            accessibilityLabel="Attach file"
            onPress={onAttachFile}
            hitSlop={3}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: pressed ? colors.accentSoft : 'transparent', borderRadius: radius.sm },
            ]}
          >
            <Paperclip size={16} color={colors.accent} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paletteRow: {
    height: 40,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  swatchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  extraGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wrapper: {
    height: 44,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
  },
  btn: {
    width: 30,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: {
    width: 1,
    height: 18,
  },
});
