import React, { useState } from 'react';
import {
  Check,
  Command,
  Globe,
  LogOut,
  Pencil,
  Play,
  Plus,
  Settings,
  Trash2,
  UserCheck,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react';
import {
  AI_VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  useJarvisPreferences,
  type AiVoiceName,
} from '../contexts/JarvisPreferencesContext';
import { useJarvisSession } from '../contexts/JarvisSessionContext';
import { jarvisAudio } from '../utils/audioSystem';
import {
  MACRO_ACTION_OPTIONS,
  type CustomVoiceMacro,
  type MacroTargetAction,
} from '../utils/voiceCommandService';

const QUICK_STARTER_MACROS: Array<{
  phrase: string;
  action: MacroTargetAction;
  shortLabel: string;
}> = [
  { phrase: 'open bio lab', action: 'nav_bioscience', shortLabel: '"open bio lab" → Bioscience' },
  { phrase: 'launch studio', action: 'nav_music', shortLabel: '"launch studio" → Music Studio' },
  { phrase: 'split screen', action: 'nav_multiview', shortLabel: '"split screen" → Multi-View' },
  { phrase: 'flip theme', action: 'toggle_theme', shortLabel: '"flip theme" → Switch Theme' },
];

function getInitials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return 'U';
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}

function getMacroActionMeta(action: MacroTargetAction) {
  return (
    MACRO_ACTION_OPTIONS.find((opt) => opt.action === action) || {
      action,
      label: action,
      category: 'Voice & System' as const,
      closesSettingsOnRun: false,
    }
  );
}

export const SettingsModal: React.FC = () => {
  const {
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
    closeSettings,
  } = useJarvisPreferences();

  const {
    user,
    authError,
    knownAccounts,
    signInWithGoogle,
    addNewGoogleAccount,
    signOutUser,
  } = useJarvisSession();

  const [testingVoice, setTestingVoice] = useState<boolean>(false);
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);

  // Custom Macros Form State
  const [macroPhrase, setMacroPhrase] = useState<string>('');
  const [macroAction, setMacroAction] = useState<MacroTargetAction>('nav_bioscience');
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroError, setMacroError] = useState<string>('');

  if (!isSettingsOpen) return null;

  const handleVoiceChange = (voiceId: AiVoiceName) => {
    setAiVoice(voiceId);
    jarvisAudio.playAcknowledgeSound();
  };

  const handleTestVoice = () => {
    setTestingVoice(true);
    jarvisAudio.speak(`Hello! This is ${aiVoice} speaking in ${language.label} on Jarvis 2.5.`, {
      preferCloudVoice: true,
      onEnd: () => setTestingVoice(false),
    });
    setTimeout(() => setTestingVoice(false), 5000);
  };

  const handleSaveMacro = (e: React.FormEvent) => {
    e.preventDefault();
    setMacroError('');

    if (editingMacroId) {
      const res = updateCustomMacro(editingMacroId, {
        phrase: macroPhrase,
        action: macroAction,
      });
      if (!res.ok) {
        setMacroError(res.error || 'Could not update macro.');
        return;
      }
      setEditingMacroId(null);
      setMacroPhrase('');
      jarvisAudio.playAcknowledgeSound();
      return;
    }

    const res = addCustomMacro(macroPhrase, macroAction);
    if (!res.ok) {
      setMacroError(res.error || 'Could not add macro.');
      return;
    }
    setMacroPhrase('');
    jarvisAudio.playAcknowledgeSound();
  };

  const handleStartEditMacro = (macro: CustomVoiceMacro) => {
    setEditingMacroId(macro.id);
    setMacroPhrase(macro.phrase);
    setMacroAction(macro.action);
    setMacroError('');
  };

  const handleCancelEditMacro = () => {
    setEditingMacroId(null);
    setMacroPhrase('');
    setMacroError('');
  };

  const handleQuickAddPreset = (phrase: string, action: MacroTargetAction) => {
    setMacroError('');
    const res = addCustomMacro(phrase, action);
    if (!res.ok) {
      setMacroError(res.error || 'Macro already exists.');
      return;
    }
    jarvisAudio.playAcknowledgeSound();
  };

  const handleRunMacroFromSettings = (macro: CustomVoiceMacro) => {
    const meta = getMacroActionMeta(macro.action);
    runCustomMacro(macro);
    if (meta.closesSettingsOnRun) {
      closeSettings();
    }
  };

  const navigationOptions = MACRO_ACTION_OPTIONS.filter((o) => o.category === 'Navigation');
  const systemOptions = MACRO_ACTION_OPTIONS.filter((o) => o.category === 'Voice & System');
  const otherAccounts = knownAccounts.filter((acc) => acc.uid !== user?.uid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-neutral-300 dark:border-neutral-800 bg-white text-black dark:bg-[#080808] dark:text-white overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-[#0d0d0d]">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-black dark:text-white" />
            <h2 className="text-base font-display font-bold tracking-tight">
              Jarvis 2.5 Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-black dark:hover:text-white transition cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {/* 1. AI Voice Selection */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                <span>AI Voice</span>
              </label>
              <button
                type="button"
                onClick={handleTestVoice}
                className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#141414] hover:bg-neutral-200 dark:hover:bg-neutral-800 text-xs font-medium text-black dark:text-white transition cursor-pointer"
              >
                {testingVoice ? 'Playing Voice...' : `Preview ${aiVoice}`}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AI_VOICE_OPTIONS.map((v) => {
                const selected = aiVoice === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleVoiceChange(v.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      selected
                        ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                        : 'bg-neutral-50 text-black border-neutral-200 hover:border-neutral-400 dark:bg-[#0f0f0f] dark:text-white dark:border-neutral-800 dark:hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-xs">
                      <span>{v.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </div>
                    <p
                      className={`text-[11px] mt-0.5 leading-snug ${
                        selected
                          ? 'text-neutral-300 dark:text-neutral-700'
                          : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {v.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Language Selection */}
          <section className="space-y-2">
            <label
              htmlFor="jarvis-language-select"
              className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Preferred Language</span>
            </label>
            <select
              id="jarvis-language-select"
              value={language.code}
              onChange={(e) => {
                setLanguageByCode(e.target.value);
                jarvisAudio.playAcknowledgeSound();
              }}
              className="w-full rounded-xl border border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] px-3.5 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  className="bg-white text-black dark:bg-black dark:text-white"
                >
                  {lang.label} ({lang.nativeLabel})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Applies to Jarvis 2.5 chat explanations, voice recognition, and live voice conversations.
            </p>
          </section>

          {/* 3. Custom Macros Configuration Panel */}
          <section className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                <Command className="w-3.5 h-3.5" />
                <span>Custom Macros</span>
              </div>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                {customMacros.length} configured
              </span>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Define custom phrases that trigger instant workspace navigation or system actions via voice or chat input.
            </p>

            <form onSubmit={handleSaveMacro} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="custom-macro-phrase"
                    className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                  >
                    Trigger Phrase
                  </label>
                  <input
                    id="custom-macro-phrase"
                    type="text"
                    value={macroPhrase}
                    onChange={(e) => {
                      setMacroPhrase(e.target.value);
                      if (macroError) setMacroError('');
                    }}
                    placeholder='e.g. "open bio lab"'
                    maxLength={80}
                    className="w-full rounded-xl border border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] px-3 py-2 text-xs text-black dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-black dark:focus:border-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="custom-macro-action"
                    className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                  >
                    Target Action
                  </label>
                  <select
                    id="custom-macro-action"
                    value={macroAction}
                    onChange={(e) => setMacroAction(e.target.value as MacroTargetAction)}
                    className="w-full rounded-xl border border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] px-3 py-2 text-xs text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white cursor-pointer"
                  >
                    <optgroup
                      label="Workspace Navigation"
                      className="bg-white text-black dark:bg-black dark:text-white"
                    >
                      {navigationOptions.map((opt) => (
                        <option
                          key={opt.action}
                          value={opt.action}
                          className="bg-white text-black dark:bg-black dark:text-white"
                        >
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup
                      label="Voice & System Actions"
                      className="bg-white text-black dark:bg-black dark:text-white"
                    >
                      {systemOptions.map((opt) => (
                        <option
                          key={opt.action}
                          value={opt.action}
                          className="bg-white text-black dark:bg-black dark:text-white"
                        >
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                {macroError ? (
                  <span className="text-xs text-red-600 dark:text-red-400">{macroError}</span>
                ) : (
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Works automatically with or without saying &ldquo;Hey Jarvis&rdquo;.
                  </span>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  {editingMacroId && (
                    <button
                      type="button"
                      onClick={handleCancelEditMacro}
                      className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#141414] hover:bg-neutral-200 dark:hover:bg-neutral-800 text-xs font-medium text-black dark:text-white transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {editingMacroId ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Macro</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {customMacros.length === 0 ? (
              <div className="pt-2 space-y-2">
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Quick-add a starter macro:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {QUICK_STARTER_MACROS.map((preset) => (
                    <button
                      key={preset.phrase}
                      type="button"
                      onClick={() => handleQuickAddPreset(preset.phrase, preset.action)}
                      className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] hover:border-neutral-400 dark:hover:border-neutral-600 text-left text-xs text-black dark:text-white flex items-center justify-between gap-2 transition cursor-pointer"
                    >
                      <span className="truncate">{preset.shortLabel}</span>
                      <Plus className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-b border-neutral-200 dark:border-neutral-800">
                {customMacros.map((macro) => {
                  const meta = getMacroActionMeta(macro.action);
                  const isBeingEdited = editingMacroId === macro.id;
                  return (
                    <div
                      key={macro.id}
                      className={`py-2.5 flex items-center justify-between gap-3 ${
                        macro.enabled ? '' : 'opacity-60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-black dark:text-white truncate">
                          &ldquo;{macro.phrase}&rdquo;
                          {isBeingEdited ? ' · Editing' : ''}
                        </div>
                        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                          {meta.label} · {macro.enabled ? 'Enabled' : 'Paused'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            updateCustomMacro(macro.id, { enabled: !macro.enabled })
                          }
                          className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-medium text-black dark:text-white transition cursor-pointer"
                          title={macro.enabled ? 'Pause macro' : 'Enable macro'}
                        >
                          {macro.enabled ? 'Pause' : 'Enable'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRunMacroFromSettings(macro)}
                          className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-medium text-black dark:text-white inline-flex items-center gap-1 transition cursor-pointer"
                          title="Run macro action now"
                        >
                          <Play className="w-3 h-3" />
                          <span>Run</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEditMacro(macro)}
                          className="p-1.5 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-black dark:hover:text-white transition cursor-pointer"
                          aria-label={`Edit macro ${macro.phrase}`}
                          title="Edit macro"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (editingMacroId === macro.id) {
                              handleCancelEditMacro();
                            }
                            removeCustomMacro(macro.id);
                          }}
                          className="p-1.5 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                          aria-label={`Delete macro ${macro.phrase}`}
                          title="Delete macro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Sign-In Info & Account Management */}
          <section className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Sign-In Info</span>
            </div>

            {user ? (
              <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] flex items-center gap-3.5">
                {user.photoURL && !avatarFailed ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Account'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-full object-cover border border-neutral-300 dark:border-neutral-700 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-sm font-bold text-black dark:text-white shrink-0">
                    {getInitials(user.displayName || user.email)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-black dark:text-white truncate">
                    {user.displayName || 'Google User'}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                    {user.email}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                    Signed in · Chat history synced across devices
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] space-y-3">
                <p className="text-xs text-neutral-700 dark:text-neutral-300">
                  You are currently using Jarvis 2.5 without a signed-in Google account. Sign in to sync your chat history across devices.
                </p>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full py-2.5 px-4 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                >
                  Sign in with Google
                </button>
              </div>
            )}

            {/* Previously Known Accounts on this Device */}
            {otherAccounts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Other accounts used on this device:
                </div>
                <div className="space-y-1.5">
                  {otherAccounts.map((acc) => (
                    <button
                      key={acc.uid}
                      type="button"
                      onClick={addNewGoogleAccount}
                      className="w-full p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-[#141414] flex items-center justify-between gap-2 text-left transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-black dark:text-white truncate">
                          {acc.displayName}
                        </div>
                        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">
                          {acc.email}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium underline shrink-0">Switch</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add a New Account */}
            <button
              type="button"
              onClick={addNewGoogleAccount}
              className="w-full py-2.5 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#121212] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-black dark:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add a new account</span>
            </button>

            {authError && (
              <p className="text-xs text-red-600 dark:text-red-400">{authError}</p>
            )}
          </section>

          {/* 5. At Last: Sign Out (Only shown when signed into an account) */}
          {user && (
            <section className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={async () => {
                  await signOutUser();
                  closeSettings();
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
