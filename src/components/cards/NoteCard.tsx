import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pin, Star } from 'lucide-react-native';
import { NOTE_TYPE_LABELS, type Note } from '../../types/models';
import { useTheme } from '../../theme/ThemeProvider';
import { formatRelativeDate } from '../../utils/id';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Primitives';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  compact?: boolean;
}

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  compact = false,
}: NoteCardProps) {
  const { colors } = useTheme();
  const preview = note.content
    .replace(/[#>*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.metaRow}>
          <AppText variant="caption" color="accent" style={{ fontWeight: '600' }}>
            {NOTE_TYPE_LABELS[note.noteType]}
          </AppText>
          {note.collectionName ? (
            <AppText variant="caption" color="tertiary" numberOfLines={1}>
              · {note.collectionName}
            </AppText>
          ) : note.isInbox ? (
            <AppText variant="caption" color="warning">
              · Inbox
            </AppText>
          ) : null}
        </View>
        <View style={styles.iconsRow}>
          {note.isPinned ? <Pin size={13} color={colors.accent} /> : null}
          {note.isFavorite ? <Star size={13} color={colors.warning} /> : null}
          <AppText variant="caption" color="tertiary" tabular>
            {formatRelativeDate(note.updatedAt)}
          </AppText>
        </View>
      </View>

      <AppText variant="h3" numberOfLines={compact ? 1 : 2}>
        {note.title}
      </AppText>

      {!compact && preview.length > 0 ? (
        <AppText variant="bodySmall" color="secondary" numberOfLines={2}>
          {preview}
        </AppText>
      ) : null}

      {!compact && note.tags && note.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {note.tags.slice(0, 4).map((tag) => (
            <AppText key={tag.id} variant="caption" color="tertiary">
              #{tag.name}
            </AppText>
          ))}
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  iconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
});
