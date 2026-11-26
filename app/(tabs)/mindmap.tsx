import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import { listNotes } from '../../src/database/repositories/notesRepo';
import { OrbitalMindMap } from '../../src/features/connections/OrbitalMindMap';
import { AppText } from '../../src/components/ui/AppText';

export default function MindMapTabScreen() {
  const params = useLocalSearchParams<{ focusNoteId?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const dataVersion = useAppStore((s) => s.dataVersion);

  const [focusNoteId, setFocusNoteId] = useState<string | null>(
    params.focusNoteId ?? null
  );
  const [lastParamFocus, setLastParamFocus] = useState<string | undefined>(
    params.focusNoteId
  );

  if (params.focusNoteId !== lastParamFocus) {
    setLastParamFocus(params.focusNoteId);
    if (params.focusNoteId) {
      setFocusNoteId(params.focusNoteId);
    }
  }

  const ensureFocus = useCallback(async () => {
    if (focusNoteId) return;
    const db = await getDatabase();
    const notes = await listNotes(db, { limit: 1 });
    if (notes.length > 0) {
      setFocusNoteId(notes[0].id);
    }
  }, [focusNoteId]);

  useFocusEffect(
    useCallback(() => {
      void ensureFocus();
    }, [ensureFocus])
  );

  useEffect(() => {
    if (dataVersion > 0) {
      void Promise.resolve().then(() => ensureFocus());
    }
  }, [dataVersion, ensureFocus]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">Mind Map</AppText>
      </View>

      <View style={styles.body}>
        <OrbitalMindMap
          focusNoteId={focusNoteId}
          onChangeFocus={(nextId) => setFocusNoteId(nextId)}
          onOpenNote={(noteId) => router.push(`/notes/${noteId}`)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  body: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
});
