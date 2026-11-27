import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { FileText, Link2, X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Attachment, NoteLinkDetail } from '../../types/models';
import { formatBytes } from '../../utils/id';
import { AppText, Divider } from '../../components/ui';

interface NoteAttachmentsAndBacklinksProps {
  content: string;
  attachments: Attachment[];
  backlinks: NoteLinkDetail[];
  onOpenFile: (uri: string) => void;
  onRemoveAttachment: (att: Attachment) => void;
  onOpenNote: (noteId: string) => void;
}

export function NoteAttachmentsAndBacklinks({
  content,
  attachments,
  backlinks,
  onOpenFile,
  onRemoveAttachment,
  onOpenNote,
}: NoteAttachmentsAndBacklinksProps) {
  const { colors, radius } = useTheme();
  const lowerContent = content.toLowerCase();

  // Only show attachments here that are NOT already embedded inline in the note
  const unembeddedAttachments = attachments.filter((att) => {
    const hasWikiEmbed = lowerContent.includes(`![[${att.title.toLowerCase()}]]`);
    const hasLegacyUri = att.localUri ? content.includes(att.localUri) : false;
    return !hasWikiEmbed && !hasLegacyUri;
  });

  return (
    <>
      {unembeddedAttachments.length > 0 ? (
        <View style={styles.section}>
          <Divider />
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            Attached Files ({unembeddedAttachments.length})
          </AppText>
          <View style={{ gap: 8 }}>
            {unembeddedAttachments.map((att) => {
              const isImg =
                att.fileType === 'image' || (att.mimeType ?? '').startsWith('image/');
              return (
                <Pressable
                  key={att.id}
                  onPress={() => att.localUri && onOpenFile(att.localUri)}
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
                    <Image source={{ uri: att.localUri }} style={styles.thumb} resizeMode="cover" />
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
                  <Pressable onPress={() => onRemoveAttachment(att)} hitSlop={10}>
                    <X size={15} color={colors.textTertiary} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {backlinks.length > 0 ? (
        <View style={styles.section}>
          <Divider />
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            Linked Mentions ({backlinks.length})
          </AppText>
          {backlinks.map((link) => (
            <Pressable
              key={link.id}
              onPress={() => onOpenNote(link.linkedNoteId)}
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
    </>
  );
}

const styles = StyleSheet.create({
  section: {
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
  thumb: {
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
});
