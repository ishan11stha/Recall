import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Play, Plus } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import { listFlashcards } from '../../src/database/repositories/flashcardsRepo';
import type { Flashcard } from '../../src/types/models';
import { formatIntervalDays } from '../../src/utils/id';
import { AppText } from '../../src/components/ui/AppText';
import { Button } from '../../src/components/ui/Button';
import { Divider, EmptyState } from '../../src/components/ui/Primitives';

export default function ReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const dataVersion = useAppStore((s) => s.dataVersion);

  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);

  const load = useCallback(async () => {
    const db = await getDatabase();
    const [due, all] = await Promise.all([
      listFlashcards(db, { dueOnly: true }),
      listFlashcards(db),
    ]);
    setDueCards(due);
    setAllCards(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (dataVersion > 0) {
      void Promise.resolve().then(() => load());
    }
  }, [dataVersion, load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <AppText variant="display">Review</AppText>
        <Pressable
          accessibilityLabel="New flashcard"
          onPress={() =>
            router.push({ pathname: '/flashcards/edit/[id]', params: { id: 'new' } })
          }
          style={[styles.newBtn, { backgroundColor: colors.accent }]}
        >
          <Plus size={18} color={colors.accentText} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Calm Single-Column Summary */}
      <View style={styles.heroBlock}>
        <AppText variant="stat" tabular>
          {dueCards.length === 0 ? 'All caught up' : `${dueCards.length} due`}
        </AppText>
        <AppText variant="bodySmall" color="secondary" tabular>
          {allCards.length} {allCards.length === 1 ? 'card' : 'cards'} total · FSRS spaced repetition
        </AppText>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          {dueCards.length > 0 ? (
            <Button
              label="Start Review"
              icon={<Play size={15} color={colors.accentText} />}
              onPress={() => router.push('/flashcards/session')}
            />
          ) : null}
          <Button
            label="From Paragraph"
            variant={dueCards.length > 0 ? 'secondary' : 'primary'}
            onPress={() =>
              router.push({
                pathname: '/flashcards/edit/[id]',
                params: { id: 'new', mode: 'paragraph' },
              })
            }
          />
        </View>
      </View>

      <Divider style={{ marginHorizontal: 22 }} />

      {/* Clean Single-Column Card List */}
      <FlatList
        data={allCards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Divider />}
        ListEmptyComponent={
          <View style={{ paddingTop: 36 }}>
            <EmptyState
              title="No flashcards yet"
              description="Turn key ideas from your notes into flashcards to remember them effortlessly."
              actionLabel="New Flashcard"
              onAction={() =>
                router.push({ pathname: '/flashcards/edit/[id]', params: { id: 'new' } })
              }
            />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/flashcards/edit/${item.id}`)}
            style={({ pressed }) => [styles.cardRow, { opacity: pressed ? 0.65 : 1 }]}
          >
            <AppText variant="h3" numberOfLines={1}>
              {item.front}
            </AppText>
            <AppText variant="bodySmall" color="secondary" numberOfLines={1}>
              {item.back}
            </AppText>
            {item.reviewState ? (
              <AppText variant="caption" color="tertiary" tabular>
                {item.reviewState.reps === 0
                  ? 'New'
                  : `Interval ${formatIntervalDays(item.reviewState.scheduledDays)}`}
              </AppText>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBlock: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    gap: 4,
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  cardRow: {
    paddingVertical: 15,
    gap: 4,
  },
});
