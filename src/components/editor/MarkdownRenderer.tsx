import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Attachment } from '../../types/models';
import { formatBytes } from '../../utils/id';
import { AppText } from '../ui/AppText';

interface MarkdownRendererProps {
  content: string;
  attachments?: Attachment[];
  onToggleChecklistLine?: (lineIndex: number) => void;
  onPressWikilink?: (targetTitle: string) => void;
  onPressLink?: (url: string) => void;
}

function ResponsiveNoteImage({
  uri,
  onPress,
}: {
  uri: string;
  onPress?: () => void;
}) {
  const { colors, radius } = useTheme();
  const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);

  useEffect(() => {
    let active = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (active && w > 0 && h > 0) {
          setAspectRatio(Math.max(0.55, Math.min(2.2, w / h)));
        }
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [uri]);

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress?.();
      }}
      style={{ marginVertical: 10 }}
    >
      <Image
        source={{ uri }}
        style={{
          width: '100%',
          aspectRatio,
          maxHeight: 420,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceSubtle,
        }}
        resizeMode="contain"
      />
    </Pressable>
  );
}

interface InlineContext {
  baseColor: string;
  accentColor: string;
  accentSoft: string;
  warningSoft: string;
  codeBg: string;
  monoFont: string;
  onPressWikilink?: (targetTitle: string) => void;
  onPressLink?: (url: string) => void;
}

function renderInlineSpans(line: string, ctx: InlineContext): React.ReactNode[] {
  const regex =
    /(\[\[[^[\]]+\]\]|==[^=]+==|~~[^~]+~~|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|<u>[^<]+<\/u>|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?:^|\s)#[a-zA-Z][a-zA-Z0-9_-]*)/g;
  const parts = line.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // [[Wikilink]] or [[Target|Alias]]
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      const [rawTarget, rawAlias] = inner.split('|');
      const target = rawTarget.trim();
      const label = (rawAlias ?? rawTarget).trim();
      return (
        <Text
          key={idx}
          onPress={ctx.onPressWikilink ? () => ctx.onPressWikilink?.(target) : undefined}
          style={{
            color: ctx.accentColor,
            backgroundColor: ctx.accentSoft,
            fontWeight: '600',
          }}
        >
          {` ${label} `}
        </Text>
      );
    }

    // ==Highlight==
    if (part.startsWith('==') && part.endsWith('==')) {
      return (
        <Text
          key={idx}
          style={{
            backgroundColor: ctx.warningSoft,
            color: ctx.baseColor,
          }}
        >
          {part.slice(2, -2)}
        </Text>
      );
    }

    // ~~Strikethrough~~
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return (
        <Text
          key={idx}
          style={{
            textDecorationLine: 'line-through',
            color: ctx.baseColor,
            opacity: 0.65,
          }}
        >
          {part.slice(2, -2)}
        </Text>
      );
    }

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length > 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length > 4)
    ) {
      return (
        <Text key={idx} style={{ fontWeight: '700', color: ctx.baseColor }}>
          {part.slice(2, -2)}
        </Text>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      return (
        <Text key={idx} style={{ fontStyle: 'italic', color: ctx.baseColor }}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.startsWith('<u>') && part.endsWith('</u>')) {
      return (
        <Text key={idx} style={{ textDecorationLine: 'underline', color: ctx.baseColor }}>
          {part.slice(3, -4)}
        </Text>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text
          key={idx}
          style={{
            fontFamily: ctx.monoFont,
            backgroundColor: ctx.codeBg,
            color: ctx.baseColor,
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
          style={{ color: ctx.accentColor, textDecorationLine: 'underline' }}
          onPress={() => {
            if (ctx.onPressLink) {
              ctx.onPressLink(url);
            } else {
              Linking.openURL(url).catch(() => {});
            }
          }}
        >
          {label}
        </Text>
      );
    }

    // Inline #tag
    if (/^\s?#[a-zA-Z][a-zA-Z0-9_-]*$/.test(part)) {
      const leadingSpace = part.startsWith(' ') ? ' ' : '';
      const tagText = part.trim();
      return (
        <Text key={idx}>
          {leadingSpace}
          <Text style={{ color: ctx.accentColor, fontWeight: '500' }}>{tagText}</Text>
        </Text>
      );
    }

    return <Text key={idx}>{part}</Text>;
  });
}

export function MarkdownRenderer({
  content,
  attachments = [],
  onToggleChecklistLine,
  onPressWikilink,
  onPressLink,
}: MarkdownRendererProps) {
  const { colors, fonts, radius } = useTheme();
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];

  const inlineCtx: InlineContext = {
    baseColor: colors.textPrimary,
    accentColor: colors.accent,
    accentSoft: colors.accentSoft,
    warningSoft: colors.warningSoft,
    codeBg: colors.surfaceSubtle,
    monoFont: fonts.monoRegular,
    onPressWikilink,
    onPressLink,
  };

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

    // Clean wiki-embed: ![[filename]] (resolves from note attachments with no file:// URL shown)
    const embedMatch = rawLine.trim().match(/^!\[\[([^[\]]+)\]\]$/);
    if (embedMatch) {
      const targetName = embedMatch[1].trim();
      const att = attachments.find(
        (a) => a.title.toLowerCase() === targetName.toLowerCase()
      );
      if (att?.localUri) {
        const isImg =
          att.fileType === 'image' || (att.mimeType ?? '').startsWith('image/');
        if (isImg) {
          blocks.push(
            <ResponsiveNoteImage
              key={index}
              uri={att.localUri}
              onPress={() => onPressLink?.(att.localUri!)}
            />
          );
          return;
        }
        blocks.push(
          <Pressable
            key={index}
            onPress={(e) => {
              e.stopPropagation();
              onPressLink?.(att.localUri!);
            }}
            style={[
              styles.fileEmbed,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.sm,
              },
            ]}
          >
            <FileText size={16} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodySmall" numberOfLines={1}>
                {att.title}
              </AppText>
              <AppText variant="caption" color="tertiary" tabular>
                {formatBytes(att.fileSizeBytes)}
              </AppText>
            </View>
          </Pressable>
        );
        return;
      }
    }

    // Legacy inline image: ![alt](uri)
    const imgMatch = rawLine.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const [, , uri] = imgMatch;
      blocks.push(
        <ResponsiveNoteImage
          key={index}
          uri={uri}
          onPress={() => onPressLink?.(uri)}
        />
      );
      return;
    }

    // Headings
    if (rawLine.startsWith('### ')) {
      blocks.push(
        <AppText key={index} variant="h3" style={{ marginTop: 12, marginBottom: 4 }}>
          {rawLine.slice(4)}
        </AppText>
      );
      return;
    }
    if (rawLine.startsWith('## ')) {
      blocks.push(
        <AppText key={index} variant="h2" style={{ marginTop: 14, marginBottom: 4 }}>
          {rawLine.slice(3)}
        </AppText>
      );
      return;
    }
    if (rawLine.startsWith('# ')) {
      blocks.push(
        <AppText key={index} variant="h1" style={{ marginTop: 16, marginBottom: 6 }}>
          {rawLine.slice(2)}
        </AppText>
      );
      return;
    }

    // Checklist (supports empty "- [ ]" as well as "- [ ] task")
    const checkMatch = rawLine.match(/^\s*-\s+\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === 'x';
      const text = checkMatch[2];
      blocks.push(
        <Pressable
          key={index}
          onPress={
            onToggleChecklistLine
              ? (e) => {
                  e.stopPropagation();
                  onToggleChecklistLine(index);
                }
              : undefined
          }
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
            {renderInlineSpans(text, {
              ...inlineCtx,
              baseColor: checked ? colors.textSecondary : colors.textPrimary,
            })}
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
            {renderInlineSpans(bulletMatch[1], inlineCtx)}
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
            {renderInlineSpans(numMatch[2], inlineCtx)}
          </AppText>
        </View>
      );
      return;
    }

    // Callout: > [!note] Title / text
    const calloutMatch = rawLine.match(/^>\s*\[!(note|tip|warning|important|info)\]\s*(.*)$/i);
    if (calloutMatch) {
      const kind = calloutMatch[1].toLowerCase();
      const body = calloutMatch[2] || kind.toUpperCase();
      const accent =
        kind === 'warning'
          ? colors.warning
          : kind === 'tip'
          ? colors.success
          : colors.accent;
      const bg =
        kind === 'warning'
          ? colors.warningSoft
          : kind === 'tip'
          ? colors.successSoft
          : colors.accentSoft;

      blocks.push(
        <View
          key={index}
          style={[
            styles.callout,
            { borderLeftColor: accent, backgroundColor: bg, borderRadius: radius.sm },
          ]}
        >
          <AppText variant="caption" style={{ color: accent, fontWeight: '700' }}>
            {kind.toUpperCase()}
          </AppText>
          <AppText variant="bodySmall">{renderInlineSpans(body, inlineCtx)}</AppText>
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
            {renderInlineSpans(rawLine.slice(2), {
              ...inlineCtx,
              baseColor: colors.textSecondary,
            })}
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
          style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }}
        />
      );
      return;
    }

    // Regular paragraph
    blocks.push(
      <AppText key={index} variant="body" style={{ marginBottom: 4 }}>
        {renderInlineSpans(rawLine, inlineCtx)}
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
  fileEmbed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    marginVertical: 8,
  },
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
  callout: {
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 6,
    gap: 3,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    paddingRight: 10,
    marginVertical: 4,
  },
});
