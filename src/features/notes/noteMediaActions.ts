import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabase } from '../../database/client';
import { createAttachment, deleteAttachment } from '../../database/repositories/attachmentsRepo';
import {
  copyFileToPersistentStorage,
  deletePersistentFile,
} from '../../services/files/attachmentStorage';
import type { Attachment } from '../../types/models';

export async function pickAndAttachPhoto(
  noteId: string,
  source: 'camera' | 'library'
): Promise<string | null> {
  try {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to capture photos into your note.'
          : 'Allow photo library access to insert images.'
      );
      return null;
    }

    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });

    if (res.canceled || !res.assets[0]) return null;
    const asset = res.assets[0];
    const fallbackName = source === 'camera' ? 'photo.jpg' : 'image.jpg';
    const stored = await copyFileToPersistentStorage(asset.uri, asset.fileName ?? fallbackName);
    const label = asset.fileName ?? (source === 'camera' ? 'photo.jpg' : 'image.jpg');
    const db = await getDatabase();
    await createAttachment(db, {
      title: label,
      fileType: 'image',
      mimeType: asset.mimeType ?? 'image/jpeg',
      localUri: stored.localUri,
      fileSizeBytes: stored.fileSizeBytes,
      linkedNoteIds: [noteId],
    });
    return `![[${label}]]`;
  } catch (err) {
    Alert.alert('Media Error', err instanceof Error ? err.message : 'Could not attach image.');
    return null;
  }
}

export async function pickAndAttachFile(noteId: string): Promise<string | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets[0]) return null;
    const asset = res.assets[0];
    const stored = await copyFileToPersistentStorage(asset.uri, asset.name);
    const isPdf =
      (asset.mimeType ?? '').includes('pdf') || asset.name.toLowerCase().endsWith('.pdf');
    const db = await getDatabase();
    await createAttachment(db, {
      title: asset.name,
      fileType: isPdf ? 'pdf' : 'research_document',
      mimeType: asset.mimeType ?? 'application/octet-stream',
      localUri: stored.localUri,
      fileSizeBytes: stored.fileSizeBytes,
      linkedNoteIds: [noteId],
    });
    return `![[${asset.name}]]`;
  } catch (err) {
    Alert.alert('Attachment Error', err instanceof Error ? err.message : 'Could not attach file.');
    return null;
  }
}

export async function removeNoteAttachment(att: Attachment): Promise<void> {
  const db = await getDatabase();
  await deleteAttachment(db, att.id);
  if (att.localUri) {
    await deletePersistentFile(att.localUri);
  }
}
