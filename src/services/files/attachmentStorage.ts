import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { generateId } from '../../utils/id';
import type { AttachmentFileIO } from '../backup/backupService';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB safety limit

function getAttachmentsDir(): string {
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  return `${base}recall_attachments/`;
}

export async function ensureAttachmentsDirectory(): Promise<string> {
  const dir = getAttachmentsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/**
 * Copies an imported file (from DocumentPicker or ImagePicker cache) into
 * persistent app document storage so it is never evicted by the OS.
 */
export async function copyFileToPersistentStorage(
  sourceUri: string,
  originalFilename?: string | null
): Promise<{ localUri: string; fileSizeBytes: number }> {
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) {
    throw new Error('Selected file could not be read.');
  }

  const size = 'size' in sourceInfo && typeof sourceInfo.size === 'number' ? sourceInfo.size : 0;
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new Error('File exceeds the 50 MB limit.');
  }

  const dir = await ensureAttachmentsDirectory();
  const extFromName = originalFilename?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '');
  const extFromUri = sourceUri.split('.').pop()?.split('?')[0]?.replace(/[^a-zA-Z0-9]/g, '');
  const ext = (extFromName || extFromUri || 'bin').toLowerCase().slice(0, 10);

  const targetUri = `${dir}${generateId()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });

  const copiedInfo = await FileSystem.getInfoAsync(targetUri);
  const copiedSize =
    copiedInfo.exists && 'size' in copiedInfo && typeof copiedInfo.size === 'number'
      ? copiedInfo.size
      : size;

  return { localUri: targetUri, fileSizeBytes: copiedSize };
}

export async function deletePersistentFile(localUri: string | null | undefined): Promise<void> {
  if (!localUri) return;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    }
  } catch {
    // Ignore cleanup errors for missing files
  }
}

export async function shareLocalFile(localUri: string, mimeType?: string | null): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(localUri, {
    mimeType: mimeType ?? undefined,
  });
}

export async function writeExportFileAndShare(
  filename: string,
  content: string,
  options: { isBase64?: boolean; mimeType?: string } = {}
): Promise<string> {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const targetUri = `${base}${filename}`;
  await FileSystem.writeAsStringAsync(targetUri, content, {
    encoding: options.isBase64
      ? FileSystem.EncodingType.Base64
      : FileSystem.EncodingType.UTF8,
  });
  await shareLocalFile(targetUri, options.mimeType);
  return targetUri;
}

export const expoAttachmentFileIO: AttachmentFileIO = {
  async readFileBase64(uri: string): Promise<string | null> {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return null;
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      return null;
    }
  },
  async writeFileBase64(filename: string, base64: string): Promise<string> {
    const dir = await ensureAttachmentsDirectory();
    const targetUri = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(targetUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return targetUri;
  },
};
