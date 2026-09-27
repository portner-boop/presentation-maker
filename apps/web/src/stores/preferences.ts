import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PreferencesState {
  /** Последний шаблон и длительность — умные значения по умолчанию для новой презентации. */
  lastTemplateId?: string;
  lastDuration: number;
  remember: (values: { templateId: string; duration: number }) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      lastDuration: 7,
      remember: ({ templateId, duration }) =>
        set({ lastTemplateId: templateId, lastDuration: duration }),
    }),
    // localStorage может быть недоступен (приватный режим) — тогда просто без памяти
    { name: 'pm-preferences', storage: createJSONStorage(() => localStorage) },
  ),
);
