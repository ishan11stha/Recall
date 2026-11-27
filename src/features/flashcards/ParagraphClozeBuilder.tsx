import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { RefreshCw, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import {
  generateClozeDraftsFromParagraph,
  serializeClozeDraft,
  toggleDraftTokenBlank,
  type ClozeCardDraft,
} from './clozeGenerator';
import { AppText, Button, Card, Chip, Input } from '../../components/ui';

interface ParagraphClozeBuilderProps {
  initialParagraph?: string;
  saving: boolean;
  onSaveCards: (cards: { front: string; back: string }[]) => Promise<void>;
}

function previewWithBlankLine(draft: ClozeCardDraft): string {
  return draft.tokens
    .map((tok) => {
      if (!tok.isBlank || !tok.clean) return tok.raw;
      const escaped = tok.clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return tok.raw.replace(new RegExp(escaped), '_____');
    })
    .join(' ');
}

export function ParagraphClozeBuilder({
  initialParagraph = '',
  saving,
  onSaveCards,
}: ParagraphClozeBuilderProps) {
  const { colors, radius } = useTheme();
  const [paragraph, setParagraph] = useState(initialParagraph);
  const [blanksPerSentence, setBlanksPerSentence] = useState<1 | 2>(1);
  const [drafts, setDrafts] = useState<ClozeCardDraft[]>(() =>
    initialParagraph ? generateClozeDraftsFromParagraph(initialParagraph, 1) : []
  );

  // Auto-generate one blank card per sentence live as you paste/type
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!paragraph.trim()) {
        setDrafts([]);
        return;
      }
      setDrafts(generateClozeDraftsFromParagraph(paragraph, blanksPerSentence));
    }, 220);
    return () => clearTimeout(timer);
  }, [paragraph, blanksPerSentence]);

  const handleSave = async () => {
    const valid = drafts
      .map(serializeClozeDraft)
      .filter((item): item is { front: string; back: string } => item !== null);
    if (valid.length === 0) {
      Alert.alert('No blanks selected', 'Tap at least one word in a sentence to mark it as a blank.');
      return;
    }
    await onSaveCards(valid);
  };

  const readyCount = drafts.filter((d) => d.tokens.some((t) => t.isBlank)).length;

  return (
    <View style={{ gap: 14 }}>
      <Input
        label="Paragraph"
        value={paragraph}
        onChangeText={setParagraph}
        placeholder="Paste a paragraph to auto-create a blank from every sentence…"
        multiline
        textAlignVertical="top"
        style={{ minHeight: 120 }}
      />

      <View style={styles.controlsRow}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip
            label="1 blank / sentence"
            selected={blanksPerSentence === 1}
            onPress={() => setBlanksPerSentence(1)}
          />
          <Chip
            label="2 blanks"
            selected={blanksPerSentence === 2}
            onPress={() => setBlanksPerSentence(2)}
          />
        </View>
        {drafts.length > 0 ? (
          <Pressable
            accessibilityLabel="Reset auto blanks"
            onPress={() =>
              setDrafts(generateClozeDraftsFromParagraph(paragraph, blanksPerSentence))
            }
            hitSlop={8}
          >
            <RefreshCw size={15} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {drafts.length > 0 ? (
        <View style={{ gap: 10 }}>
          <AppText variant="caption" color="secondary" tabular>
            {readyCount} {readyCount === 1 ? 'sentence card' : 'sentence cards'} · Tap any word to change its blank
          </AppText>

          {drafts.map((draft, draftIdx) => (
            <Card key={draft.id} style={{ gap: 8 }}>
              <View style={styles.draftHeader}>
                <AppText variant="caption" color="tertiary" tabular>
                  Sentence {draftIdx + 1}
                </AppText>
                <Pressable
                  accessibilityLabel="Remove sentence card"
                  onPress={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                  hitSlop={8}
                >
                  <X size={15} color={colors.textTertiary} />
                </Pressable>
              </View>

              <AppText variant="bodySmall" color="secondary">
                {previewWithBlankLine(draft)}
              </AppText>

              <View style={styles.wordWrap}>
                {draft.tokens.map((tok, tokIdx) => (
                  <Pressable
                    key={`${draft.id}-${tokIdx}`}
                    disabled={!tok.isWord}
                    onPress={() =>
                      setDrafts((prev) =>
                        prev.map((d) =>
                          d.id === draft.id ? toggleDraftTokenBlank(d, tokIdx) : d
                        )
                      )
                    }
                    style={[
                      styles.wordPill,
                      tok.isBlank
                        ? {
                            backgroundColor: colors.accentSoft,
                            borderColor: colors.accent,
                            borderRadius: radius.sm,
                          }
                        : { borderColor: colors.border, borderRadius: radius.sm },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={tok.isBlank ? 'accent' : 'primary'}
                      style={tok.isBlank ? { fontWeight: '600' } : undefined}
                    >
                      {tok.raw}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ))}

          <Button
            label={`Save ${readyCount} ${readyCount === 1 ? 'Card' : 'Cards'}`}
            onPress={handleSave}
            loading={saving}
            disabled={readyCount === 0}
            fullWidth
            style={{ marginTop: 4 }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  draftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },
  wordPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
  },
});
