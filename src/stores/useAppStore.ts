import { create } from 'zustand';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../types/models';

export interface DeletedNoteUndo {
  id: string;
  title: string;
}

interface AppState {
  isReady: boolean;
  isLocked: boolean;
  settings: AppSettings;
  dataVersion: number;
  lastDeletedNote: DeletedNoteUndo | null;
  setReady: (ready: boolean) => void;
  setLocked: (locked: boolean) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  bumpDataVersion: () => void;
  setLastDeletedNote: (deleted: DeletedNoteUndo | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isReady: false,
  isLocked: false,
  settings: DEFAULT_APP_SETTINGS,
  dataVersion: 0,
  lastDeletedNote: null,
  setReady: (isReady) => set({ isReady }),
  setLocked: (isLocked) => set({ isLocked }),
  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
  setLastDeletedNote: (lastDeletedNote) => set({ lastDeletedNote }),
}));
