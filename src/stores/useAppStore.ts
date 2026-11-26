import { create } from 'zustand';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../types/models';

interface AppState {
  isReady: boolean;
  isLocked: boolean;
  settings: AppSettings;
  dataVersion: number;
  setReady: (ready: boolean) => void;
  setLocked: (locked: boolean) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  bumpDataVersion: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isReady: false,
  isLocked: false,
  settings: DEFAULT_APP_SETTINGS,
  dataVersion: 0,
  setReady: (isReady) => set({ isReady }),
  setLocked: (isLocked) => set({ isLocked }),
  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),
  bumpDataVersion: () => set((state) => ({ dataVersion: state.dataVersion + 1 })),
}));
