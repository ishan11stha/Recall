import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
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
import { AppText } from '../../src/components/ui/AppText';
import { Button } from '../../src/components/ui/Button';
import { Divider } from '../../src/components/ui/Primitives';

function getCurrentEpochMs(): number {
  return Date.now();
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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="caption" color="secondary" tabular>
          {currentCard ? `${index + 1} / ${queue.length}` : 'Done'}
        </AppText>
        <View style={{ width: 22 }} />
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
            <AppText variant="h1" style={{ textAlign: 'center' }}>
              {currentCard.front}
            </AppText>

            {revealed ? (
              <View style={styles.answerBlock}>
                <Divider style={{ marginVertical: 20 }} />
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {currentCard.back}
                </AppText>
              </View>
            ) : null}
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
                  { rating: 1 as ReviewRating, label: 'Again', accent: false },
                  { rating: 2 as ReviewRating, label: 'Hard', accent: false },
                  { rating: 3 as ReviewRating, label: 'Good', accent: true },
                  { rating: 4 as ReviewRating, label: 'Easy', accent: false },
                ] as const
              ).map((item) => {
                const preview = previews?.[item.rating];
                return (
                  <Pressable
                    key={item.rating}
                    onPress={() => handleRate(item.rating)}
                    style={({ pressed }) => [
                      styles.ratingBtn,
                      {
                        backgroundColor: item.accent ? colors.accentSoft : colors.surface,
                        borderColor: item.accent ? colors.accent : colors.border,
                        borderRadius: radius.md,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <AppText
                      variant="label"
                      color={item.accent ? 'accent' : 'primary'}
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
    paddingVertical: 24,
  },
  answerBlock: {
    width: '100%',
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
