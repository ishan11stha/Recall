import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { ArrowUp, Compass, ExternalLink, Plus } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppStore } from '../../stores/useAppStore';
import { getDatabase } from '../../database/client';
import { createNote, getNoteById, listNotes } from '../../database/repositories/notesRepo';
import {
  createNoteLink,
  deleteNoteLink,
  getConnectionsForNote,
  type NoteLinkWithDegree,
} from '../../database/repositories/linksRepo';
import type { Note } from '../../types/models';
import { AppText, Button, EmptyState } from '../../components/ui';
import { MindMapBranchModal, MindMapFocusPickerModal } from './MindMapModals';

const MAP_SIZE = Math.min(Dimensions.get('window').width - 44, 360);
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

export function OrbitalMindMap({ focusNoteId, onChangeFocus, onOpenNote }: OrbitalMindMapProps) {
  const { colors, radius } = useTheme();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);

  const [focusNote, setFocusNote] = useState<Note | null>(null);
  const [connections, setConnections] = useState<NoteLinkWithDegree[]>([]);
  const [parentStack, setParentStack] = useState<{ id: string; title: string }[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFocus = useCallback(async () => {
    const db = await getDatabase();
    const notesList = await listNotes(db, { limit: 100 });
    setAllNotes(notesList);

    const activeIds = new Set(notesList.map((n) => n.id));
    const validFocusId = focusNoteId && activeIds.has(focusNoteId) ? focusNoteId : null;
    const targetId = validFocusId ?? notesList[0]?.id ?? null;

    if (!validFocusId) {
      setParentStack([]);
    }

    if (!targetId) {
      setFocusNote(null);
      setConnections([]);
      return;
    }

    const [note, conns] = await Promise.all([
      getNoteById(db, targetId),
      getConnectionsForNote(db, targetId),
    ]);
    if (!note || note.deletedAt) {
      setFocusNote(null);
      setConnections([]);
      return;
    }
    setFocusNote(note);

    const seen = new Set<string>();
    const merged: NoteLinkWithDegree[] = [];
    for (const item of [...conns.outgoing, ...conns.backlinks]) {
      if (seen.has(item.linkedNoteId)) continue;
      seen.add(item.linkedNoteId);
      merged.push(item);
    }
    setConnections(merged);
  }, [focusNoteId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadFocus());
  }, [loadFocus, dataVersion]);

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

  const handleCreateBranch = async (rawTitle: string) => {
    if (!focusNote) return;
    if (!rawTitle.trim()) {
      Alert.alert('Title required', 'Enter a title for the connected note.');
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      const child = await createNote(db, { title: rawTitle.trim(), content: '', isInbox: false });
      await createNoteLink(db, { sourceNoteId: focusNote.id, targetNoteId: child.id, relationshipType: 'related_to' });
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
    await createNoteLink(db, { sourceNoteId: focusNote.id, targetNoteId, relationshipType: 'related_to' });
    setBranchModalOpen(false);
    bumpDataVersion();
    await loadFocus();
  };

  const handleUnlink = async (linkId: string) => {
    const db = await getDatabase();
    await deleteNoteLink(db, linkId);
    bumpDataVersion();
    await loadFocus();
  };

  const handleCreateFirstNote = async () => {
    const db = await getDatabase();
    const created = await createNote(db, { title: 'Untitled', content: '', isInbox: false });
    bumpDataVersion();
    onChangeFocus(created.id);
    onOpenNote(created.id);
  };

  const visibleConnections = connections.slice(0, 6);
  const addSlotAngles: number[] = useMemo(() => {
    const count = visibleConnections.length;
    if (count === 0) return [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    const maxButtons = Math.min(3, Math.max(1, 6 - count));
    const step = (2 * Math.PI) / count;
    return Array.from({ length: maxButtons }, (_, i) => -Math.PI / 2 + i * step + step / 2);
  }, [visibleConnections.length]);

  if (!focusNote) {
    return (
      <View style={{ paddingTop: 40 }}>
        <EmptyState
          title="No notes to map yet"
          description="Create your first note to start building your orbital mind map."
          actionLabel="New Note"
          onAction={handleCreateFirstNote}
        />
      </View>
    );
  }

  const parentNode = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
  const centerLines = wrapLabel(focusNote.title, 11);
  const existingNeighborIds = new Set(connections.map((c) => c.linkedNoteId));
  const linkableNotes = allNotes.filter((n) => n.id !== focusNote.id && !existingNeighborIds.has(n.id));

  return (
    <View style={styles.container}>
      {parentNode ? (
        <Pressable
          onPress={handleStepUp}
          style={[styles.parentPill, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.full }]}
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

      <View style={styles.orbitWrap}>
        <Svg width={MAP_SIZE} height={MAP_SIZE}>
          {parentNode ? (
            <Line x1={CENTER_X} y1={0} x2={CENTER_X} y2={CENTER_Y - CENTER_NODE_R} stroke={colors.borderStrong} strokeWidth={1.25} />
          ) : null}

          <Circle cx={CENTER_X} cy={CENTER_Y} r={ORBIT_R} fill="none" stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4,5" />

          {/* Whisper-thin radial spokes connecting center to orbiting notes */}
          {visibleConnections.map((conn, idx) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * idx) / Math.max(1, visibleConnections.length);
            const x = CENTER_X + ORBIT_R * Math.cos(angle);
            const y = CENTER_Y + ORBIT_R * Math.sin(angle);
            return (
              <Line
                key={`spoke-${conn.id}`}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={x}
                y2={y}
                stroke={colors.borderStrong}
                strokeWidth={1}
                opacity={0.35}
              />
            );
          })}

          {visibleConnections.map((conn, idx) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * idx) / Math.max(1, visibleConnections.length);
            const x = CENTER_X + ORBIT_R * Math.cos(angle);
            const y = CENTER_Y + ORBIT_R * Math.sin(angle);
            const lines = wrapLabel(conn.linkedNoteTitle, 9);
            return (
              <G key={conn.id} onPress={() => handleDrillDown(conn.linkedNoteId)}>
                {conn.linkedDegree > 0 ? (
                  <Circle cx={x} cy={y} r={CHILD_NODE_R + 4} fill="none" stroke={colors.accent} strokeWidth={1} strokeDasharray="2,3" opacity={0.75} />
                ) : null}
                <Circle cx={x} cy={y} r={CHILD_NODE_R} fill={colors.surface} stroke={colors.borderStrong} strokeWidth={1.25} />
                {lines.map((line, li) => (
                  <SvgText key={li} x={x} y={y + (lines.length === 1 ? 4 : li === 0 ? -2 : 11)} fontSize={10.5} fontWeight="500" fill={colors.textPrimary} textAnchor="middle">
                    {line}
                  </SvgText>
                ))}
              </G>
            );
          })}

          {addSlotAngles.map((angle, idx) => {
            const x = CENTER_X + ORBIT_R * Math.cos(angle);
            const y = CENTER_Y + ORBIT_R * Math.sin(angle);
            return (
              <G key={`add-${idx}`} onPress={() => setBranchModalOpen(true)}>
                <Circle cx={x} cy={y} r={ADD_NODE_R} fill={colors.background} stroke={colors.borderStrong} strokeWidth={1.25} />
                <SvgText x={x} y={y + 4.5} fontSize={15} fontWeight="600" fill={colors.textSecondary} textAnchor="middle">+</SvgText>
              </G>
            );
          })}

          <G onPress={() => onOpenNote(focusNote.id)}>
            <Circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_NODE_R + 7} fill="none" stroke={colors.accent} strokeWidth={1.25} opacity={0.28} />
            <Circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_NODE_R} fill={colors.accent} />
            {centerLines.map((line, li) => (
              <SvgText key={li} x={CENTER_X} y={CENTER_Y + (centerLines.length === 1 ? 4 : li === 0 ? -3 : 12)} fontSize={12.5} fontWeight="600" fill={colors.accentText} textAnchor="middle">
                {line}
              </SvgText>
            ))}
          </G>
        </Svg>
      </View>

      <View style={styles.bottomBar}>
        <Button label="Switch" variant="secondary" icon={<Compass size={15} color={colors.textPrimary} />} onPress={() => setFocusPickerOpen(true)} />
        <Button label="Branch" variant="secondary" icon={<Plus size={15} color={colors.textPrimary} />} onPress={() => setBranchModalOpen(true)} style={{ flex: 1 }} />
        <Button label="Open" icon={<ExternalLink size={15} color={colors.accentText} />} onPress={() => onOpenNote(focusNote.id)} style={{ flex: 1 }} />
      </View>

      <MindMapBranchModal
        visible={branchModalOpen}
        focusTitle={focusNote.title}
        linkableNotes={linkableNotes}
        currentConnections={connections}
        saving={saving}
        onClose={() => setBranchModalOpen(false)}
        onCreateBranch={handleCreateBranch}
        onLinkExisting={handleLinkExisting}
        onUnlink={handleUnlink}
      />

      <MindMapFocusPickerModal
        visible={focusPickerOpen}
        currentFocusId={focusNote.id}
        notes={allNotes}
        onClose={() => setFocusPickerOpen(false)}
        onSelect={(noteId) => {
          setParentStack([]);
          onChangeFocus(noteId);
          setFocusPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', gap: 12 },
  parentPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  orbitWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { flexDirection: 'row', gap: 10 },
});
