import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Layers, Orbit, Pin, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import {
  createNote,
  getNoteById,
  listNotes,
  softDeleteNote,
  touchNoteAccess,
  updateNote,
} from '../../src/database/repositories/notesRepo';
import { createNoteLink, getConnectionsForNote } from '../../src/database/repositories/linksRepo';
import { listAttachments } from '../../src/database/repositories/attachmentsRepo';
import { shareLocalFile } from '../../src/services/files/attachmentStorage';
import { syncNoteWikilinksAndTags } from '../../src/features/notes/markdownParser';
import {
  pickAndAttachFile,
  pickAndAttachPhoto,
  removeNoteAttachment,
} from '../../src/features/notes/noteMediaActions';
import { NoteAttachmentsAndBacklinks } from '../../src/features/notes/NoteAttachmentsAndBacklinks';
import type { Attachment, Note, NoteLinkDetail } from '../../src/types/models';
import { computeWordCount } from '../../src/utils/id';
import { AppText, Divider } from '../../src/components/ui';
import {
  applyColorToLine,
  applyLiveFormatToLine,
  LiveBlockEditor,
  type LiveFormatCommand,
} from '../../src/components/editor/LiveBlockEditor';
import {
  MarkdownToolbar,
  type FormatAction,
  type TextColorKey,
} from '../../src/components/editor/MarkdownToolbar';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fonts, fontScale } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const setLastDeletedNote = useAppStore((s) => s.setLastDeletedNote);

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [backlinks, setBacklinks] = useState<NoteLinkDetail[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const isFirstLoad = useRef(true);

  const loadMeta = useCallback(async () => {
    if (!id) return;
    const db = await getDatabase();
    const [atts, conns, notesList] = await Promise.all([
      listAttachments(db, { noteId: id }),
      getConnectionsForNote(db, id),
      listNotes(db, { limit: 150 }),
    ]);
    setAttachments(atts);
    setBacklinks(conns.backlinks);
    setAllNotes(notesList.filter((n) => n.id !== id));
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      const db = await getDatabase();
      const note = await getNoteById(db, id);
      if (!mounted) return;
      if (note) {
        await touchNoteAccess(db, id);
        setTitle(note.title === 'Untitled' ? '' : note.title);
        setContent(note.content);
        setIsPinned(note.isPinned);
      }
      await loadMeta();
      if (!mounted) return;
      setLoaded(true);
      setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);
    })();
    return () => {
      mounted = false;
    };
  }, [id, loadMeta]);

  useEffect(() => {
    if (!loaded || isFirstLoad.current || !id) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const db = await getDatabase();
        await updateNote(db, id, { title: title.trim() || 'Untitled', content });
        await syncNoteWikilinksAndTags(db, id, content);
        bumpDataVersion();
      } finally {
        setSaveStatus('saved');
      }
    }, 550);
    return () => clearTimeout(timer);
  }, [id, loaded, title, content, bumpDataVersion]);

  const activeWikilinkQuery = useMemo(() => {
    const line = content.split('\n')[activeLineIndex] ?? '';
    const match = line.match(/\[\[([^[\]]*)$/);
    return match ? match[1] : null;
  }, [content, activeLineIndex]);

  const wikilinkSuggestions = useMemo(() => {
    if (activeWikilinkQuery === null) return [];
    const q = activeWikilinkQuery.trim().toLowerCase();
    return allNotes.filter((n) => (q ? n.title.toLowerCase().includes(q) : true)).slice(0, 6);
  }, [activeWikilinkQuery, allNotes]);

  const handleApplyFormat = (action: FormatAction) => {
    const next = applyLiveFormatToLine(
      content,
      activeLineIndex,
      action.key as LiveFormatCommand,
      attachments
    );
    setContent(next);
  };

  const handleApplyColor = (colorKey: TextColorKey) => {
    setContent(applyColorToLine(content, activeLineIndex, colorKey, attachments));
  };

  const handleInsertMedia = async (kind: 'camera' | 'library' | 'file') => {
    if (!id) return;
    const embed =
      kind === 'file' ? await pickAndAttachFile(id) : await pickAndAttachPhoto(id, kind);
    if (!embed) return;
    const lines = content.split('\n');
    const insertAt = Math.min(activeLineIndex + 1, lines.length);
    lines.splice(insertAt, 0, embed, '');
    setContent(lines.join('\n'));
    setActiveLineIndex(insertAt + 1);
    bumpDataVersion();
    await loadMeta();
  };

  const handleOpenWikilink = async (targetTitle: string) => {
    if (!id) return;
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM notes WHERE deleted_at IS NULL AND LOWER(title) = LOWER(?) LIMIT 1',
      [targetTitle]
    );
    if (existing) {
      router.push(`/notes/${existing.id}`);
      return;
    }
    const created = await createNote(db, { title: targetTitle, content: '', isInbox: false });
    await createNoteLink(db, { sourceNoteId: id, targetNoteId: created.id, relationshipType: 'related_to' });
    bumpDataVersion();
    router.push(`/notes/${created.id}`);
  };

  const handleOpenLink = async (url: string) => {
    if (url.startsWith('file://')) {
      await shareLocalFile(url).catch(() => Alert.alert('Unable to open file'));
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

  const handleBack = async () => {
    if (id && loaded) {
      const db = await getDatabase();
      await updateNote(db, id, { title: title.trim() || 'Untitled', content });
      await syncNoteWikilinksAndTags(db, id, content);
      bumpDataVersion();
    }
    router.back();
  };

  const handleDeleteNote = () => {
    if (!id) return;
    Alert.alert('Delete note?', 'You can undo right after deleting.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = await getDatabase();
          await softDeleteNote(db, id);
          setLastDeletedNote({ id, title: title.trim() || 'Untitled' });
          bumpDataVersion();
          router.back();
        },
      },
    ]);
  };

  const wordCount = computeWordCount(`${title} ${content}`);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Single Clean Top Bar — No Read/Edit Toggle */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="caption" color="tertiary" tabular>
          {wordCount} words · {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
        </AppText>
        <Pressable
          accessibilityLabel={isPinned ? 'Unpin note' : 'Pin note'}
          onPress={async () => {
            if (!id) return;
            const next = !isPinned;
            setIsPinned(next);
            const db = await getDatabase();
            await updateNote(db, id, { isPinned: next });
            bumpDataVersion();
          }}
          hitSlop={10}
        >
          <Pin size={19} color={isPinned ? colors.accent : colors.textTertiary} strokeWidth={1.75} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.textTertiary}
            multiline
            style={{
              fontFamily: fonts.serifMedium,
              fontSize: Math.round(28 * fontScale),
              lineHeight: Math.round(35 * fontScale),
              color: colors.textPrimary,
            }}
          />

          <LiveBlockEditor
            content={content}
            attachments={attachments}
            activeLineIndex={activeLineIndex}
            onActiveLineChange={setActiveLineIndex}
            onChangeContent={setContent}
            onOpenWikilink={handleOpenWikilink}
            onOpenLink={handleOpenLink}
            onRemoveAttachmentByTitle={async (attTitle) => {
              const target = attachments.find(
                (a) => a.title.toLowerCase() === attTitle.toLowerCase()
              );
              if (target) {
                await removeNoteAttachment(target);
                bumpDataVersion();
                await loadMeta();
              }
            }}
          />

          <NoteAttachmentsAndBacklinks
            content={content}
            attachments={attachments}
            backlinks={backlinks}
            onOpenFile={handleOpenLink}
            onRemoveAttachment={async (att) => {
              await removeNoteAttachment(att);
              bumpDataVersion();
              await loadMeta();
            }}
            onOpenNote={(noteId) => router.push(`/notes/${noteId}`)}
          />
        </ScrollView>

        {activeWikilinkQuery !== null && wikilinkSuggestions.length > 0 ? (
          <View
            style={[
              styles.suggestWrap,
              { backgroundColor: colors.surfaceSubtle, borderTopColor: colors.border },
            ]}
          >
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestBar}
            >
              {wikilinkSuggestions.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    const lines = content.split('\n');
                    lines[activeLineIndex] = (lines[activeLineIndex] ?? '').replace(
                      /\[\[[^[\]]*$/,
                      `[[${item.title}]]`
                    );
                    setContent(lines.join('\n'));
                  }}
                  style={[
                    styles.suggestChip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <AppText variant="caption" color="accent" style={{ fontWeight: '600' }}>
                    [[{item.title}]]
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <MarkdownToolbar
          onApply={handleApplyFormat}
          onApplyColor={handleApplyColor}
          onCapturePhoto={() => void handleInsertMedia('camera')}
          onAttachImage={() => void handleInsertMedia('library')}
          onAttachFile={() => void handleInsertMedia('file')}
        />

        <Divider />

        <View style={[styles.footerBar, { backgroundColor: colors.background }]}>
          <Pressable onPress={() => router.push({ pathname: '/(tabs)/mindmap', params: { focusNoteId: id } })} style={styles.footerAction}>
            <Orbit size={17} color={colors.textSecondary} strokeWidth={1.75} />
            <AppText variant="caption" color="secondary">Mind Map</AppText>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/flashcards/edit/[id]',
                params: { id: 'new', noteId: id, prefillFront: title.trim() || 'Untitled', prefillParagraph: content.trim() },
              })
            }
            style={styles.footerAction}
          >
            <Layers size={17} color={colors.textSecondary} strokeWidth={1.75} />
            <AppText variant="caption" color="secondary">Make Card</AppText>
          </Pressable>
          <Pressable onPress={handleDeleteNote} style={styles.footerAction}>
            <Trash2 size={17} color={colors.danger} strokeWidth={1.75} />
            <AppText variant="caption" color="danger">Delete</AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 12 },
  editorContent: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 36 },
  suggestWrap: { height: 42, flexShrink: 0, flexGrow: 0, borderTopWidth: 1, justifyContent: 'center' },
  suggestBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  footerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 11, paddingHorizontal: 16 },
  footerAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10 },
});
