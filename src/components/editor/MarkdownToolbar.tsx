import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
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
  { key: 'h1', label: 'H1', prefix: '# ', lineStart: true },
  { key: 'h2', label: 'H2', prefix: '## ', lineStart: true },
  { key: 'bold', label: 'B', prefix: '**', suffix: '**' },
  { key: 'italic', label: 'I', prefix: '*', suffix: '*' },
  { key: 'underline', label: 'U', prefix: '<u>', suffix: '</u>' },
  { key: 'bullet', label: '• List', prefix: '- ', lineStart: true },
  { key: 'number', label: '1. List', prefix: '1. ', lineStart: true },
  { key: 'check', label: '☑ Task', prefix: '- [ ] ', lineStart: true },
  { key: 'quote', label: 'Quote', prefix: '> ', lineStart: true },
  { key: 'code', label: 'Code', prefix: '```\n', suffix: '\n```' },
  { key: 'link', label: 'Link', prefix: '[', suffix: '](https://)' },
];

interface MarkdownToolbarProps {
  onApply: (action: FormatAction) => void;
}

export function MarkdownToolbar({ onApply }: MarkdownToolbarProps) {
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
});
