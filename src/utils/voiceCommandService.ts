/**
 * Jarvis Serialized Dual-Microphone Voice Engine
 *
 * Architecture:
 * - Mic 1 ('mic1'): Command Microphone — listens for navigation & control commands,
 *   including "start answering questions", which automatically turns OFF Mic 1 and turns ON Mic 2.
 * - Mic 2 ('mic2'): Answering Questions Microphone — listens continuously to user questions
 *   and sends them directly to Jarvis Chat. Saying "stop answering questions" automatically
 *   turns OFF Mic 2 and switches back to Mic 1 ON.
 * - Zero-Glitch Switching: Both Mic 1 and Mic 2 run over a single serialized SpeechRecognition
 *   session with atomic in-memory mode handoff and strict start/abort lifecycle guards, preventing
 *   overlapping audio-capture errors, dropped words, or race conditions.
 */

import { jarvisAudio } from './audioSystem';

export type ActiveMicMode = 'off' | 'mic1' | 'mic2';

export type JarvisCommandAction =
  | 'qa'
  | 'stop_qa'
  | 'mic_off'
  | 'new_chat'
  | 'dimension'
  | 'home'
  | 'nav_bioscience'
  | 'nav_music'
  | 'nav_multiview'
  | 'radar'
  | 'handcam'
  | 'clear_errors'
  | 'offline_mode'
  | 'online_mode'
  | 'toggle_theme'
  | 'toggle_mute'
  | 'open_settings'
  | 'open_python'
  | 'unknown';

export type MacroTargetAction = Exclude<JarvisCommandAction, 'unknown'>;

export interface CustomVoiceMacro {
  id: string;
  phrase: string;
  action: MacroTargetAction;
  enabled: boolean;
  createdAt: number;
}

export interface MacroActionOption {
  action: MacroTargetAction;
  label: string;
  category: 'Navigation' | 'Voice & System';
  closesSettingsOnRun?: boolean;
}

export const CUSTOM_MACROS_STORAGE_KEY = 'jarvis2_custom_macros_v1';

export const MACRO_ACTION_OPTIONS: MacroActionOption[] = [
  {
    action: 'home',
    label: 'Open Jarvis Chat (Home)',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'new_chat',
    label: 'Start a New Chat',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'nav_bioscience',
    label: 'Open Bioscience Workbench',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'nav_music',
    label: 'Open Music Studio',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'handcam',
    label: 'Open 3D Hand Gesture Sphere',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'dimension',
    label: 'Open 3D Dimension Caliper',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'radar',
    label: 'Open Nearby Device Radar',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'nav_multiview',
    label: 'Open Multi-View Workspace',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'open_python',
    label: 'Open Python Companion Code',
    category: 'Navigation',
    closesSettingsOnRun: true,
  },
  {
    action: 'qa',
    label: 'Switch to Mic 2 (Answer Questions)',
    category: 'Voice & System',
  },
  {
    action: 'stop_qa',
    label: 'Switch to Mic 1 (Command Mode)',
    category: 'Voice & System',
  },
  {
    action: 'mic_off',
    label: 'Turn Microphones Off',
    category: 'Voice & System',
  },
  {
    action: 'toggle_mute',
    label: 'Toggle Voice Output Mute',
    category: 'Voice & System',
  },
  {
    action: 'toggle_theme',
    label: 'Switch Black / White Theme',
    category: 'Voice & System',
  },
  {
    action: 'clear_errors',
    label: 'Clear Errors & Diagnostics',
    category: 'Voice & System',
  },
  {
    action: 'offline_mode',
    label: 'Enable Offline Core Mode',
    category: 'Voice & System',
  },
  {
    action: 'online_mode',
    label: 'Restore Online Cloud Mode',
    category: 'Voice & System',
  },
  {
    action: 'open_settings',
    label: 'Open Settings Panel',
    category: 'Voice & System',
  },
];

export interface CommandMatch {
  action: JarvisCommandAction;
  rawText: string;
  matchedTrigger: string;
  isCustomMacro?: boolean;
}

const FILLER_PHRASES = new Set([
  'um',
  'uh',
  'hmm',
  'hm',
  'oh',
  'ah',
  'eh',
  'k',
  'huh',
]);

const WAKE_WORD_REGEX =
  /^(?:hey\s+|ok\s+|okay\s+|hi\s+|yo\s+)?(?:jarvis|javis|jarvis's|charvis|harvis)[\s,.:;-]*(.*)$/i;

const WAKE_WORD_ANYWHERE_REGEX = /\b(?:jarvis|javis|jarvis's|charvis|harvis)\b/i;

export function normalizeMacroPhrase(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(WAKE_WORD_REGEX, '$1')
    .replace(/['"`.,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadStoredCustomMacros(): CustomVoiceMacro[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_MACROS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m: any) =>
          m &&
          typeof m.id === 'string' &&
          typeof m.phrase === 'string' &&
          normalizeMacroPhrase(m.phrase).length > 0 &&
          MACRO_ACTION_OPTIONS.some((opt) => opt.action === m.action)
      )
      .map((m: any) => ({
        id: m.id,
        phrase: String(m.phrase).trim(),
        action: m.action as MacroTargetAction,
        enabled: m.enabled !== false,
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

export function pickBestTranscript(resultItem: any): { text: string; confidence: number } {
  if (!resultItem || !resultItem.length) {
    return { text: '', confidence: 0 };
  }
  let bestText = resultItem[0]?.transcript || '';
  let bestConf = typeof resultItem[0]?.confidence === 'number' ? resultItem[0].confidence : 1;

  for (let k = 1; k < resultItem.length; k++) {
    const alt = resultItem[k];
    const conf = typeof alt?.confidence === 'number' ? alt.confidence : 0;
    const txt = (alt?.transcript || '').trim();
    if (txt && WAKE_WORD_ANYWHERE_REGEX.test(txt) && !WAKE_WORD_ANYWHERE_REGEX.test(bestText)) {
      bestText = txt;
      bestConf = Math.max(bestConf, conf);
    } else if (txt && conf > bestConf + 0.05) {
      bestText = txt;
      bestConf = conf;
    }
  }

  return { text: bestText, confidence: bestConf };
}

class VoiceCommandManager {
  private recognition: any = null;
  public micMode: ActiveMicMode = 'off';
  public isListening = false;
  public requireWakeWord = false;

  // Strict serialization flags to prevent SpeechRecognition race glitches
  private isStartPending = false;
  private isAbortPending = false;
  private pausedForJarvisSpeech = false;
  private pausedForNetworkOffline = false;
  private pausedForLiveVoice = false;
  private recognitionLang = 'en-US';

  private lastCommandTime = 0;
  private lastCommandAction = '';
  private lastQuestionText = '';
  private lastQuestionTime = 0;

  private resumeAfterSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private questionFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingQuestionBuffer = '';
  private latestInterimBuffer = '';
  private recentCommandBuffer = '';
  private recentCommandTime = 0;

  private customMacros: CustomVoiceMacro[] = [];

  public onCommandDetected?: (match: CommandMatch) => void;
  public onQuestionSpoken?: (question: string) => void;
  public onTranscriptChange?: (text: string) => void;
  public onListeningStateChange?: (active: boolean) => void;
  public onMicModeChange?: (mode: ActiveMicMode) => void;
  public onOfflineSpeechNotice?: (msg: string) => void;

  constructor() {
    this.customMacros = loadStoredCustomMacros();
    this.initRecognition();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.pausedForNetworkOffline && this.micMode !== 'off') {
          this.pausedForNetworkOffline = false;
          this.safeStartRecognition();
        }
      });
    }

    jarvisAudio.subscribeSpeakingChange((speaking) => {
      if (speaking) {
        this.pauseWhileSpeaking();
      } else {
        this.resumeAfterSpeakingCooldown();
      }
    });
  }

  public get answerQuestionsMode(): boolean {
    return this.micMode === 'mic2';
  }

  public set answerQuestionsMode(val: boolean) {
    if (val && this.micMode !== 'mic2') {
      this.setMicMode('mic2');
    } else if (!val && this.micMode === 'mic2') {
      this.setMicMode('mic1');
    }
  }

  /**
   * Atomically switches between 'off', 'mic1' (Command Mic), and 'mic2' (Q&A Mic)
   * without tearing down an already-active SpeechRecognition hardware stream.
   */
  public setMicMode(nextMode: ActiveMicMode) {
    const prevMode = this.micMode;
    this.micMode = nextMode;

    // Clear partial buffers during mode switch so prior fragments never leak across mics
    this.clearPendingQuestion();
    this.onTranscriptChange?.('');

    if (prevMode !== nextMode) {
      this.onMicModeChange?.(nextMode);
    }

    if (nextMode === 'off') {
      this.stopListeningInternal();
      return;
    }

    // Ensure underlying recognition session is running smoothly (if not already running, start cleanly)
    this.pausedForNetworkOffline = false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.pausedForNetworkOffline = true;
      this.onListeningStateChange?.(false);
      this.onOfflineSpeechNotice?.(
        'Offline Mode active: type questions below—Local Neural Core & Male Voice TTS work without internet.'
      );
      return;
    }

    if (!jarvisAudio.isSpeaking && !this.pausedForJarvisSpeech) {
      this.safeStartRecognition();
    }
  }

  public startListening(initialMode: 'mic1' | 'mic2' = 'mic1') {
    this.setMicMode(initialMode);
  }

  public stopListening() {
    this.setMicMode('off');
  }

  public setRecognitionLanguage(langCode: string) {
    const nextLang = langCode || 'en-US';
    if (this.recognitionLang === nextLang) return;
    this.recognitionLang = nextLang;
    if (this.recognition) {
      this.recognition.lang = nextLang;
      if (this.isListening) {
        this.safeAbortRecognition();
      }
    }
  }

  public setCustomMacros(macros: CustomVoiceMacro[]) {
    this.customMacros = Array.isArray(macros) ? [...macros] : [];
  }

  public getCustomMacros(): CustomVoiceMacro[] {
    return [...this.customMacros];
  }

  public triggerCustomAction(action: MacroTargetAction, matchedTrigger: string): boolean {
    return this.triggerCommand(action, matchedTrigger, matchedTrigger, true, true);
  }

  public setExternalVoiceSessionActive(active: boolean) {
    this.pausedForLiveVoice = active;
    if (active) {
      this.clearPendingQuestion();
      this.onTranscriptChange?.('');
      this.safeAbortRecognition();
    } else if (this.micMode !== 'off' && !jarvisAudio.isSpeaking && !this.pausedForNetworkOffline) {
      this.safeStartRecognition();
    }
  }

  public notifyJarvisStoppedSpeaking() {
    if (!jarvisAudio.isSpeaking) {
      this.resumeAfterSpeakingCooldown();
    }
  }

  private safeStartRecognition() {
    if (!this.recognition) {
      this.initRecognition();
    }
    if (!this.recognition) return;
    if (this.micMode === 'off' || this.pausedForLiveVoice) return;
    if (this.isListening || this.isStartPending) return;
    if (jarvisAudio.isSpeaking || this.pausedForJarvisSpeech) return;
    this.recognition.lang = this.recognitionLang;

    if (this.isAbortPending) {
      // Wait for onend to clear isAbortPending, which will schedule safeStartRecognition cleanly
      return;
    }

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    try {
      this.isStartPending = true;
      this.recognition.start();
    } catch {
      this.isStartPending = false;
    }
  }

  private safeAbortRecognition() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.recognition) return;
    if (!this.isListening && !this.isStartPending) return;

    try {
      this.isAbortPending = true;
      this.isStartPending = false;
      this.recognition.abort();
    } catch {
      this.isAbortPending = false;
      this.isListening = false;
    }
  }

  private stopListeningInternal() {
    this.pausedForJarvisSpeech = false;
    if (this.resumeAfterSpeechTimer) {
      clearTimeout(this.resumeAfterSpeechTimer);
      this.resumeAfterSpeechTimer = null;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.clearPendingQuestion();
    this.onTranscriptChange?.('');
    this.safeAbortRecognition();
    this.isListening = false;
    this.onListeningStateChange?.(false);
  }

  private pauseWhileSpeaking() {
    this.pausedForJarvisSpeech = true;
    this.clearPendingQuestion();
    this.onTranscriptChange?.('');
    if (this.resumeAfterSpeechTimer) {
      clearTimeout(this.resumeAfterSpeechTimer);
      this.resumeAfterSpeechTimer = null;
    }
    if (this.isListening || this.isStartPending) {
      this.safeAbortRecognition();
    }
  }

  private resumeAfterSpeakingCooldown() {
    if (this.resumeAfterSpeechTimer) {
      clearTimeout(this.resumeAfterSpeechTimer);
    }
    this.resumeAfterSpeechTimer = setTimeout(() => {
      this.resumeAfterSpeechTimer = null;
      if (jarvisAudio.isSpeaking) return;
      this.pausedForJarvisSpeech = false;

      if (this.micMode !== 'off' && !this.pausedForNetworkOffline) {
        this.safeStartRecognition();
      }
    }, 380);
  }

  private clearPendingQuestion() {
    this.pendingQuestionBuffer = '';
    this.latestInterimBuffer = '';
    this.recentCommandBuffer = '';
    this.recentCommandTime = 0;
    if (this.questionFlushTimer) {
      clearTimeout(this.questionFlushTimer);
      this.questionFlushTimer = null;
    }
  }

  private extractIntentionalQuestion(rawText: string): string | null {
    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;

    if (jarvisAudio.isEchoOfRecentSpeech(cleaned)) {
      return null;
    }

    const lower = cleaned.toLowerCase().replace(/[.,!?]/g, '').trim();
    if (!lower || FILLER_PHRASES.has(lower)) {
      return null;
    }

    const wakeMatch = cleaned.match(WAKE_WORD_REGEX);
    if (wakeMatch) {
      const remainder = wakeMatch[1].trim();
      if (!remainder || FILLER_PHRASES.has(remainder.toLowerCase())) {
        return null;
      }
      return remainder;
    }

    // In Mic 1 (Command Mic), only respond to commands unless wake word was spoken
    if (this.micMode !== 'mic2' || this.requireWakeWord) {
      return null;
    }

    const words = lower.split(' ').filter(Boolean);
    if (words.length === 1 && lower.length < 2) {
      return null;
    }

    return cleaned;
  }

  private flushBufferedSpeech() {
    const combined = (this.pendingQuestionBuffer || this.latestInterimBuffer)
      .replace(/\s+/g, ' ')
      .trim();
    this.pendingQuestionBuffer = '';
    this.latestInterimBuffer = '';
    if (this.questionFlushTimer) {
      clearTimeout(this.questionFlushTimer);
      this.questionFlushTimer = null;
    }

    if (!combined) return;

    if (this.evaluateCommand(combined)) {
      this.onTranscriptChange?.('');
      return;
    }

    const intentionalQuestion = this.extractIntentionalQuestion(combined);
    if (!intentionalQuestion) {
      this.onTranscriptChange?.('');
      return;
    }

    const now = Date.now();
    if (
      intentionalQuestion.toLowerCase() !== this.lastQuestionText ||
      now - this.lastQuestionTime > 2200
    ) {
      this.lastQuestionText = intentionalQuestion.toLowerCase();
      this.lastQuestionTime = now;
      this.onTranscriptChange?.(intentionalQuestion);
      this.onQuestionSpoken?.(intentionalQuestion);
    }
  }

  private scheduleQuestionFlush(delayMs = 640) {
    if (this.questionFlushTimer) {
      clearTimeout(this.questionFlushTimer);
    }
    this.questionFlushTimer = setTimeout(() => {
      this.flushBufferedSpeech();
    }, delayMs);
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      rec.lang = this.recognitionLang;
      this.recognition = rec;

      rec.onstart = () => {
        this.isStartPending = false;
        this.isAbortPending = false;

        if (
          this.micMode === 'off' ||
          this.pausedForLiveVoice ||
          jarvisAudio.isSpeaking ||
          this.pausedForJarvisSpeech
        ) {
          this.safeAbortRecognition();
          return;
        }

        this.isListening = true;
        this.onListeningStateChange?.(true);
      };

      rec.onresult = (event: any) => {
        if (
          this.micMode === 'off' ||
          jarvisAudio.isSpeaking ||
          this.pausedForJarvisSpeech ||
          Date.now() - jarvisAudio.lastSpokeEndTime < 380
        ) {
          this.clearPendingQuestion();
          return;
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const { text: piece, confidence } = pickBestTranscript(res);
          const trimmedPiece = piece.trim();
          if (!trimmedPiece) continue;

          if (res.isFinal) {
            const wordCount = trimmedPiece.split(/\s+/).length;
            if (wordCount <= 1 && confidence > 0 && confidence < 0.22) {
              continue;
            }
            if (!jarvisAudio.isEchoOfRecentSpeech(trimmedPiece)) {
              finalTranscript += ' ' + trimmedPiece;
            }
          } else {
            interimTranscript += ' ' + trimmedPiece;
          }
        }

        const cleanInterim = interimTranscript.replace(/\s+/g, ' ').trim();
        const cleanFinal = finalTranscript.replace(/\s+/g, ' ').trim();

        // Instant command check on interim for ultra-fast zero-lag mic & navigation switching
        if (cleanInterim && this.isInstantMicSwitchPhrase(cleanInterim)) {
          if (this.evaluateCommand(cleanInterim)) {
            this.clearPendingQuestion();
            this.onTranscriptChange?.('');
            return;
          }
        }

        if (cleanInterim) {
          this.latestInterimBuffer = cleanInterim;
          const liveDisplay = this.pendingQuestionBuffer
            ? `${this.pendingQuestionBuffer} ${cleanInterim}`
            : cleanInterim;
          this.onTranscriptChange?.(liveDisplay);
          const hasWake = WAKE_WORD_ANYWHERE_REGEX.test(liveDisplay);
          if (this.micMode === 'mic2' || hasWake) {
            this.scheduleQuestionFlush(680);
          }
        }

        if (cleanFinal) {
          this.latestInterimBuffer = '';
          const nowTs = Date.now();
          const combinedRecentCommand =
            this.recentCommandBuffer && nowTs - this.recentCommandTime < 2800
              ? `${this.recentCommandBuffer} ${cleanFinal}`.trim()
              : cleanFinal;

          const candidateCommand = this.pendingQuestionBuffer
            ? `${this.pendingQuestionBuffer} ${cleanFinal}`.trim()
            : combinedRecentCommand;

          if (
            this.evaluateCommand(candidateCommand) ||
            this.evaluateCommand(combinedRecentCommand) ||
            this.evaluateCommand(cleanFinal)
          ) {
            this.clearPendingQuestion();
            this.onTranscriptChange?.('');
            return;
          }

          this.recentCommandBuffer = combinedRecentCommand.split(/\s+/).slice(-7).join(' ');
          this.recentCommandTime = nowTs;

          const hasWakeWord =
            WAKE_WORD_ANYWHERE_REGEX.test(cleanFinal) ||
            WAKE_WORD_ANYWHERE_REGEX.test(this.pendingQuestionBuffer);

          if (this.micMode === 'mic2' || hasWakeWord) {
            if (!this.requireWakeWord || hasWakeWord) {
              this.pendingQuestionBuffer = this.pendingQuestionBuffer
                ? `${this.pendingQuestionBuffer} ${cleanFinal}`
                : cleanFinal;
              this.onTranscriptChange?.(this.pendingQuestionBuffer);
              this.scheduleQuestionFlush(600);
            }
          } else {
            // Mic 1 heard non-command ambient talk: clear transcript cleanly after brief display
            this.onTranscriptChange?.(cleanFinal);
            setTimeout(() => {
              if (!this.pendingQuestionBuffer && !this.latestInterimBuffer) {
                this.onTranscriptChange?.('');
              }
            }, 900);
          }
        }
      };

      rec.onerror = (e: any) => {
        this.isStartPending = false;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.micMode = 'off';
          this.isListening = false;
          this.onMicModeChange?.('off');
          this.onListeningStateChange?.(false);
        } else if (e.error === 'network') {
          this.pausedForNetworkOffline = true;
          this.isListening = false;
          this.onListeningStateChange?.(false);
          this.onOfflineSpeechNotice?.(
            'Offline Mode: Browser voice-to-text requires internet; Local Neural Chat & Voice Output remain active.'
          );
        }
      };

      rec.onend = () => {
        this.isStartPending = false;
        this.isAbortPending = false;
        this.isListening = false;
        this.onListeningStateChange?.(false);

        if (
          this.micMode !== 'off' &&
          !this.pausedForJarvisSpeech &&
          !jarvisAudio.isSpeaking &&
          (this.pendingQuestionBuffer || this.latestInterimBuffer)
        ) {
          this.flushBufferedSpeech();
        }

        if (
          this.micMode !== 'off' &&
          !this.pausedForLiveVoice &&
          !this.pausedForNetworkOffline &&
          !this.pausedForJarvisSpeech &&
          !jarvisAudio.isSpeaking
        ) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.safeStartRecognition();
          }, 140);
        }
      };
    } catch (err) {
      console.warn('Speech recognition init notice:', err);
    }
  }

  private findMatchingCustomMacro(normalizedInput: string): CustomVoiceMacro | null {
    if (!normalizedInput || this.customMacros.length === 0) return null;

    // Sort longer phrases first so specific phrases ("open music lab now") win over shorter prefixes
    const enabledMacros = this.customMacros
      .filter((m) => m.enabled)
      .sort((a, b) => b.phrase.length - a.phrase.length);

    for (const macro of enabledMacros) {
      const target = normalizeMacroPhrase(macro.phrase);
      if (!target) continue;

      if (
        normalizedInput === target ||
        normalizedInput === `please ${target}` ||
        normalizedInput === `can you ${target}` ||
        normalizedInput === `could you ${target}`
      ) {
        return macro;
      }

      const wordCount = target.split(' ').length;
      if ((wordCount >= 2 || target.length >= 6) && normalizedInput.endsWith(` ${target}`)) {
        return macro;
      }
    }

    return null;
  }

  private isInstantMicSwitchPhrase(text: string): boolean {
    const t = normalizeMacroPhrase(text);
    if (!t) return false;

    if (this.findMatchingCustomMacro(t)) {
      return true;
    }

    return (
      t.endsWith('start answering questions') ||
      t.endsWith('start answering my questions') ||
      t.endsWith('stop answering questions') ||
      t.endsWith('stop answering my questions') ||
      t.endsWith('go to hand cam') ||
      t.endsWith('go to the hand cam') ||
      t.endsWith('open hand cam') ||
      t.endsWith('go to handcam') ||
      t.endsWith('go to hand camera') ||
      t.endsWith('start monitoring dimension') ||
      t.endsWith('find the nearby device')
    );
  }

  private looksLikeQuestion(t: string): boolean {
    // Never classify explicit mic-switching or navigation commands as questions
    if (
      t.includes('start answering') ||
      t.includes('stop answering') ||
      t.includes('pause answering') ||
      t.includes('hand cam') ||
      t.includes('handcam') ||
      t.includes('hand camera') ||
      t.includes('monitoring dimension') ||
      t.includes('nearby device')
    ) {
      return false;
    }
    return /^(what|why|how|who|where|when|which|explain|tell me|define|calculate|solve|write|compare|describe|is |are |was |were |do |does |did |can you|could you)\b/i.test(
      t.trim()
    );
  }

  public evaluateCommand(text: string): boolean {
    const t = normalizeMacroPhrase(text);
    if (!t) return false;

    // 0. User-Defined Custom Macros (checked first so custom phrases work even if phrased like questions)
    const matchedMacro = this.findMatchingCustomMacro(t);
    if (matchedMacro) {
      return this.triggerCommand(matchedMacro.action, text, matchedMacro.phrase, true);
    }

    // 1. Stop answering questions -> Switch Mic 2 OFF and Mic 1 ON
    if (
      t.includes('stop answering questions') ||
      t.includes('stop answering my questions') ||
      t.includes('stop answering question') ||
      t === 'stop answering' ||
      t.includes('pause answering') ||
      t.includes('switch to first mic') ||
      t.includes('switch to mic one') ||
      t.includes('switch to mic 1')
    ) {
      return this.triggerCommand('stop_qa', text, 'stop answering questions');
    }

    // 2. Start answering questions -> Switch Mic 1 OFF and Mic 2 ON
    if (
      t.includes('start answering questions') ||
      t.includes('start answering my questions') ||
      t.includes('start answering question') ||
      t === 'start answering' ||
      t.includes('answer my questions') ||
      t.includes('answer questions') ||
      t.includes('answer everything') ||
      t.includes('switch to second mic') ||
      t.includes('switch to mic two') ||
      t.includes('switch to mic 2')
    ) {
      return this.triggerCommand('qa', text, 'start answering questions');
    }

    // 3. Go to hand cam / Go to the hand cam (checked BEFORE looksLikeQuestion so phrases like "can you go to hand cam" always work!)
    if (
      t.includes('hand cam') ||
      t.includes('handcam') ||
      t.includes('hand can') ||
      t.includes('hand camp') ||
      t.includes('hand come') ||
      t.includes('hand calm') ||
      t.includes('hang cam') ||
      t.includes('hand camera') ||
      t.includes('gesture cam') ||
      t.includes('gesture ball') ||
      t.includes('gesture sphere') ||
      t.includes('3d ball') ||
      t.includes('3d hand') ||
      /\b(?:go\s+to|open|start|launch|switch\s+to)\s+(?:the\s+)?(?:hand|and\s+cam|webcam\s+ball)\b/.test(
        t
      )
    ) {
      return this.triggerCommand('handcam', text, 'go to hand cam');
    }

    if (this.looksLikeQuestion(t)) {
      return false;
    }

    // 4. New chat
    if (
      t === 'new chat' ||
      t === 'start new chat' ||
      t === 'start a new chat' ||
      t === 'add new chat' ||
      t === 'open new chat'
    ) {
      return this.triggerCommand('new_chat', text, 'new chat');
    }

    // 5. Clear errors / reset chat
    if (
      t.includes('clear all errors') ||
      t.includes('clear errors') ||
      t === 'clear error' ||
      t === 'clear chat' ||
      t === 'reset chat'
    ) {
      return this.triggerCommand('clear_errors', text, 'clear all errors');
    }

    // 6. Start monitoring dimension
    if (
      t.includes('monitoring dimension') ||
      t.includes('monitor dimension') ||
      t.includes('measure dimension') ||
      t.includes('measuring dimension') ||
      t.includes('open dimension') ||
      t.includes('3d dimension') ||
      t === 'dimension camera'
    ) {
      return this.triggerCommand('dimension', text, 'start monitoring dimension');
    }

    // 7. Go to home screen OR open Jarvis
    if (
      t.includes('go to home screen') ||
      t.includes('go to the home screen') ||
      t === 'home screen' ||
      t === 'open jarvis' ||
      t === 'open javis' ||
      t.includes('go to jarvis') ||
      t.includes('back to home')
    ) {
      return this.triggerCommand(
        'home',
        text,
        t.includes('open jarvis') || t.includes('open javis') ? 'open Jarvis' : 'go to home screen'
      );
    }

    // 8. Bioscience, Music Studio, Multi-View, Settings & Python navigation
    if (
      t === 'open bioscience' ||
      t === 'bioscience workbench' ||
      t === 'open bioscience lab' ||
      t === 'go to bioscience'
    ) {
      return this.triggerCommand('nav_bioscience', text, 'open bioscience');
    }

    if (
      t === 'open music studio' ||
      t === 'music studio' ||
      t === 'go to music studio'
    ) {
      return this.triggerCommand('nav_music', text, 'open music studio');
    }

    if (
      t === 'open multi view' ||
      t === 'open multiview' ||
      t === 'multi view' ||
      t === 'multiview' ||
      t === 'go to multi view'
    ) {
      return this.triggerCommand('nav_multiview', text, 'open multi-view');
    }

    if (t === 'open settings' || t === 'jarvis settings') {
      return this.triggerCommand('open_settings', text, 'open settings');
    }

    // 9. Find the nearby device
    if (
      t.includes('nearby device') ||
      t.includes('near by device') ||
      t.includes('scan radar') ||
      t.includes('open radar') ||
      t.includes('scan bluetooth')
    ) {
      return this.triggerCommand('radar', text, 'find the nearby device');
    }

    // 10. Offline / Online mode commands
    if (t.includes('go offline') || t.includes('offline mode') || t.includes('work offline')) {
      return this.triggerCommand('offline_mode', text, 'offline mode');
    }
    if (t.includes('go online') || t.includes('online mode')) {
      return this.triggerCommand('online_mode', text, 'online mode');
    }

    return false;
  }

  private triggerCommand(
    action: JarvisCommandAction,
    rawText: string,
    matchedTrigger: string,
    isCustomMacro = false,
    bypassDebounce = false
  ): boolean {
    const now = Date.now();
    if (!bypassDebounce && this.lastCommandAction === action && now - this.lastCommandTime < 1400) {
      return true;
    }

    this.lastCommandAction = action;
    this.lastCommandTime = now;
    this.clearPendingQuestion();

    // Immediately switch mic mode inside the engine before notifying UI so state is always synchronized
    if (action === 'qa') {
      this.setMicMode('mic2');
    } else if (action === 'stop_qa') {
      this.setMicMode('mic1');
    } else if (action === 'mic_off') {
      this.setMicMode('off');
    }

    jarvisAudio.playAcknowledgeSound();
    this.onCommandDetected?.({
      action,
      rawText,
      matchedTrigger,
      isCustomMacro,
    });
    return true;
  }
}

export const voiceCommander = new VoiceCommandManager();
