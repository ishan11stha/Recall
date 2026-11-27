import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Camera, Image as ImageIcon, Paperclip } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../ui/AppText';

export interface FormatAction {
  key: string;
  label: string;
  prefix: string;
  suffix?: string;
  lineStart?: boolean;
}

const FORMAT_ACTIONS: FormatAction[] = [
  { key: 'wikilink', label: '[[]]', prefix: '[[', suffix: ']]' },
  { key: 'tag', label: '#tag', prefix: '#' },
  { key: 'h1', label: 'H1', prefix: '# ', lineStart: true },
  { key: 'h2', label: 'H2', prefix: '## ', lineStart: true },
  { key: 'bold', label: 'B', prefix: '**', suffix: '**' },
  { key: 'italic', label: 'I', prefix: '*', suffix: '*' },
  { key: 'highlight', label: '==', prefix: '==', suffix: '==' },
  { key: 'check', label: '☑', prefix: '- [ ] ', lineStart: true },
  { key: 'bullet', label: '•', prefix: '- ', lineStart: true },
  { key: 'callout', label: 'Callout', prefix: '> [!note] ', lineStart: true },
  { key: 'quote', label: 'Quote', prefix: '> ', lineStart: true },
  { key: 'code', label: 'Code', prefix: '```\n', suffix: '\n```' },
  { key: 'hr', label: '---', prefix: '\n---\n' },
];

interface MarkdownToolbarProps {
  onApply: (action: FormatAction) => void;
  onCapturePhoto?: () => void;
  onAttachImage?: () => void;
  onAttachFile?: () => void;
}

export function MarkdownToolbar({
  onApply,
  onCapturePhoto,
  onAttachImage,
  onAttachFile,
}: MarkdownToolbarProps) {
  const { colors, radius } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={[
        styles.bar,
        { backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {onCapturePhoto ? (
        <Pressable
          accessibilityLabel="Take photo"
          onPress={onCapturePhoto}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
              borderColor: colors.border,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Camera size={15} color={colors.accent} strokeWidth={1.75} />
        </Pressable>
      ) : null}
      {onAttachImage ? (
        <Pressable
          accessibilityLabel="Insert image"
          onPress={onAttachImage}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
              borderColor: colors.border,
              borderRadius: radius.sm,
            },
          ]}
        >
          <ImageIcon size={15} color={colors.accent} strokeWidth={1.75} />
        </Pressable>
      ) : null}

      {onAttachFile ? (
        <Pressable
          accessibilityLabel="Attach file or PDF"
          onPress={onAttachFile}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
              borderColor: colors.border,
              borderRadius: radius.sm,
            },
          ]}
        >
          <Paperclip size={15} color={colors.accent} strokeWidth={1.75} />
        </Pressable>
      ) : null}

      {FORMAT_ACTIONS.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => onApply(action)}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
              borderColor: colors.border,
              borderRadius: radius.sm,
            },
          ]}
        >
          <AppText variant="caption" style={{ fontWeight: '600' }}>
            {action.label}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
