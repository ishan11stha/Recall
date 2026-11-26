import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Layers, Orbit, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import {
  getNoteById,
  softDeleteNote,
  touchNoteAccess,
  updateNote,
} from '../../src/database/repositories/notesRepo';
import { AppText } from '../../src/components/ui/AppText';
import { Divider } from '../../src/components/ui/Primitives';

export default function NoteDetailEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, fonts, fontScale } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const isFirstLoad = useRef(true);

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
      }
      setLoaded(true);
      setTimeout(() => {
        isFirstLoad.current = false;
      }, 100);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Quiet debounced autosave
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
        bumpDataVersion();
      } finally {
        setSaveStatus('saved');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [id, loaded, title, content, bumpDataVersion]);

  const handleBack = async () => {
    if (id && loaded) {
      const db = await getDatabase();
      await updateNote(db, id, {
        title: title.trim() || 'Untitled',
        content,
      });
      bumpDataVersion();
    }
    router.back();
  };

  const handleDelete = () => {
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Quiet Top Bar */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="caption" color="tertiary">
          {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
        </AppText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.editorContent}
          keyboardShouldPersistTaps="handled"
        >
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
            placeholder="Write your thoughts…"
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 360,
              fontFamily: fonts.sansRegular,
              fontSize: Math.round(16 * fontScale),
              lineHeight: Math.round(25 * fontScale),
              color: colors.textPrimary,
              marginTop: 12,
            }}
          />
        </ScrollView>

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

          <Pressable onPress={handleDelete} style={styles.footerAction}>
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
    paddingVertical: 14,
  },
  editorContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 40,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  footerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
