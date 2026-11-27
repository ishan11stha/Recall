import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Layers,
  Link2,
  Orbit,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';
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
import {
  createNoteLink,
  getConnectionsForNote,
} from '../../src/database/repositories/linksRepo';
import {
  createAttachment,
  deleteAttachment,
  listAttachments,
} from '../../src/database/repositories/attachmentsRepo';
import {
  copyFileToPersistentStorage,
  deletePersistentFile,
  shareLocalFile,
} from '../../src/services/files/attachmentStorage';
import { syncNoteWikilinksAndTags } from '../../src/features/notes/markdownParser';
import type { Attachment, Note, NoteLinkDetail } from '../../src/types/models';
import { computeWordCount, formatBytes } from '../../src/utils/id';
import { AppText } from '../../src/components/ui/AppText';
import { Divider } from '../../src/components/ui/Primitives';
import { MarkdownRenderer } from '../../src/components/editor/MarkdownRenderer';
import {
  MarkdownToolbar,
  type FormatAction,
} from '../../src/components/editor/MarkdownToolbar';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fonts, fontScale, radius } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'read'>('edit');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [selection, setSelection] = useState({ start: 0, end: 0 });

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
        // Open existing notes with content in Reading View? Keep Edit for empty notes, Read if already written
        if (note.content.trim().length > 0) {
          setMode('read');
        }
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

  // Quiet debounced autosave + automatic [[Wikilink]] & #tag sync
  useEffect(() => {
    if (!loaded || isFirstLoad.current || !id) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const db = await getDatabase();
        await updateNote(db, id, {
          title: title.trim() || 'Untitled',
          content,
        });
        await syncNoteWikilinksAndTags(db, id, content);
        bumpDataVersion();
      } finally {
        setSaveStatus('saved');
      }
    }, 550);
    return () => clearTimeout(timer);
  }, [id, loaded, title, content, bumpDataVersion]);

  // Detect active [[wikilink query before cursor for live autocomplete
  const activeWikilinkQuery = useMemo(() => {
    if (mode !== 'edit') return null;
    const before = content.slice(0, selection.start);
    const match = before.match(/\[\[([^[\]\n]*)$/);
    return match ? match[1] : null;
  }, [content, selection.start, mode]);

  const wikilinkSuggestions = useMemo(() => {
    if (activeWikilinkQuery === null) return [];
    const q = activeWikilinkQuery.trim().toLowerCase();
    return allNotes
      .filter((n) => (q ? n.title.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [activeWikilinkQuery, allNotes]);

  const handleCompleteWikilink = (targetTitle: string) => {
    const before = content.slice(0, selection.start);
    const after = content.slice(selection.end);
    const replacedBefore = before.replace(/\[\[[^[\]\n]*$/, `[[${targetTitle}]]`);
    setContent(`${replacedBefore}${after}`);
  };

  const insertAtCursor = (snippet: string) => {
    const start = selection.start;
    const end = selection.end;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const prefixNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    setContent(`${before}${prefixNewline}${snippet}\n${after}`);
  };

  const handleApplyFormat = (action: FormatAction) => {
    const start = selection.start;
    const end = selection.end;
    const before = content.slice(0, start);
    const selected = content.slice(start, end);
    const after = content.slice(end);

    if (action.lineStart) {
      const needsNewline = before.length > 0 && !before.endsWith('\n');
      setContent(`${before}${needsNewline ? '\n' : ''}${action.prefix}${selected}${after}`);
    } else if (action.suffix) {
      setContent(`${before}${action.prefix}${selected || ''}${action.suffix}${after}`);
    } else {
      setContent(`${before}${action.prefix}${selected}${after}`);
    }
  };

  const handleCapturePhoto = async () => {
    if (!id) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to capture photos into your note.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const stored = await copyFileToPersistentStorage(asset.uri, asset.fileName ?? 'photo.jpg');
      const label = asset.fileName ?? 'Photo';
      const db = await getDatabase();
      await createAttachment(db, {
        title: label,
        fileType: 'image',
        mimeType: asset.mimeType ?? 'image/jpeg',
        localUri: stored.localUri,
        fileSizeBytes: stored.fileSizeBytes,
        linkedNoteIds: [id],
      });
      insertAtCursor(`![${label}](${stored.localUri})`);
      bumpDataVersion();
      await loadMeta();
    } catch (err) {
      Alert.alert('Camera Error', err instanceof Error ? err.message : 'Could not capture photo.');
    }
  };

  const handleAttachImage = async () => {
    if (!id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to insert images.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const stored = await copyFileToPersistentStorage(asset.uri, asset.fileName ?? 'image.jpg');
      const label = asset.fileName ?? 'Image';
      const db = await getDatabase();
      await createAttachment(db, {
        title: label,
        fileType: 'image',
        mimeType: asset.mimeType ?? 'image/jpeg',
        localUri: stored.localUri,
        fileSizeBytes: stored.fileSizeBytes,
        linkedNoteIds: [id],
      });
      insertAtCursor(`![${label}](${stored.localUri})`);
      bumpDataVersion();
      await loadMeta();
    } catch (err) {
      Alert.alert('Image Error', err instanceof Error ? err.message : 'Could not insert image.');
    }
  };

  const handleAttachFile = async () => {
    if (!id) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const stored = await copyFileToPersistentStorage(asset.uri, asset.name);
      const isPdf =
        (asset.mimeType ?? '').includes('pdf') || asset.name.toLowerCase().endsWith('.pdf');
      const db = await getDatabase();
      await createAttachment(db, {
        title: asset.name,
        fileType: isPdf ? 'pdf' : 'research_document',
        mimeType: asset.mimeType ?? 'application/octet-stream',
        localUri: stored.localUri,
        fileSizeBytes: stored.fileSizeBytes,
        linkedNoteIds: [id],
      });
      insertAtCursor(`[📎 ${asset.name}](${stored.localUri})`);
      bumpDataVersion();
      await loadMeta();
    } catch (err) {
      Alert.alert('Attachment Error', err instanceof Error ? err.message : 'Could not attach file.');
    }
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
    // Tapping an unresolved [[Wikilink]] creates & links the new note automatically
    const created = await createNote(db, {
      title: targetTitle,
      content: '',
      isInbox: false,
    });
    await createNoteLink(db, {
      sourceNoteId: id,
      targetNoteId: created.id,
      relationshipType: 'related_to',
    });
    bumpDataVersion();
    router.push(`/notes/${created.id}`);
  };

  const handleOpenLink = async (url: string) => {
    if (url.startsWith('file://')) {
      try {
        await shareLocalFile(url);
      } catch (err) {
        Alert.alert('Unable to open file', err instanceof Error ? err.message : 'Cannot open.');
      }
      return;
    }
    Linking.openURL(url).catch(() => {});
  };

  const handleToggleChecklist = async (lineIndex: number) => {
    if (!id) return;
    const lines = content.split('\n');
    const target = lines[lineIndex];
    if (!target) return;
    lines[lineIndex] = target.includes('- [ ] ')
      ? target.replace('- [ ] ', '- [x] ')
      : target.replace(/- \[[xX]\] /, '- [ ] ');
    const next = lines.join('\n');
    setContent(next);
    const db = await getDatabase();
    await updateNote(db, id, { title: title.trim() || 'Untitled', content: next });
    bumpDataVersion();
  };

  const handleBack = async () => {
    if (id && loaded) {
      const db = await getDatabase();
      await updateNote(db, id, {
        title: title.trim() || 'Untitled',
        content,
      });
      await syncNoteWikilinksAndTags(db, id, content);
      bumpDataVersion();
    }
    router.back();
  };

  const handleDeleteNote = () => {
    if (!id) return;
    Alert.alert('Delete note?', 'This note will be removed from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = await getDatabase();
          await softDeleteNote(db, id);
          bumpDataVersion();
          router.back();
        },
      },
    ]);
  };

  const handleRemoveAttachment = async (att: Attachment) => {
    const db = await getDatabase();
    await deleteAttachment(db, att.id);
    if (att.localUri) {
      await deletePersistentFile(att.localUri);
    }
    bumpDataVersion();
    await loadMeta();
  };

  const wordCount = computeWordCount(`${title} ${content}`);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Quiet Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>

        <AppText variant="caption" color="tertiary" tabular>
          {wordCount} words · {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
        </AppText>

        <Pressable
          accessibilityLabel={mode === 'edit' ? 'Switch to Reading view' : 'Switch to Editing view'}
          onPress={() => setMode((m) => (m === 'edit' ? 'read' : 'edit'))}
          style={[
            styles.modeToggle,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          hitSlop={8}
        >
          {mode === 'edit' ? (
            <BookOpen size={15} color={colors.textPrimary} strokeWidth={1.75} />
          ) : (
            <Pencil size={15} color={colors.accent} strokeWidth={1.75} />
          )}
          <AppText variant="caption" style={{ fontWeight: '600' }}>
            {mode === 'edit' ? 'Read' : 'Edit'}
          </AppText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'edit' ? (
            <>
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

              <TextInput
                value={content}
                onChangeText={setContent}
                onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                placeholder="Write in Markdown… type [[ to link another note, #tag, or attach media below."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={{
                  minHeight: 320,
                  fontFamily: fonts.sansRegular,
                  fontSize: Math.round(16 * fontScale),
                  lineHeight: Math.round(25 * fontScale),
                  color: colors.textPrimary,
                  marginTop: 12,
                }}
              />
            </>
          ) : (
            <View style={{ gap: 12 }}>
              <AppText variant="display">{title.trim() || 'Untitled'}</AppText>
              <Divider />
              {content.trim().length > 0 ? (
                <MarkdownRenderer
                  content={content}
                  onToggleChecklistLine={handleToggleChecklist}
                  onPressWikilink={handleOpenWikilink}
                  onPressLink={handleOpenLink}
                />
              ) : (
                <Pressable onPress={() => setMode('edit')} style={{ paddingVertical: 16 }}>
                  <AppText variant="bodySmall" color="tertiary">
                    Empty note. Tap Edit to start writing or insert media.
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {/* Attached Media & Files */}
          {attachments.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Divider />
              <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                Media & Files ({attachments.length})
              </AppText>
              <View style={{ gap: 8 }}>
                {attachments.map((att) => {
                  const isImg =
                    att.fileType === 'image' || (att.mimeType ?? '').startsWith('image/');
                  return (
                    <Pressable
                      key={att.id}
                      onPress={() => att.localUri && handleOpenLink(att.localUri)}
                      style={[
                        styles.attRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderRadius: radius.sm,
                        },
                      ]}
                    >
                      {isImg && att.localUri ? (
                        <Image
                          source={{ uri: att.localUri }}
                          style={styles.attThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <FileText size={16} color={colors.accent} />
                      )}
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySmall" numberOfLines={1}>
                          {att.title}
                        </AppText>
                        <AppText variant="caption" color="tertiary" tabular>
                          {formatBytes(att.fileSizeBytes)}
                        </AppText>
                      </View>
                      <Pressable onPress={() => handleRemoveAttachment(att)} hitSlop={10}>
                        <X size={15} color={colors.textTertiary} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Backlinks */}
          {backlinks.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Divider />
              <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                Linked Mentions ({backlinks.length})
              </AppText>
              {backlinks.map((link) => (
                <Pressable
                  key={link.id}
                  onPress={() => router.push(`/notes/${link.linkedNoteId}`)}
                  style={styles.backlinkRow}
                >
                  <Link2 size={14} color={colors.accent} />
                  <AppText variant="bodySmall" color="accent" numberOfLines={1}>
                    {link.linkedNoteTitle}
                  </AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* Live [[Wikilink]] Autocomplete Bar while typing */}
        {mode === 'edit' && activeWikilinkQuery !== null && wikilinkSuggestions.length > 0 ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.suggestBar,
              { backgroundColor: colors.surfaceSubtle, borderTopColor: colors.border },
            ]}
          >
            {wikilinkSuggestions.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleCompleteWikilink(item.title)}
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
        ) : null}

        {/* Markdown & Media Toolbar in Edit Mode */}
        {mode === 'edit' ? (
          <MarkdownToolbar
            onApply={handleApplyFormat}
            onCapturePhoto={handleCapturePhoto}
            onAttachImage={handleAttachImage}
            onAttachFile={handleAttachFile}
          />
        ) : null}

        <Divider />

        {/* Quiet 3-Action Footer */}
        <View style={[styles.footerBar, { backgroundColor: colors.background }]}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(tabs)/mindmap',
                params: { focusNoteId: id },
              })
            }
            style={styles.footerAction}
          >
            <Orbit size={17} color={colors.textSecondary} strokeWidth={1.75} />
            <AppText variant="caption" color="secondary">
              Mind Map
            </AppText>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: '/flashcards/edit/[id]',
                params: {
                  id: 'new',
                  noteId: id,
                  prefillFront: title.trim() || 'Untitled',
                },
              })
            }
            style={styles.footerAction}
          >
            <Layers size={17} color={colors.textSecondary} strokeWidth={1.75} />
            <AppText variant="caption" color="secondary">
              Make Card
            </AppText>
          </Pressable>

          <Pressable onPress={handleDeleteNote} style={styles.footerAction}>
            <Trash2 size={17} color={colors.danger} strokeWidth={1.75} />
            <AppText variant="caption" color="danger">
              Delete
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    paddingVertical: 12,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  editorContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 36,
  },
  sectionBlock: {
    marginTop: 24,
    gap: 10,
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
  },
  attThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  backlinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  suggestBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  suggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
});
