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
import { AppText } from '../../../src/components/ui/AppText';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Primitives';

export default function FlashcardEditScreen() {
  const params = useLocalSearchParams<{
    id: string;
    noteId?: string;
    prefillFront?: string;
  }>();
  const isNew = !params.id || params.id === 'new';
  const router = useRouter();
  const { colors } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

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

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) {
      Alert.alert('Missing fields', 'Enter both a question and an answer.');
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      if (isNew) {
        await createFlashcard(db, {
          front,
          back,
          cardType: 'basic',
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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={1.75} />
        </Pressable>
        <AppText variant="h2">{isNew ? 'New Card' : 'Edit Card'}</AppText>
        {!isNew ? (
          <Pressable onPress={handleDelete} hitSlop={12}>
            <Trash2 size={19} color={colors.danger} strokeWidth={1.75} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            label="Front (Question)"
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
          <Button
            label={isNew ? 'Save Card' : 'Update Card'}
            onPress={handleSave}
            loading={saving}
            fullWidth
            style={{ marginTop: 8 }}
          />
        </ScrollView>
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
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 18,
  },
});
