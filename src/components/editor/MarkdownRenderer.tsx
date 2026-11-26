import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../ui/AppText';

interface MarkdownRendererProps {
  content: string;
  onToggleChecklistLine?: (lineIndex: number) => void;
}

function renderInlineSpans(
  line: string,
  baseColor: string,
  accentColor: string,
  codeBg: string,
  monoFont: string
): React.ReactNode[] {
  // Tokenize bold (**x**), italic (*x*), underline (<u>x</u>), inline code (`x`), links ([label](url))
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>[^<]+<\/u>|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = line.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={idx} style={{ fontWeight: '700', color: baseColor }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <Text key={idx} style={{ fontStyle: 'italic', color: baseColor }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('<u>') && part.endsWith('</u>')) {
      return (
        <Text key={idx} style={{ textDecorationLine: 'underline', color: baseColor }}>
          {part.slice(3, -4)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text
          key={idx}
          style={{
            fontFamily: monoFont,
            backgroundColor: codeBg,
            color: baseColor,
            fontSize: 13,
          }}
        >
          {` ${part.slice(1, -1)} `}
        </Text>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      return (
        <Text
          key={idx}
          style={{ color: accentColor, textDecorationLine: 'underline' }}
          onPress={() => {
            Linking.openURL(url).catch(() => {});
          }}
        >
          {label}
        </Text>
      );
    }
    return <Text key={idx}>{part}</Text>;
  });
}

export function MarkdownRenderer({
  content,
  onToggleChecklistLine,
}: MarkdownRendererProps) {
  const { colors, fonts, radius } = useTheme();
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeLines: string[] = [];

  lines.forEach((rawLine, index) => {
    if (rawLine.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <View
            key={`code-${index}`}
            style={[
              styles.codeBlock,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.border,
                borderRadius: radius.sm,
              },
            ]}
          >
            <AppText variant="mono">{codeLines.join('\n')}</AppText>
          </View>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      return;
    }

    if (rawLine.trim() === '') {
      blocks.push(<View key={`sp-${index}`} style={{ height: 8 }} />);
      return;
    }

    // Headings
    if (rawLine.startsWith('### ')) {
      blocks.push(
        <AppText key={index} variant="h3" style={{ marginTop: 10, marginBottom: 4 }}>
          {rawLine.slice(4)}
        </AppText>
      );
      return;
    }
    if (rawLine.startsWith('## ')) {
      blocks.push(
        <AppText key={index} variant="h2" style={{ marginTop: 12, marginBottom: 4 }}>
          {rawLine.slice(3)}
        </AppText>
      );
      return;
    }
    if (rawLine.startsWith('# ')) {
      blocks.push(
        <AppText key={index} variant="h1" style={{ marginTop: 14, marginBottom: 6 }}>
          {rawLine.slice(2)}
        </AppText>
      );
      return;
    }

    // Checklist
    const checkMatch = rawLine.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === 'x';
      const text = checkMatch[2];
      blocks.push(
        <Pressable
          key={index}
          onPress={onToggleChecklistLine ? () => onToggleChecklistLine(index) : undefined}
          style={styles.listRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: checked ? colors.accent : colors.borderStrong,
                backgroundColor: checked ? colors.accent : 'transparent',
              },
            ]}
          >
            {checked ? (
              <AppText variant="caption" color="inverse" style={{ fontSize: 10, lineHeight: 12 }}>
                ✓
              </AppText>
            ) : null}
          </View>
          <AppText
            variant="body"
            color={checked ? 'secondary' : 'primary'}
            style={[
              { flex: 1 },
              checked ? { textDecorationLine: 'line-through' } : undefined,
            ]}
          >
            {renderInlineSpans(
              text,
              checked ? colors.textSecondary : colors.textPrimary,
              colors.accent,
              colors.surfaceSubtle,
              fonts.monoRegular
            )}
          </AppText>
        </Pressable>
      );
      return;
    }

    // Bullet list
    const bulletMatch = rawLine.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push(
        <View key={index} style={styles.listRow}>
          <AppText variant="body" color="secondary" style={{ width: 16 }}>
            •
          </AppText>
          <AppText variant="body" style={{ flex: 1 }}>
            {renderInlineSpans(
              bulletMatch[1],
              colors.textPrimary,
              colors.accent,
              colors.surfaceSubtle,
              fonts.monoRegular
            )}
          </AppText>
        </View>
      );
      return;
    }

    // Numbered list
    const numMatch = rawLine.match(/^\s*(\d+\.)\s+(.*)$/);
    if (numMatch) {
      blocks.push(
        <View key={index} style={styles.listRow}>
          <AppText variant="body" color="secondary" tabular style={{ minWidth: 22 }}>
            {numMatch[1]}
          </AppText>
          <AppText variant="body" style={{ flex: 1 }}>
            {renderInlineSpans(
              numMatch[2],
              colors.textPrimary,
              colors.accent,
              colors.surfaceSubtle,
              fonts.monoRegular
            )}
          </AppText>
        </View>
      );
      return;
    }

    // Blockquote
    if (rawLine.startsWith('> ')) {
      blocks.push(
        <View
          key={index}
          style={[
            styles.quote,
            { borderLeftColor: colors.accent, backgroundColor: colors.surfaceSubtle },
          ]}
        >
          <AppText variant="body" color="secondary" style={{ fontStyle: 'italic' }}>
            {renderInlineSpans(
              rawLine.slice(2),
              colors.textSecondary,
              colors.accent,
              colors.surface,
              fonts.monoRegular
            )}
          </AppText>
        </View>
      );
      return;
    }

    // Horizontal rule
    if (rawLine.trim() === '---') {
      blocks.push(
        <View
          key={index}
          style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }}
        />
      );
      return;
    }

    // Regular paragraph
    blocks.push(
      <AppText key={index} variant="body" style={{ marginBottom: 4 }}>
        {renderInlineSpans(
          rawLine,
          colors.textPrimary,
          colors.accent,
          colors.surfaceSubtle,
          fonts.monoRegular
        )}
      </AppText>
    );
  });

  if (inCodeBlock && codeLines.length > 0) {
    blocks.push(
      <View
        key="code-unclosed"
        style={[
          styles.codeBlock,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.border,
            borderRadius: radius.sm,
          },
        ]}
      >
        <AppText variant="mono">{codeLines.join('\n')}</AppText>
      </View>
    );
  }

  return <View style={{ gap: 2 }}>{blocks}</View>;
}

const styles = StyleSheet.create({
  codeBlock: {
    borderWidth: 1,
    padding: 12,
    marginVertical: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginVertical: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    paddingRight: 10,
    marginVertical: 4,
  },
});
