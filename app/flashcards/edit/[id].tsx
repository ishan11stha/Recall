import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { useAppStore } from '../../../src/stores/useAppStore';
import { getDatabase } from '../../../src/database/client';
import {
  createFlashcard,
  deleteFlashcard,
  getFlashcardById,
  updateFlashcard,
} from '../../../src/database/repositories/flashcardsRepo';
import { ParagraphClozeBuilder } from '../../../src/features/flashcards/ParagraphClozeBuilder';
import { AppText, Button, Chip, Input } from '../../../src/components/ui';

export default function FlashcardEditScreen() {
  const params = useLocalSearchParams<{
    id: string;
    noteId?: string;
    prefillFront?: string;
    prefillParagraph?: string;
    mode?: string;
  }>();
  const isNew = !params.id || params.id === 'new';
  const router = useRouter();
  const { colors } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const initialMode: 'single' | 'paragraph' =
    isNew && params.mode !== 'single' ? 'paragraph' : 'single';

  const [createMode, setCreateMode] = useState<'single' | 'paragraph'>(initialMode);
  const [front, setFront] = useState(params.prefillFront ?? '');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !params.id) return;
    (async () => {
      const db = await getDatabase();
      const card = await getFlashcardById(db, params.id);
      if (card) {
        setFront(card.front);
        setBack(card.back);
      }
    })();
  }, [isNew, params.id]);

  const handleSaveSingle = async () => {
    if (!front.trim() || !back.trim()) {
      Alert.alert('Missing fields', 'Enter both a question and an answer.');
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      const isCloze = /\{\{[^}]+\}\}/.test(front);
      if (isNew) {
        await createFlashcard(db, {
          front,
          back,
          cardType: isCloze ? 'cloze' : 'basic',
          noteId: params.noteId || null,
        });
      } else if (params.id) {
        await updateFlashcard(db, params.id, { front, back });
      }
      bumpDataVersion();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBatch = async (cards: { front: string; back: string }[]) => {
    setSaving(true);
    try {
      const db = await getDatabase();
      for (const item of cards) {
        await createFlashcard(db, {
          front: item.front,
          back: item.back,
          cardType: 'cloze',
          noteId: params.noteId || null,
        });
      }
      bumpDataVersion();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (isNew || !params.id) return;
    Alert.alert('Delete card?', 'This flashcard will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = await getDatabase();
          await deleteFlashcard(db, params.id);
          bumpDataVersion();
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="h2">{isNew ? 'New Cards' : 'Edit Card'}</AppText>
        {!isNew ? (
          <Pressable onPress={handleDelete} hitSlop={12}>
            <Trash2 size={19} color={colors.danger} strokeWidth={1.75} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isNew ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="From Paragraph" selected={createMode === 'paragraph'} onPress={() => setCreateMode('paragraph')} />
              <Chip label="Single Card" selected={createMode === 'single'} onPress={() => setCreateMode('single')} />
            </View>
          ) : null}

          {createMode === 'paragraph' && isNew ? (
            <ParagraphClozeBuilder
              initialParagraph={params.prefillParagraph}
              saving={saving}
              onSaveCards={handleSaveBatch}
            />
          ) : (
            <View style={{ gap: 16 }}>
              <Input
                label="Front (Question or {{blank}})"
                value={front}
                onChangeText={setFront}
                placeholder="What do you want to remember?"
                multiline
                textAlignVertical="top"
                style={{ minHeight: 110 }}
              />
              <Input
                label="Back (Answer)"
                value={back}
                onChangeText={setBack}
                placeholder="Write the answer…"
                multiline
                textAlignVertical="top"
                style={{ minHeight: 130 }}
              />
              <Button label={isNew ? 'Save Card' : 'Update Card'} onPress={handleSaveSingle} loading={saving} fullWidth />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 40, gap: 16 },
});
