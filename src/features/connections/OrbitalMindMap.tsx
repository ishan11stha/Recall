import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { ArrowUp, ExternalLink, Plus, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppStore } from '../../stores/useAppStore';
import { getDatabase } from '../../database/client';
import {
  createNote,
  getNoteById,
  listNotes,
} from '../../database/repositories/notesRepo';
import {
  createNoteLink,
  getConnectionsForNote,
} from '../../database/repositories/linksRepo';
import type { Note, NoteLinkDetail } from '../../types/models';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { Chip, Divider, EmptyState, Input } from '../../components/ui/Primitives';

const SCREEN_W = Dimensions.get('window').width;
const MAP_SIZE = Math.min(SCREEN_W - 44, 360);
const CENTER_X = MAP_SIZE / 2;
const CENTER_Y = MAP_SIZE / 2 + 10;
const ORBIT_R = MAP_SIZE * 0.34;
const CENTER_NODE_R = 46;
const CHILD_NODE_R = 32;
const ADD_NODE_R = 13;

interface OrbitalMindMapProps {
  focusNoteId: string | null;
  onChangeFocus: (noteId: string) => void;
  onOpenNote: (noteId: string) => void;
}

function wrapLabel(text: string, maxChars = 11): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxChars) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w.slice(0, maxChars);
      if (lines.length === 1) break;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  if (lines.length === 2 && clean.length > lines.join(' ').length) {
    lines[1] = `${lines[1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

export function OrbitalMindMap({
  focusNoteId,
  onChangeFocus,
  onOpenNote,
}: OrbitalMindMapProps) {
  const { colors, radius } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const [focusNote, setFocusNote] = useState<Note | null>(null);
  const [connections, setConnections] = useState<NoteLinkDetail[]>([]);
  const [parentStack, setParentStack] = useState<{ id: string; title: string }[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchMode, setBranchMode] = useState<'create' | 'link'>('create');
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFocus = useCallback(async () => {
    const db = await getDatabase();
    const notesList = await listNotes(db, { limit: 100 });
    setAllNotes(notesList);

    const targetId = focusNoteId ?? notesList[0]?.id ?? null;
    if (!targetId) {
      setFocusNote(null);
      setConnections([]);
      return;
    }

    const [note, conns] = await Promise.all([
      getNoteById(db, targetId),
      getConnectionsForNote(db, targetId),
    ]);
    setFocusNote(note);

    const seen = new Set<string>();
    const merged: NoteLinkDetail[] = [];
    for (const item of [...conns.outgoing, ...conns.backlinks]) {
      if (seen.has(item.linkedNoteId)) continue;
      seen.add(item.linkedNoteId);
      merged.push(item);
    }
    setConnections(merged);
  }, [focusNoteId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadFocus());
  }, [loadFocus]);

  const handleDrillDown = (targetNoteId: string) => {
    if (!focusNote || targetNoteId === focusNote.id) return;
    Haptics.selectionAsync().catch(() => {});
    setParentStack((prev) => [...prev, { id: focusNote.id, title: focusNote.title }]);
    onChangeFocus(targetNoteId);
  };

  const handleStepUp = () => {
    if (parentStack.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    const parent = parentStack[parentStack.length - 1];
    setParentStack((prev) => prev.slice(0, -1));
    onChangeFocus(parent.id);
  };

  const handleCreateBranch = async () => {
    if (!focusNote) return;
    if (!newTitle.trim()) {
      Alert.alert('Title required', 'Enter a title for the connected note.');
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      const child = await createNote(db, {
        title: newTitle.trim(),
        content: '',
        isInbox: false,
      });
      await createNoteLink(db, {
        sourceNoteId: focusNote.id,
        targetNoteId: child.id,
        relationshipType: 'related_to',
      });
      setNewTitle('');
      setBranchModalOpen(false);
      bumpDataVersion();
      await loadFocus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const handleLinkExisting = async (targetNoteId: string) => {
    if (!focusNote) return;
    const db = await getDatabase();
    await createNoteLink(db, {
      sourceNoteId: focusNote.id,
      targetNoteId,
      relationshipType: 'related_to',
    });
    setBranchModalOpen(false);
    bumpDataVersion();
    await loadFocus();
  };

  const visibleConnections = connections.slice(0, 6);
  const slotCount = visibleConnections.length;

  const addSlotAngles: number[] = useMemo(() => {
    if (slotCount === 0) {
      return [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    }
    const angles: number[] = [];
    const maxButtons = Math.min(3, Math.max(1, 6 - slotCount));
    const step = (2 * Math.PI) / slotCount;
    for (let i = 0; i < maxButtons; i += 1) {
      angles.push(-Math.PI / 2 + i * step + step / 2);
    }
    return angles;
  }, [slotCount]);

  if (!focusNote) {
    return (
      <View style={{ paddingTop: 40 }}>
        <EmptyState
          title="No notes to map yet"
          description="Create your first note in Notes, then connect ideas visually here."
        />
      </View>
    );
  }

  const parentNode = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
  const centerLines = wrapLabel(focusNote.title, 11);
  const existingNeighborIds = new Set(connections.map((c) => c.linkedNoteId));
  const linkableNotes = allNotes.filter(
    (n) => n.id !== focusNote.id && !existingNeighborIds.has(n.id)
  );

  return (
    <View style={styles.container}>
      {/* Parent Breadcrumb or Quiet Hint */}
      {parentNode ? (
        <Pressable
          onPress={handleStepUp}
          style={[
            styles.parentPill,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full },
          ]}
        >
          <ArrowUp size={14} color={colors.accent} />
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {parentNode.title}
          </AppText>
        </Pressable>
      ) : (
        <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          Tap an orbiting note to focus · Tap + to add a branch
        </AppText>
      )}

      {/* Minimalist Monochrome + Single-Accent Orbital Canvas */}
      <View style={styles.orbitWrap}>
        <Svg width={MAP_SIZE} height={MAP_SIZE}>
          {parentNode ? (
            <Line
              x1={CENTER_X}
              y1={0}
              x2={CENTER_X}
              y2={CENTER_Y - CENTER_NODE_R}
              stroke={colors.borderStrong}
              strokeWidth={1.25}
            />
          ) : null}

          <Circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={ORBIT_R}
            fill="none"
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="4,5"
          />

          {/* Orbiting Notes (Monochrome Surface + Crisp Hairline) */}
          {visibleConnections.map((conn, idx) => {
            const angle =
              -Math.PI / 2 + (2 * Math.PI * idx) / Math.max(1, visibleConnections.length);
            const x = CENTER_X + ORBIT_R * Math.cos(angle);
            const y = CENTER_Y + ORBIT_R * Math.sin(angle);
            const lines = wrapLabel(conn.linkedNoteTitle, 9);

            return (
              <G key={conn.id} onPress={() => handleDrillDown(conn.linkedNoteId)}>
                <Circle
                  cx={x}
                  cy={y}
                  r={CHILD_NODE_R}
                  fill={colors.surface}
                  stroke={colors.borderStrong}
                  strokeWidth={1.25}
                />
                {lines.map((line, li) => (
                  <SvgText
                    key={li}
                    x={x}
                    y={y + (lines.length === 1 ? 4 : li === 0 ? -2 : 11)}
                    fontSize={10.5}
                    fontWeight="500"
                    fill={colors.textPrimary}
                    textAnchor="middle"
                  >
                    {line}
                  </SvgText>
                ))}
              </G>
            );
          })}

          {/* `+` Quick-Add Nodes on Orbit */}
          {addSlotAngles.map((angle, idx) => {
            const x = CENTER_X + ORBIT_R * Math.cos(angle);
            const y = CENTER_Y + ORBIT_R * Math.sin(angle);
            return (
              <G
                key={`add-${idx}`}
                onPress={() => {
                  setBranchMode('create');
                  setBranchModalOpen(true);
                }}
              >
                <Circle
                  cx={x}
                  cy={y}
                  r={ADD_NODE_R}
                  fill={colors.background}
                  stroke={colors.borderStrong}
                  strokeWidth={1.25}
                />
                <SvgText
                  x={x}
                  y={y + 4.5}
                  fontSize={15}
                  fontWeight="600"
                  fill={colors.textSecondary}
                  textAnchor="middle"
                >
                  +
                </SvgText>
              </G>
            );
          })}

          {/* Central Focal Node (The One Subtle Accent) */}
          <G onPress={() => onOpenNote(focusNote.id)}>
            <Circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={CENTER_NODE_R}
              fill={colors.accent}
            />
            {centerLines.map((line, li) => (
              <SvgText
                key={li}
                x={CENTER_X}
                y={CENTER_Y + (centerLines.length === 1 ? 4 : li === 0 ? -3 : 12)}
                fontSize={12.5}
                fontWeight="600"
                fill={colors.accentText}
                textAnchor="middle"
              >
                {line}
              </SvgText>
            ))}
          </G>
        </Svg>
      </View>

      {/* Quiet Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <Button
          label="Add Branch"
          variant="secondary"
          icon={<Plus size={15} color={colors.textPrimary} />}
          onPress={() => {
            setBranchMode('create');
            setBranchModalOpen(true);
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="Open Note"
          icon={<ExternalLink size={15} color={colors.accentText} />}
          onPress={() => onOpenNote(focusNote.id)}
          style={{ flex: 1 }}
        />
      </View>

      {/* Minimal Add / Link Branch Sheet */}
      <Modal visible={branchModalOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <AppText variant="h2" numberOfLines={1} style={{ flex: 1 }}>
              Branch from {focusNote.title}
            </AppText>
            <Pressable onPress={() => setBranchModalOpen(false)} hitSlop={10}>
              <X size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip
                label="New Note"
                selected={branchMode === 'create'}
                onPress={() => setBranchMode('create')}
              />
              <Chip
                label="Link Existing"
                selected={branchMode === 'link'}
                onPress={() => setBranchMode('link')}
              />
            </View>

            {branchMode === 'create' ? (
              <View style={{ gap: 14 }}>
                <Input
                  label="Note Title"
                  placeholder="Enter idea or subtopic…"
                  value={newTitle}
                  onChangeText={setNewTitle}
                />
                <Button
                  label="Add to Orbit"
                  onPress={handleCreateBranch}
                  loading={saving}
                  fullWidth
                />
              </View>
            ) : (
              <View>
                {linkableNotes.length === 0 ? (
                  <AppText variant="bodySmall" color="secondary">
                    No other unlinked notes yet. Create a new note instead.
                  </AppText>
                ) : (
                  linkableNotes.map((cand, i) => (
                    <View key={cand.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable
                        onPress={() => handleLinkExisting(cand.id)}
                        style={{ paddingVertical: 14 }}
                      >
                        <AppText variant="body">{cand.title}</AppText>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  parentPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
  },
  orbitWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    gap: 12,
  },
});
