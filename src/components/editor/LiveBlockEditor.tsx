import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { FileText, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Attachment } from '../../types/models';
import { formatBytes } from '../../utils/id';
import { AppText } from '../ui/AppText';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { FormatAction, TextColorKey } from './MarkdownToolbar';

export type LiveFormatCommand = FormatAction['key'];

interface LiveBlockEditorProps {
  content: string;
  attachments: Attachment[];
  activeLineIndex: number;
  onActiveLineChange: (index: number) => void;
  onChangeContent: (next: string) => void;
  onOpenWikilink: (title: string) => void;
  onOpenLink: (url: string) => void;
  onRemoveAttachmentByTitle?: (title: string) => void;
}

type BlockKind = 'image' | 'file' | 'check' | 'heading' | 'bullet' | 'quote' | 'paragraph';

interface ParsedLine {
  kind: BlockKind;
  text: string;
  checked?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrike?: boolean;
  isHighlight?: boolean;
  colorKey?: TextColorKey;
  uri?: string;
  attachment?: Attachment;
  headingLevel?: 1 | 2 | 3;
}

function unwrapInlineWrappers(raw: string): {
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrike?: boolean;
  isHighlight?: boolean;
  colorKey?: TextColorKey;
} {
  let cur = raw;
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrike = false;
  let isHighlight = false;
  let colorKey: TextColorKey | undefined;

  // Unwrap nested style tags in deterministic order (outermost -> innermost)
  let changed = true;
  while (changed) {
    changed = false;
    const colorMatch = cur.match(/^<c:(accent|green|amber|red|muted)>([\s\S]*)<\/c>$/);
    if (colorMatch) {
      colorKey = colorMatch[1] as TextColorKey;
      cur = colorMatch[2];
      changed = true;
      continue;
    }
    if (cur.startsWith('==') && cur.endsWith('==') && cur.length > 4) {
      isHighlight = true;
      cur = cur.slice(2, -2);
      changed = true;
      continue;
    }
    if (cur.startsWith('~~') && cur.endsWith('~~') && cur.length > 4) {
      isStrike = true;
      cur = cur.slice(2, -2);
      changed = true;
      continue;
    }
    if (cur.startsWith('<u>') && cur.endsWith('</u>') && cur.length > 7) {
      isUnderline = true;
      cur = cur.slice(3, -4);
      changed = true;
      continue;
    }
    if (cur.startsWith('***') && cur.endsWith('***') && cur.length > 6) {
      isBold = true;
      isItalic = true;
      cur = cur.slice(3, -3);
      changed = true;
      continue;
    }
    if (cur.startsWith('**') && cur.endsWith('**') && cur.length > 4 && !cur.slice(2, -2).includes('**')) {
      isBold = true;
      cur = cur.slice(2, -2);
      changed = true;
      continue;
    }
    if (cur.startsWith('*') && cur.endsWith('*') && cur.length > 2 && !cur.slice(1, -1).includes('*')) {
      isItalic = true;
      cur = cur.slice(1, -1);
      changed = true;
    }
  }

  return { text: cur, isBold, isItalic, isUnderline, isStrike, isHighlight, colorKey };
}

function wrapInlineStyles(parsed: ParsedLine): string {
  let out = parsed.text;
  if (!out) return '';
  if (parsed.isBold && parsed.isItalic) out = `***${out}***`;
  else if (parsed.isBold) out = `**${out}**`;
  else if (parsed.isItalic) out = `*${out}*`;
  if (parsed.isUnderline) out = `<u>${out}</u>`;
  if (parsed.isStrike) out = `~~${out}~~`;
  if (parsed.isHighlight) out = `==${out}==`;
  if (parsed.colorKey && parsed.colorKey !== 'default') {
    out = `<c:${parsed.colorKey}>${out}</c>`;
  }
  return out;
}

function parseLine(raw: string, attachments: Attachment[]): ParsedLine {
  const trimmed = raw.trim();

  const embedMatch = trimmed.match(/^!\[\[([^[\]]+)\]\]$/);
  if (embedMatch) {
    const target = embedMatch[1].trim();
    const att = attachments.find((a) => a.title.toLowerCase() === target.toLowerCase());
    if (att?.localUri) {
      const isImg = att.fileType === 'image' || (att.mimeType ?? '').startsWith('image/');
      return {
        kind: isImg ? 'image' : 'file',
        text: att.title,
        uri: att.localUri,
        attachment: att,
      };
    }
  }

  const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (imgMatch) {
    return { kind: 'image', text: imgMatch[1], uri: imgMatch[2] };
  }

  const checkMatch = raw.match(/^\s*-\s+\[([ xX])\]\s*(.*)$/);
  if (checkMatch) {
    return {
      kind: 'check',
      checked: checkMatch[1].toLowerCase() === 'x',
      ...unwrapInlineWrappers(checkMatch[2]),
    };
  }

  const hMatch = raw.match(/^(#{1,3})\s+(.*)$/);
  if (hMatch) {
    return {
      kind: 'heading',
      headingLevel: hMatch[1].length as 1 | 2 | 3,
      ...unwrapInlineWrappers(hMatch[2]),
    };
  }

  const quoteMatch = raw.match(/^>\s+(.*)$/);
  if (quoteMatch) {
    return {
      kind: 'quote',
      ...unwrapInlineWrappers(quoteMatch[1]),
    };
  }

  const bulletMatch = raw.match(/^\s*[-*]\s+(.*)$/);
  if (bulletMatch) {
    return {
      kind: 'bullet',
      ...unwrapInlineWrappers(bulletMatch[1]),
    };
  }

  return { kind: 'paragraph', ...unwrapInlineWrappers(raw) };
}

function serializeLine(parsed: ParsedLine): string {
  const styled = wrapInlineStyles(parsed);
  if (parsed.kind === 'check') return `- [${parsed.checked ? 'x' : ' '}] ${styled}`;
  if (parsed.kind === 'heading') return `${'#'.repeat(parsed.headingLevel ?? 2)} ${styled}`;
  if (parsed.kind === 'quote') return `> ${styled}`;
  if (parsed.kind === 'bullet') return `- ${styled}`;
  return styled;
}

export function applyLiveFormatToLine(
  content: string,
  lineIndex: number,
  command: LiveFormatCommand,
  attachments: Attachment[]
): string {
  const lines = content.split('\n');
  const safeIdx = Math.max(0, Math.min(lineIndex, lines.length - 1));
  const parsed = parseLine(lines[safeIdx] ?? '', attachments);

  if (parsed.kind === 'image' || parsed.kind === 'file') {
    const prefix =
      command === 'check'
        ? '- [ ] '
        : command === 'heading'
        ? '## '
        : command === 'bullet'
        ? '- '
        : command === 'quote'
        ? '> '
        : '';
    lines.splice(safeIdx + 1, 0, prefix);
    return lines.join('\n');
  }

  if (command === 'check') {
    lines[safeIdx] = serializeLine({
      ...parsed,
      kind: parsed.kind === 'check' ? 'paragraph' : 'check',
      checked: false,
    });
  } else if (command === 'heading') {
    lines[safeIdx] = serializeLine({
      ...parsed,
      kind: parsed.kind === 'heading' ? 'paragraph' : 'heading',
      headingLevel: 2,
    });
  } else if (command === 'bullet') {
    lines[safeIdx] = serializeLine({
      ...parsed,
      kind: parsed.kind === 'bullet' ? 'paragraph' : 'bullet',
    });
  } else if (command === 'quote') {
    lines[safeIdx] = serializeLine({
      ...parsed,
      kind: parsed.kind === 'quote' ? 'paragraph' : 'quote',
    });
  } else if (command === 'bold') {
    lines[safeIdx] = serializeLine({ ...parsed, text: parsed.text || 'Bold', isBold: !parsed.isBold });
  } else if (command === 'italic') {
    lines[safeIdx] = serializeLine({ ...parsed, text: parsed.text || 'Italic', isItalic: !parsed.isItalic });
  } else if (command === 'underline') {
    lines[safeIdx] = serializeLine({ ...parsed, text: parsed.text || 'Underlined', isUnderline: !parsed.isUnderline });
  } else if (command === 'strike') {
    lines[safeIdx] = serializeLine({ ...parsed, text: parsed.text || 'Strikethrough', isStrike: !parsed.isStrike });
  } else if (command === 'highlight') {
    lines[safeIdx] = serializeLine({ ...parsed, text: parsed.text || 'Highlight', isHighlight: !parsed.isHighlight });
  }

  return lines.join('\n');
}

export function applyColorToLine(
  content: string,
  lineIndex: number,
  colorKey: TextColorKey,
  attachments: Attachment[]
): string {
  const lines = content.split('\n');
  const safeIdx = Math.max(0, Math.min(lineIndex, lines.length - 1));
  const parsed = parseLine(lines[safeIdx] ?? '', attachments);
  if (parsed.kind === 'image' || parsed.kind === 'file') return content;

  lines[safeIdx] = serializeLine({
    ...parsed,
    colorKey: colorKey === 'default' ? undefined : colorKey,
  });
  return lines.join('\n');
}

function InlineResponsiveImage({
  uri,
  onOpen,
  onRemove,
}: {
  uri: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { colors, radius } = useTheme();
  const [aspectRatio, setAspectRatio] = useState(4 / 3);

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
    <View style={{ marginVertical: 10, position: 'relative' }}>
      <Pressable onPress={onOpen}>
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
      <Pressable
        accessibilityLabel="Remove image"
        onPress={onRemove}
        style={[styles.removeBadge, { backgroundColor: colors.overlay }]}
        hitSlop={8}
      >
        <X size={13} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export function LiveBlockEditor({
  content,
  attachments,
  activeLineIndex,
  onActiveLineChange,
  onChangeContent,
  onOpenWikilink,
  onOpenLink,
  onRemoveAttachmentByTitle,
}: LiveBlockEditorProps) {
  const { colors, fonts, fontScale, radius } = useTheme();
  const inputRefs = useRef<Map<number, React.ComponentRef<typeof TextInput>>>(new Map());
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

  const lines = content.split('\n');

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    const ref = inputRefs.current.get(pendingFocusIndex);
    if (ref) {
      ref.focus();
      setPendingFocusIndex(null);
    }
  }, [pendingFocusIndex, lines.length]);

  const resolveTextColor = (parsed: ParsedLine, fallback: string): string => {
    switch (parsed.colorKey) {
      case 'accent':
        return colors.accent;
      case 'green':
        return colors.success;
      case 'amber':
        return colors.warning;
      case 'red':
        return colors.danger;
      case 'muted':
        return colors.textSecondary;
      default:
        return fallback;
    }
  };

  const buildInlineStyle = (parsed: ParsedLine, fallbackColor: string): TextStyle => {
    const deco =
      parsed.isUnderline && (parsed.isStrike || parsed.checked)
        ? 'underline line-through'
        : parsed.isUnderline
        ? 'underline'
        : parsed.isStrike || parsed.checked
        ? 'line-through'
        : 'none';

    return {
      fontFamily: parsed.isBold ? fonts.sansBold : fonts.sansRegular,
      fontWeight: parsed.isBold ? '700' : '400',
      fontStyle: parsed.isItalic || parsed.kind === 'quote' ? 'italic' : 'normal',
      textDecorationLine: deco,
      color: resolveTextColor(parsed, fallbackColor),
      backgroundColor: parsed.isHighlight ? colors.warningSoft : 'transparent',
    };
  };

  const updateLine = (idx: number, nextRaw: string) => {
    const copy = [...lines];
    copy[idx] = nextRaw;
    onChangeContent(copy.join('\n'));
  };

  const removeLine = (idx: number, attTitle?: string) => {
    const copy = lines.filter((_, i) => i !== idx);
    onChangeContent(copy.join('\n'));
    if (attTitle) onRemoveAttachmentByTitle?.(attTitle);
  };

  const handleTextChange = (idx: number, parsed: ParsedLine, newText: string) => {
    if (newText.includes('\n')) {
      const [before, ...rest] = newText.split('\n');
      const after = rest.join('\n');
      const copy = [...lines];

      if (
        (parsed.kind === 'check' || parsed.kind === 'bullet' || parsed.kind === 'quote') &&
        before.trim() === '' &&
        after === ''
      ) {
        copy[idx] = '';
        onChangeContent(copy.join('\n'));
        return;
      }

      copy[idx] = serializeLine({ ...parsed, text: before });
      const nextLine =
        parsed.kind === 'check'
          ? `- [ ] ${after}`
          : parsed.kind === 'bullet'
          ? `- ${after}`
          : after;
      copy.splice(idx + 1, 0, nextLine);
      onChangeContent(copy.join('\n'));
      onActiveLineChange(idx + 1);
      setPendingFocusIndex(idx + 1);
      return;
    }

    updateLine(idx, serializeLine({ ...parsed, text: newText }));
  };

  const handleKeyPress = (idx: number, parsed: ParsedLine, key: string) => {
    if (key !== 'Backspace' || parsed.text.length > 0) return;

    if (
      parsed.kind === 'check' ||
      parsed.kind === 'heading' ||
      parsed.kind === 'bullet' ||
      parsed.kind === 'quote'
    ) {
      updateLine(idx, '');
      return;
    }

    if (idx > 0) {
      const copy = lines.filter((_, i) => i !== idx);
      onChangeContent(copy.join('\n'));
      onActiveLineChange(idx - 1);
      setPendingFocusIndex(idx - 1);
    }
  };

  const baseFontSize = Math.round(16 * fontScale);
  const baseLineHeight = Math.round(24 * fontScale);

  return (
    <View style={styles.container}>
      {lines.map((rawLine, idx) => {
        const parsed = parseLine(rawLine, attachments);
        const isFocused = idx === activeLineIndex;

        if (parsed.kind === 'image' && parsed.uri) {
          return (
            <InlineResponsiveImage
              key={`img-${idx}`}
              uri={parsed.uri}
              onOpen={() => onOpenLink(parsed.uri!)}
              onRemove={() => removeLine(idx, parsed.attachment?.title)}
            />
          );
        }

        if (parsed.kind === 'file' && parsed.uri && parsed.attachment) {
          const att = parsed.attachment;
          return (
            <View
              key={`file-${idx}`}
              style={[
                styles.fileCard,
                { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm },
              ]}
            >
              <Pressable onPress={() => onOpenLink(parsed.uri!)} style={styles.fileMain}>
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
              <Pressable onPress={() => removeLine(idx, att.title)} hitSlop={8}>
                <X size={15} color={colors.textTertiary} />
              </Pressable>
            </View>
          );
        }

        if (parsed.kind === 'check') {
          return (
            <View key={`chk-${idx}`} style={styles.rowBlock}>
              <Pressable
                accessibilityLabel="Toggle checkbox"
                onPress={() => updateLine(idx, serializeLine({ ...parsed, checked: !parsed.checked }))}
                hitSlop={8}
                style={[
                  styles.checkbox,
                  {
                    borderColor: parsed.checked ? colors.accent : colors.borderStrong,
                    backgroundColor: parsed.checked ? colors.accent : 'transparent',
                  },
                ]}
              >
                {parsed.checked ? (
                  <AppText variant="caption" color="inverse" style={{ fontSize: 10, lineHeight: 12 }}>
                    ✓
                  </AppText>
                ) : null}
              </Pressable>
              <TextInput
                ref={(el) => {
                  if (el) inputRefs.current.set(idx, el);
                  else inputRefs.current.delete(idx);
                }}
                value={parsed.text}
                onFocus={() => onActiveLineChange(idx)}
                onChangeText={(t) => handleTextChange(idx, parsed, t)}
                onKeyPress={(e) => handleKeyPress(idx, parsed, e.nativeEvent.key)}
                multiline
                blurOnSubmit={false}
                style={[
                  styles.lineInput,
                  { fontSize: baseFontSize, lineHeight: baseLineHeight },
                  buildInlineStyle(parsed, parsed.checked ? colors.textSecondary : colors.textPrimary),
                ]}
              />
            </View>
          );
        }

        if (parsed.kind === 'bullet') {
          return (
            <View key={`bul-${idx}`} style={styles.rowBlock}>
              <AppText variant="body" color="secondary" style={{ width: 16, marginTop: 2 }}>
                •
              </AppText>
              <TextInput
                ref={(el) => {
                  if (el) inputRefs.current.set(idx, el);
                  else inputRefs.current.delete(idx);
                }}
                value={parsed.text}
                onFocus={() => onActiveLineChange(idx)}
                onChangeText={(t) => handleTextChange(idx, parsed, t)}
                onKeyPress={(e) => handleKeyPress(idx, parsed, e.nativeEvent.key)}
                multiline
                blurOnSubmit={false}
                style={[
                  styles.lineInput,
                  { fontSize: baseFontSize, lineHeight: baseLineHeight },
                  buildInlineStyle(parsed, colors.textPrimary),
                ]}
              />
            </View>
          );
        }

        if (parsed.kind === 'quote') {
          return (
            <View
              key={`q-${idx}`}
              style={[
                styles.quoteBlock,
                { borderLeftColor: colors.accent, backgroundColor: colors.surfaceSubtle },
              ]}
            >
              <TextInput
                ref={(el) => {
                  if (el) inputRefs.current.set(idx, el);
                  else inputRefs.current.delete(idx);
                }}
                value={parsed.text}
                onFocus={() => onActiveLineChange(idx)}
                onChangeText={(t) => handleTextChange(idx, parsed, t)}
                onKeyPress={(e) => handleKeyPress(idx, parsed, e.nativeEvent.key)}
                multiline
                blurOnSubmit={false}
                style={[
                  styles.lineInput,
                  { fontSize: baseFontSize, lineHeight: baseLineHeight },
                  buildInlineStyle(parsed, colors.textSecondary),
                ]}
              />
            </View>
          );
        }

        if (parsed.kind === 'heading') {
          const hSize = parsed.headingLevel === 1 ? 24 : parsed.headingLevel === 3 ? 17 : 20;
          return (
            <TextInput
              key={`h-${idx}`}
              ref={(el) => {
                if (el) inputRefs.current.set(idx, el);
                else inputRefs.current.delete(idx);
              }}
              value={parsed.text}
              onFocus={() => onActiveLineChange(idx)}
              onChangeText={(t) => handleTextChange(idx, parsed, t)}
              onKeyPress={(e) => handleKeyPress(idx, parsed, e.nativeEvent.key)}
              multiline
              blurOnSubmit={false}
              style={{
                fontFamily: fonts.serifMedium,
                fontSize: Math.round(hSize * fontScale),
                lineHeight: Math.round((hSize + 7) * fontScale),
                color: resolveTextColor(parsed, colors.textPrimary),
                paddingVertical: 4,
                marginTop: 6,
              }}
            />
          );
        }

        const hasRichTokens =
          !isFocused &&
          !parsed.isBold &&
          !parsed.isItalic &&
          !parsed.isUnderline &&
          !parsed.isStrike &&
          !parsed.isHighlight &&
          !parsed.colorKey &&
          /(\[\[[^[\]]+\]\]|\[[^\]]+\]\([^)]+\)|#[a-zA-Z])/.test(rawLine);

        if (hasRichTokens) {
          return (
            <Pressable
              key={`md-${idx}`}
              onPress={() => {
                onActiveLineChange(idx);
                setPendingFocusIndex(idx);
              }}
              style={{ paddingVertical: 2 }}
            >
              <MarkdownRenderer
                content={rawLine}
                attachments={attachments}
                onPressWikilink={onOpenWikilink}
                onPressLink={onOpenLink}
              />
            </Pressable>
          );
        }

        return (
          <TextInput
            key={`p-${idx}`}
            ref={(el) => {
              if (el) inputRefs.current.set(idx, el);
              else inputRefs.current.delete(idx);
            }}
            value={parsed.text}
            onFocus={() => onActiveLineChange(idx)}
            onChangeText={(t) => handleTextChange(idx, parsed, t)}
            onKeyPress={(e) => handleKeyPress(idx, parsed, e.nativeEvent.key)}
            multiline
            blurOnSubmit={false}
            style={[
              {
                fontSize: baseFontSize,
                lineHeight: baseLineHeight,
                paddingVertical: 3,
                paddingHorizontal: parsed.isHighlight ? 4 : 0,
                borderRadius: parsed.isHighlight ? 4 : 0,
              },
              buildInlineStyle(parsed, colors.textPrimary),
            ]}
          />
        );
      })}

      <Pressable
        onPress={() => {
          const lastIdx = lines.length - 1;
          const lastParsed = parseLine(lines[lastIdx] ?? '', attachments);
          if (lastParsed.kind === 'image' || lastParsed.kind === 'file') {
            onChangeContent(`${content}\n`);
            onActiveLineChange(lines.length);
            setPendingFocusIndex(lines.length);
          } else {
            onActiveLineChange(lastIdx);
            inputRefs.current.get(lastIdx)?.focus();
          }
        }}
        style={{ minHeight: 160 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 2, marginTop: 8 },
  rowBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 3 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineInput: { flex: 1, paddingVertical: 0 },
  quoteBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
    paddingRight: 10,
    marginVertical: 4,
    borderRadius: 4,
  },
  removeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    marginVertical: 6,
  },
  fileMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
