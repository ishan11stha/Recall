import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2, Pencil } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import {
  listFlashcards,
  recordFlashcardReview,
} from '../../src/database/repositories/flashcardsRepo';
import { defaultScheduler } from '../../src/services/scheduler/fsrsScheduler';
import type { Flashcard, ReviewRating } from '../../src/types/models';
import { formatIntervalDays } from '../../src/utils/id';
import { AppText, Button, Card, Divider } from '../../src/components/ui';

function getCurrentEpochMs(): number {
  return Date.now();
}

function formatCloze(text: string, revealed: boolean): string {
  return revealed
    ? text.replace(/\{\{([^}]+)\}\}/g, '$1')
    : text.replace(/\{\{([^}]+)\}\}/g, '[ … ]');
}

export default function ReviewSessionScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const cardShownAt = useRef<number>(0);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const due = await listFlashcards(db, { dueOnly: true });
      setQueue(due);
      setLoading(false);
      cardShownAt.current = getCurrentEpochMs();
    })();
  }, []);

  const currentCard = queue[index] ?? null;

  const previews = useMemo(() => {
    if (!currentCard) return null;
    const state =
      currentCard.reviewState ?? defaultScheduler.createInitialState(currentCard.id);
    return defaultScheduler.previewAllRatings(state);
  }, [currentCard]);

  const handleRate = async (rating: ReviewRating) => {
    if (!currentCard) return;
    const nowMs = getCurrentEpochMs();
    const durationMs = cardShownAt.current > 0 ? Math.max(0, nowMs - cardShownAt.current) : 0;
    const db = await getDatabase();
    await recordFlashcardReview(db, currentCard.id, rating, { reviewDurationMs: durationMs });
    Haptics.selectionAsync().catch(() => {});

    setCompletedCount((c) => c + 1);
    bumpDataVersion();
    setRevealed(false);
    setIndex((i) => i + 1);
    cardShownAt.current = getCurrentEpochMs();
  };

  const progressPct =
    queue.length > 0 ? Math.min(100, Math.round((index / queue.length) * 100)) : 100;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="caption" color="secondary" tabular>
          {currentCard ? `${index + 1} / ${queue.length}` : 'Done'}
        </AppText>
        {currentCard ? (
          <Pressable
            accessibilityLabel="Edit card"
            onPress={() => router.push(`/flashcards/edit/${currentCard.id}`)}
            hitSlop={12}
          >
            <Pencil size={18} color={colors.textSecondary} strokeWidth={1.75} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
        <View
          style={{
            height: '100%',
            width: `${progressPct}%`,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      {loading ? null : !currentCard ? (
        <View style={styles.completeBox}>
          <CheckCircle2 size={32} color={colors.accent} strokeWidth={1.75} />
          <AppText variant="h1">Session complete</AppText>
          <AppText variant="bodySmall" color="secondary">
            {completedCount > 0
              ? `Reviewed ${completedCount} ${completedCount === 1 ? 'card' : 'cards'}.`
              : 'Nothing due right now.'}
          </AppText>
          <Button label="Done" onPress={() => router.back()} style={{ marginTop: 12 }} />
        </View>
      ) : (
        <View style={styles.studyWrap}>
          <ScrollView contentContainerStyle={styles.cardCenter}>
            <Card
              onPress={() => {
                if (!revealed) setRevealed(true);
              }}
              style={styles.studyCard}
            >
              <AppText variant="caption" color="tertiary" style={styles.eyebrow}>
                PROMPT
              </AppText>
              <AppText variant="h1" style={{ textAlign: 'center' }}>
                {formatCloze(currentCard.front, revealed)}
              </AppText>

              {!revealed ? (
                <AppText
                  variant="caption"
                  color="tertiary"
                  style={{ textAlign: 'center', marginTop: 18 }}
                >
                  Tap card to reveal
                </AppText>
              ) : (
                <View style={styles.answerBlock}>
                  <Divider style={{ marginVertical: 18 }} />
                  <AppText variant="caption" color="accent" style={styles.eyebrow}>
                    ANSWER
                  </AppText>
                  <AppText variant="body" color="primary" style={{ textAlign: 'center' }}>
                    {currentCard.back}
                  </AppText>
                </View>
              )}
            </Card>
          </ScrollView>

          {!revealed ? (
            <Button
              label="Reveal Answer"
              size="lg"
              fullWidth
              onPress={() => setRevealed(true)}
            />
          ) : (
            <View style={styles.ratingRow}>
              {(
                [
                  { rating: 1 as ReviewRating, label: 'Again', tone: 'danger' as const },
                  { rating: 2 as ReviewRating, label: 'Hard', tone: 'primary' as const },
                  { rating: 3 as ReviewRating, label: 'Good', tone: 'accent' as const },
                  { rating: 4 as ReviewRating, label: 'Easy', tone: 'success' as const },
                ] as const
              ).map((item) => {
                const preview = previews?.[item.rating];
                const isPrimary = item.tone === 'accent';
                return (
                  <Pressable
                    key={item.rating}
                    onPress={() => handleRate(item.rating)}
                    style={({ pressed }) => [
                      styles.ratingBtn,
                      {
                        backgroundColor: isPrimary ? colors.accentSoft : colors.surface,
                        borderColor: isPrimary ? colors.accent : colors.border,
                        borderRadius: radius.md,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <AppText
                      variant="label"
                      color={item.tone}
                      style={{ fontWeight: '600' }}
                    >
                      {item.label}
                    </AppText>
                    <AppText variant="caption" color="tertiary" tabular>
                      {preview ? formatIntervalDays(preview.scheduledDays) : '—'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  completeBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  studyWrap: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 28,
    justifyContent: 'space-between',
    gap: 16,
  },
  cardCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  studyCard: {
    minHeight: 240,
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 22,
    gap: 10,
  },
  eyebrow: {
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '600',
    fontSize: 10.5,
  },
  answerBlock: {
    width: '100%',
    gap: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
  },
});
