import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings } from '../types/settings';

interface SettingsState extends AppSettings {
  updateSettings: (settings: Partial<AppSettings>) => void;
  clearSettings: () => void;
}

const defaultSettings: AppSettings = {
  geminiApiKey: '',
  prefixText: '',
  targetDomains: ['lubimyczytac.pl', 'empik.com'],
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
      clearSettings: () => set(defaultSettings),
    }),
    {
      name: 'ai-book-scanner-settings',
    }
  )
);
