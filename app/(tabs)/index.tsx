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
import { Archive, Moon, Pin, Plus, Search, Sun, X } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import {
  createNote,
  listNotes,
  listNotesByIds,
  restoreNote,
  updateNote,
} from '../../src/database/repositories/notesRepo';
import { listTags } from '../../src/database/repositories/tagsRepo';
import { saveAppSettings } from '../../src/database/repositories/settingsRepo';
import { searchService } from '../../src/services/search/searchService';
import { BackupModal } from '../../src/features/notes/BackupModal';
import type { Note, Tag } from '../../src/types/models';
import { formatRelativeDate } from '../../src/utils/id';
import { AppText, Chip, Divider, EmptyState } from '../../src/components/ui';

export default function NotesHomeScreen() {
  const router = useRouter();
  const { colors, fonts, isDark } = useTheme();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const setSettings = useAppStore((s) => s.setSettings);
  const lastDeletedNote = useAppStore((s) => s.lastDeletedNote);
  const setLastDeletedNote = useAppStore((s) => s.setLastDeletedNote);

  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backupOpen, setBackupOpen] = useState(false);

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
      const matchedIds = hits.filter((h) => h.entityType === 'note').map((h) => h.id);
      setNotes(await listNotesByIds(db, matchedIds));
    } else if (trimmed.length === 1) {
      const all = await listNotes(db, { tagId, limit: 200 });
      const lower = trimmed.toLowerCase();
      setNotes(
        all.filter(
          (n) => n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower)
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

  useEffect(() => {
    if (!lastDeletedNote) return;
    const timer = setTimeout(() => setLastDeletedNote(null), 5000);
    return () => clearTimeout(timer);
  }, [lastDeletedNote, setLastDeletedNote]);

  const handleUndoDelete = async () => {
    if (!lastDeletedNote) return;
    const db = await getDatabase();
    await restoreNote(db, lastDeletedNote.id);
    setLastDeletedNote(null);
    bumpDataVersion();
    void loadNotes(query, selectedTagId);
  };

  const handleCreateNote = async () => {
    const db = await getDatabase();
    const created = await createNote(db, { title: 'Untitled', content: '', isInbox: false });
    bumpDataVersion();
    router.push(`/notes/${created.id}`);
  };

  const handleTogglePin = async (note: Note) => {
    const db = await getDatabase();
    await updateNote(db, note.id, { isPinned: !note.isPinned });
    bumpDataVersion();
    void loadNotes(query, selectedTagId);
  };

  const handleToggleTheme = async () => {
    const db = await getDatabase();
    setSettings(await saveAppSettings(db, { theme: isDark ? 'light' : 'dark' }));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">Notes</AppText>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Backup and Export" onPress={() => setBackupOpen(true)} style={styles.iconHit} hitSlop={10}>
            <Archive size={19} color={colors.textSecondary} strokeWidth={1.75} />
          </Pressable>
          <Pressable accessibilityLabel="Toggle theme" onPress={handleToggleTheme} style={styles.iconHit} hitSlop={10}>
            {isDark ? <Sun size={20} color={colors.textSecondary} strokeWidth={1.75} /> : <Moon size={20} color={colors.textSecondary} strokeWidth={1.75} />}
          </Pressable>
          <Pressable accessibilityLabel="New note" onPress={handleCreateNote} style={[styles.newBtn, { backgroundColor: colors.accent }]}>
            <Plus size={18} color={colors.accentText} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: searchFocused ? colors.accent : colors.border,
            },
          ]}
        >
          <Search
            size={16}
            color={searchFocused ? colors.accent : colors.textTertiary}
            strokeWidth={1.75}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search notes"
            placeholderTextColor={colors.textTertiary}
            style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.sansRegular, fontSize: 15, paddingVertical: 10 }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {tags.length > 0 ? (
        <View style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="All" selected={selectedTagId === null} onPress={() => setSelectedTagId(null)} />
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
        renderItem={({ item, index }) => {
          const prev = index > 0 ? notes[index - 1] : null;
          const showPinnedLabel = index === 0 && item.isPinned;
          const showNotesLabel = prev?.isPinned && !item.isPinned;
          const excerpt = item.content
            .replace(/!\[\[[^\]]+\]\]/g, '[Media]')
            .replace(/!\[[^\]]*\]\([^)]+\)/g, '[Image]')
            .replace(/<\/?(c(?::[a-z]+)?|u)>/g, '')
            .replace(/==|~~/g, '')
            .replace(/[#>*_`[\]]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          return (
            <View>
              {showPinnedLabel ? (
                <AppText variant="caption" color="tertiary" style={styles.sectionLabel}>
                  Pinned
                </AppText>
              ) : showNotesLabel ? (
                <AppText variant="caption" color="tertiary" style={styles.sectionLabel}>
                  Notes
                </AppText>
              ) : null}
              <Pressable
                onPress={() => router.push(`/notes/${item.id}`)}
                onLongPress={() => handleTogglePin(item)}
                style={({ pressed }) => [styles.noteRow, { opacity: pressed ? 0.65 : 1 }]}
              >
                <View style={styles.noteTopRow}>
                  <View style={styles.titleRow}>
                    {item.isPinned ? <Pin size={13} color={colors.accent} strokeWidth={2} /> : null}
                    <AppText variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                      {item.title}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="tertiary" tabular>
                    {formatRelativeDate(item.updatedAt)}
                  </AppText>
                </View>
                {excerpt.length > 0 ? (
                  <AppText variant="bodySmall" color="secondary" numberOfLines={2}>
                    {excerpt}
                  </AppText>
                ) : null}
                {item.tags && item.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {item.tags.slice(0, 4).map((t) => (
                      <AppText key={t.id} variant="caption" color="tertiary">
                        #{t.name}
                      </AppText>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        }}
      />

      {lastDeletedNote ? (
        <View
          style={[
            styles.undoToast,
            { backgroundColor: colors.textPrimary },
          ]}
        >
          <AppText variant="bodySmall" color="inverse" numberOfLines={1} style={{ flex: 1 }}>
            Deleted &ldquo;{lastDeletedNote.title}&rdquo;
          </AppText>
          <Pressable onPress={handleUndoDelete} hitSlop={8}>
            <AppText variant="label" color="accent" style={{ fontWeight: '700' }}>
              Undo
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <BackupModal visible={backupOpen} onClose={() => setBackupOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconHit: { padding: 6 },
  newBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 22, paddingBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10 },
  listContent: { paddingHorizontal: 22, paddingBottom: 40 },
  sectionLabel: { paddingTop: 10, paddingBottom: 2, fontWeight: '600' },
  noteRow: { paddingVertical: 16, gap: 5 },
  noteTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  undoToast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
});
