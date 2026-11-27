import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Note, NoteLinkDetail } from '../../types/models';
import { AppText, Button, Chip, Divider, Input } from '../../components/ui';

interface BranchModalProps {
  visible: boolean;
  focusTitle: string;
  linkableNotes: Note[];
  currentConnections: NoteLinkDetail[];
  saving: boolean;
  onClose: () => void;
  onCreateBranch: (title: string) => Promise<void>;
  onLinkExisting: (targetNoteId: string) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}

export function MindMapBranchModal({
  visible,
  focusTitle,
  linkableNotes,
  currentConnections,
  saving,
  onClose,
  onCreateBranch,
  onLinkExisting,
  onUnlink,
}: BranchModalProps) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'create' | 'link' | 'connected'>('create');
  const [title, setTitle] = useState('');

  const handleSubmit = async () => {
    await onCreateBranch(title);
    setTitle('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <AppText variant="h2" numberOfLines={1} style={{ flex: 1 }}>
            Branch from {focusTitle}
          </AppText>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="New Note" selected={mode === 'create'} onPress={() => setMode('create')} />
            <Chip label="Link Existing" selected={mode === 'link'} onPress={() => setMode('link')} />
            {currentConnections.length > 0 ? (
              <Chip
                label={`Linked (${currentConnections.length})`}
                selected={mode === 'connected'}
                onPress={() => setMode('connected')}
              />
            ) : null}
          </View>
          {mode === 'create' ? (
            <View style={{ gap: 14 }}>
              <Input
                label="Note Title"
                placeholder="Enter idea or subtopic…"
                value={title}
                onChangeText={setTitle}
              />
              <Button label="Add to Orbit" onPress={handleSubmit} loading={saving} fullWidth />
            </View>
          ) : mode === 'connected' ? (
            <View>
              {currentConnections.map((conn, i) => (
                <View key={conn.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.linkedRow}>
                    <AppText variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {conn.linkedNoteTitle}
                    </AppText>
                    <Pressable
                      accessibilityLabel={`Unlink ${conn.linkedNoteTitle}`}
                      onPress={() => void onUnlink(conn.id)}
                      hitSlop={10}
                    >
                      <AppText variant="caption" color="danger" style={{ fontWeight: '600' }}>
                        Unlink
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : linkableNotes.length === 0 ? (
            <AppText variant="bodySmall" color="secondary">
              No other unlinked notes yet. Create a new note instead.
            </AppText>
          ) : (
            <View>
              {linkableNotes.map((cand, i) => (
                <View key={cand.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => onLinkExisting(cand.id)} style={{ paddingVertical: 14 }}>
                    <AppText variant="body">{cand.title}</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface FocusPickerModalProps {
  visible: boolean;
  currentFocusId: string;
  notes: Note[];
  onClose: () => void;
  onSelect: (noteId: string) => void;
}

export function MindMapFocusPickerModal({
  visible,
  currentFocusId,
  notes,
  onClose,
  onSelect,
}: FocusPickerModalProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <AppText variant="h2">Choose Center Note</AppText>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
          {notes.map((n, i) => (
            <View key={n.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => onSelect(n.id)} style={{ paddingVertical: 14 }}>
                <AppText
                  variant="body"
                  color={n.id === currentFocusId ? 'accent' : 'primary'}
                  style={n.id === currentFocusId ? { fontWeight: '600' } : undefined}
                >
                  {n.title}
                </AppText>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    gap: 12,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
});
