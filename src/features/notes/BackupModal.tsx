import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { X } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { useAppStore } from '../../stores/useAppStore';
import { getDatabase } from '../../database/client';
import { loadAppSettings } from '../../database/repositories/settingsRepo';
import {
  createBackupZipBase64,
  exportLibraryAsMarkdown,
  restoreFromBackupZipBase64,
} from '../../services/backup/backupService';
import {
  expoAttachmentFileIO,
  writeExportFileAndShare,
} from '../../services/files/attachmentStorage';
import { AppText, Button } from '../../components/ui';

interface BackupModalProps {
  visible: boolean;
  onClose: () => void;
}

export function BackupModal({ visible, onClose }: BackupModalProps) {
  const { colors } = useTheme();
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const setSettings = useAppStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert('Operation failed', err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportZip = () =>
    run(async () => {
      const db = await getDatabase();
      const { base64 } = await createBackupZipBase64(db, expoAttachmentFileIO);
      const stamp = new Date().toISOString().slice(0, 10);
      await writeExportFileAndShare(`recall-backup-${stamp}.zip`, base64, {
        isBase64: true,
        mimeType: 'application/zip',
      });
    });

  const handleRestoreZip = () =>
    run(async () => {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets[0]) return;
      const b64 = await FileSystem.readAsStringAsync(res.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const db = await getDatabase();
      const outcome = await restoreFromBackupZipBase64(db, b64, expoAttachmentFileIO);
      setSettings(await loadAppSettings(db));
      bumpDataVersion();
      onClose();
      Alert.alert(
        'Backup restored',
        `Restored ${outcome.manifest.counts.notes} notes and ${outcome.manifest.counts.flashcards} cards.`
      );
    });

  const handleExportMd = () =>
    run(async () => {
      const db = await getDatabase();
      const md = await exportLibraryAsMarkdown(db);
      const stamp = new Date().toISOString().slice(0, 10);
      await writeExportFileAndShare(`recall-notes-${stamp}.md`, md, {
        mimeType: 'text/markdown',
      });
    });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <AppText variant="h2">Data & Backup</AppText>
          <Pressable onPress={onClose} hitSlop={10}>
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.body}>
          <AppText variant="bodySmall" color="secondary">
            Everything stays offline on your device. Export a full ZIP backup (notes, connections, flashcards, and media) or portable Markdown anytime.
          </AppText>
          <Button label="Export Full Backup (.zip)" onPress={handleExportZip} loading={busy} fullWidth />
          <Button label="Restore from Backup (.zip)" variant="secondary" onPress={handleRestoreZip} disabled={busy} fullWidth />
          <Button label="Export All Notes (.md)" variant="secondary" onPress={handleExportMd} disabled={busy} fullWidth />
        </View>
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
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 12,
  },
});
