import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { jarvisAudio } from '../utils/audioSystem';
import {
  CUSTOM_MACROS_STORAGE_KEY,
  MACRO_ACTION_OPTIONS,
  normalizeMacroPhrase,
  voiceCommander,
  type CustomVoiceMacro,
  type MacroTargetAction,
} from '../utils/voiceCommandService';

export type BackgroundColorMode = 'black' | 'white';
export type AiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  speechLang: string;
}

export const AI_VOICE_OPTIONS: Array<{
  id: AiVoiceName;
  label: string;
  description: string;
}> = [
  { id: 'Puck', label: 'Puck', description: 'Crisp, upbeat & articulate conversational voice' },
  { id: 'Charon', label: 'Charon', description: 'Deep, composed & authoritative baritone' },
  { id: 'Kore', label: 'Kore', description: 'Warm, clear & natural studio voice' },
  { id: 'Fenrir', label: 'Fenrir', description: 'Resonant, bold & confident tone' },
  { id: 'Zephyr', label: 'Zephyr', description: 'Smooth, calm & balanced assistant voice' },
];

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', speechLang: 'en-US' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', speechLang: 'hi-IN' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', speechLang: 'ta-IN' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', speechLang: 'te-IN' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', speechLang: 'kn-IN' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', speechLang: 'ml-IN' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', speechLang: 'es-ES' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', speechLang: 'fr-FR' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', speechLang: 'de-DE' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', speechLang: 'ja-JP' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', speechLang: 'ko-KR' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文', speechLang: 'zh-CN' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', speechLang: 'ar-SA' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', speechLang: 'pt-BR' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', speechLang: 'it-IT' },
];

const BG_STORAGE_KEY = 'jarvis2_bg_color';
const VOICE_STORAGE_KEY = 'jarvis2_ai_voice';
const LANG_STORAGE_KEY = 'jarvis2_language';

interface JarvisPreferencesContextValue {
  backgroundColor: BackgroundColorMode;
  setBackgroundColor: (mode: BackgroundColorMode) => void;
  toggleBackgroundColor: () => void;
  aiVoice: AiVoiceName;
  setAiVoice: (voice: AiVoiceName) => void;
  language: LanguageOption;
  setLanguageByCode: (code: string) => void;
  customMacros: CustomVoiceMacro[];
  addCustomMacro: (
    phrase: string,
    action: MacroTargetAction
  ) => { ok: boolean; error?: string };
  updateCustomMacro: (
    id: string,
    updates: Partial<Pick<CustomVoiceMacro, 'phrase' | 'action' | 'enabled'>>
  ) => { ok: boolean; error?: string };
  removeCustomMacro: (id: string) => void;
  runCustomMacro: (macro: CustomVoiceMacro) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const JarvisPreferencesContext = createContext<JarvisPreferencesContextValue | null>(null);

export const JarvisPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [backgroundColor, setBackgroundColorState] = useState<BackgroundColorMode>(() => {
    try {
      const saved = localStorage.getItem(BG_STORAGE_KEY);
      if (saved === 'white' || saved === 'black') return saved;
    } catch {}
    return 'black';
  });

  const [aiVoice, setAiVoiceState] = useState<AiVoiceName>(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY) as AiVoiceName | null;
      if (saved && AI_VOICE_OPTIONS.some((v) => v.id === saved)) return saved;
    } catch {}
    return 'Puck';
  });

  const [language, setLanguageState] = useState<LanguageOption>(() => {
    try {
      const savedCode = localStorage.getItem(LANG_STORAGE_KEY);
      const found = LANGUAGE_OPTIONS.find((l) => l.code === savedCode);
      if (found) return found;
    } catch {}
    return LANGUAGE_OPTIONS[0];
  });

  const [customMacros, setCustomMacrosState] = useState<CustomVoiceMacro[]>(() =>
    voiceCommander.getCustomMacros()
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Sync pure Black / pure White theme onto <html> root element
  useEffect(() => {
    const root = document.documentElement;
    if (backgroundColor === 'black') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', backgroundColor === 'black' ? '#000000' : '#ffffff');
    }

    try {
      localStorage.setItem(BG_STORAGE_KEY, backgroundColor);
    } catch {}
  }, [backgroundColor]);

  // Sync selected AI Voice & Language into audio synthesizer and voice recognition engine
  useEffect(() => {
    jarvisAudio.setAiVoiceProfile(aiVoice, language.label, language.speechLang);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, aiVoice);
    } catch {}
  }, [aiVoice, language]);

  useEffect(() => {
    voiceCommander.setRecognitionLanguage(language.speechLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, language.code);
    } catch {}
  }, [language]);

  useEffect(() => {
    voiceCommander.setCustomMacros(customMacros);
    try {
      localStorage.setItem(CUSTOM_MACROS_STORAGE_KEY, JSON.stringify(customMacros));
    } catch {}
  }, [customMacros]);

  const setBackgroundColor = useCallback((mode: BackgroundColorMode) => {
    setBackgroundColorState(mode);
  }, []);

  const toggleBackgroundColor = useCallback(() => {
    setBackgroundColorState((prev) => (prev === 'black' ? 'white' : 'black'));
  }, []);

  const setAiVoice = useCallback((voice: AiVoiceName) => {
    setAiVoiceState(voice);
  }, []);

  const setLanguageByCode = useCallback((code: string) => {
    const found = LANGUAGE_OPTIONS.find((l) => l.code === code);
    if (found) {
      setLanguageState(found);
    }
  }, []);

  const addCustomMacro = useCallback(
    (phrase: string, action: MacroTargetAction): { ok: boolean; error?: string } => {
      const normalized = normalizeMacroPhrase(phrase);
      if (normalized.length < 2) {
        return { ok: false, error: 'Enter a phrase with at least 2 characters.' };
      }
      if (!MACRO_ACTION_OPTIONS.some((opt) => opt.action === action)) {
        return { ok: false, error: 'Select a valid action.' };
      }

      const duplicate = customMacros.some(
        (m) => normalizeMacroPhrase(m.phrase) === normalized
      );
      if (duplicate) {
        return { ok: false, error: 'That trigger phrase is already assigned to a macro.' };
      }

      const cleanedDisplayPhrase = phrase
        .replace(/^(?:hey\s+|ok\s+|okay\s+|hi\s+|yo\s+)?jarvis[\s,.:;-]*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      const nextMacro: CustomVoiceMacro = {
        id: `macro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        phrase: cleanedDisplayPhrase || normalized,
        action,
        enabled: true,
        createdAt: Date.now(),
      };

      setCustomMacrosState((prev) => [nextMacro, ...prev]);
      return { ok: true };
    },
    [customMacros]
  );

  const updateCustomMacro = useCallback(
    (
      id: string,
      updates: Partial<Pick<CustomVoiceMacro, 'phrase' | 'action' | 'enabled'>>
    ): { ok: boolean; error?: string } => {
      if (updates.phrase !== undefined) {
        const normalized = normalizeMacroPhrase(updates.phrase);
        if (normalized.length < 2) {
          return { ok: false, error: 'Enter a phrase with at least 2 characters.' };
        }
        const duplicate = customMacros.some(
          (m) => m.id !== id && normalizeMacroPhrase(m.phrase) === normalized
        );
        if (duplicate) {
          return { ok: false, error: 'That trigger phrase is already assigned to another macro.' };
        }
      }

      setCustomMacrosState((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const nextPhrase =
            updates.phrase !== undefined
              ? updates.phrase
                  .replace(/^(?:hey\s+|ok\s+|okay\s+|hi\s+|yo\s+)?jarvis[\s,.:;-]*/i, '')
                  .replace(/\s+/g, ' ')
                  .trim() || normalizeMacroPhrase(updates.phrase)
              : m.phrase;
          return {
            ...m,
            ...updates,
            phrase: nextPhrase,
          };
        })
      );
      return { ok: true };
    },
    [customMacros]
  );

  const removeCustomMacro = useCallback((id: string) => {
    setCustomMacrosState((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const runCustomMacro = useCallback((macro: CustomVoiceMacro) => {
    voiceCommander.triggerCustomAction(macro.action, macro.phrase);
  }, []);

  return (
    <JarvisPreferencesContext.Provider
      value={{
        backgroundColor,
        setBackgroundColor,
        toggleBackgroundColor,
        aiVoice,
        setAiVoice,
        language,
        setLanguageByCode,
        customMacros,
        addCustomMacro,
        updateCustomMacro,
        removeCustomMacro,
        runCustomMacro,
        isSettingsOpen,
        openSettings: () => setIsSettingsOpen(true),
        closeSettings: () => setIsSettingsOpen(false),
      }}
    >
      {children}
    </JarvisPreferencesContext.Provider>
  );
};

export function useJarvisPreferences(): JarvisPreferencesContextValue {
  const ctx = useContext(JarvisPreferencesContext);
  if (!ctx) {
    throw new Error('useJarvisPreferences must be used within JarvisPreferencesProvider');
  }
  return ctx;
}
