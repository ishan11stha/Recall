import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Moon, Plus, Search, Sun, X } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import { createNote, listNotes } from '../../src/database/repositories/notesRepo';
import { listTags } from '../../src/database/repositories/tagsRepo';
import { saveAppSettings } from '../../src/database/repositories/settingsRepo';
import { searchService } from '../../src/services/search/searchService';
import type { Note, Tag } from '../../src/types/models';
import { formatRelativeDate } from '../../src/utils/id';
import { AppText } from '../../src/components/ui/AppText';
import { Chip, Divider, EmptyState } from '../../src/components/ui/Primitives';

export default function NotesHomeScreen() {
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const setSettings = useAppStore((s) => s.setSettings);

  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadNotes = useCallback(async (searchText: string, tagId: string | null) => {
    const db = await getDatabase();
    const allTags = await listTags(db);
    setTags(allTags.filter((t) => (t.noteCount ?? 0) > 0));

    const trimmed = searchText.trim();
    if (trimmed.length >= 2) {
      const hits = await searchService.search(db, trimmed, {
        includeResources: false,
        tagId,
      });
      const noteIds = new Set(hits.filter((h) => h.entityType === 'note').map((h) => h.id));
      const all = await listNotes(db, { tagId, limit: 200 });
      setNotes(all.filter((n) => noteIds.has(n.id)));
    } else if (trimmed.length === 1) {
      const all = await listNotes(db, { tagId, limit: 200 });
      const lower = trimmed.toLowerCase();
      setNotes(
        all.filter(
          (n) =>
            n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
        )
      );
    } else {
      setNotes(await listNotes(db, { tagId, limit: 200 }));
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotes(query, selectedTagId);
    }, [loadNotes, query, selectedTagId])
  );

  useEffect(() => {
    if (dataVersion > 0) {
      void Promise.resolve().then(() => loadNotes(query, selectedTagId));
    }
  }, [dataVersion, loadNotes, query, selectedTagId]);

  const handleCreateNote = async () => {
    const db = await getDatabase();
    const created = await createNote(db, {
      title: 'Untitled',
      content: '',
      isInbox: false,
    });
    bumpDataVersion();
    router.push(`/notes/${created.id}`);
  };

  const handleToggleTheme = async () => {
    const nextTheme = isDark ? 'light' : 'dark';
    const db = await getDatabase();
    const updated = await saveAppSettings(db, { theme: nextTheme });
    setSettings(updated);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <AppText variant="display">Notes</AppText>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Toggle theme"
            onPress={handleToggleTheme}
            style={styles.iconHit}
            hitSlop={10}
          >
            {isDark ? (
              <Sun size={20} color={colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <Moon size={20} color={colors.textSecondary} strokeWidth={1.75} />
            )}
          </Pressable>
          <Pressable
            accessibilityLabel="New note"
            onPress={handleCreateNote}
            style={[styles.newBtn, { backgroundColor: colors.accent }]}
          >
            <Plus size={18} color={colors.accentText} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {/* Single Quiet Search Bar */}
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Search size={16} color={colors.textTertiary} strokeWidth={1.75} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={colors.textTertiary}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontFamily: fonts.sansRegular,
              fontSize: 15,
              paddingVertical: 10,
            }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Quiet #tag Filter Row (only shown when tags exist) */}
      {tags.length > 0 ? (
        <View style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            <Chip
              label="All"
              selected={selectedTagId === null}
              onPress={() => setSelectedTagId(null)}
            />
            {tags.map((t) => (
              <Chip
                key={t.id}
                label={`#${t.name}`}
                selected={selectedTagId === t.id}
                onPress={() => setSelectedTagId(selectedTagId === t.id ? null : t.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Clean Single-Column List */}
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Divider />}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={{ paddingTop: 40 }}>
              <EmptyState
                title={query.trim() ? 'No matching notes' : 'A quiet place to think'}
                description={
                  query.trim()
                    ? 'Try another keyword or clear your search.'
                    : 'Start with a single note. Connect ideas visually in Mind Map, and review what matters.'
                }
                actionLabel={query.trim() ? 'Clear Search' : 'New Note'}
                onAction={query.trim() ? () => setQuery('') : handleCreateNote}
              />
            </View>
          )
        }
        renderItem={({ item }) => {
          const excerpt = item.content
            .replace(/[#>*_`[\]]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          return (
            <Pressable
              onPress={() => router.push(`/notes/${item.id}`)}
              style={({ pressed }) => [styles.noteRow, { opacity: pressed ? 0.65 : 1 }]}
            >
              <View style={styles.noteTopRow}>
                <AppText variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color="tertiary" tabular>
                  {formatRelativeDate(item.updatedAt)}
                </AppText>
              </View>
              {excerpt.length > 0 ? (
                <AppText variant="bodySmall" color="secondary" numberOfLines={2}>
                  {excerpt}
                </AppText>
              ) : null}
            </Pressable>
          );
        }}
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
    paddingBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconHit: {
    padding: 6,
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  noteRow: {
    paddingVertical: 16,
    gap: 5,
  },
  noteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
