import { create } from 'zustand';
import type { CaptureKind } from '../types/models';

export interface CaptureDraft {
  kind: CaptureKind;
  title: string;
  content: string;
  sourceUrl: string;
  tagsInput: string;
  attachmentLocalUri: string | null;
  attachmentTitle: string | null;
  attachmentMimeType: string | null;
  attachmentSizeBytes: number;
}

const EMPTY_DRAFT: CaptureDraft = {
  kind: 'text',
  title: '',
  content: '',
  sourceUrl: '',
  tagsInput: '',
  attachmentLocalUri: null,
  attachmentTitle: null,
  attachmentMimeType: null,
  attachmentSizeBytes: 0,
};

interface CaptureStoreState {
  draft: CaptureDraft;
  lastSavedDraftAt: string | null;
  updateDraft: (patch: Partial<CaptureDraft>) => void;
  resetDraft: () => void;
  hydrateDraft: (draft: CaptureDraft) => void;
}

export const useCaptureStore = create<CaptureStoreState>((set) => ({
  draft: EMPTY_DRAFT,
  lastSavedDraftAt: null,
  updateDraft: (patch) =>
    set((state) => ({
      draft: { ...state.draft, ...patch },
      lastSavedDraftAt: new Date().toISOString(),
    })),
  resetDraft: () => set({ draft: EMPTY_DRAFT, lastSavedDraftAt: null }),
  hydrateDraft: (draft) => set({ draft }),
}));
