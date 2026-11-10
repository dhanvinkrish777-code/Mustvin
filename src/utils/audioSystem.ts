/**
 * Jarvis 2.5 Audio Synthesizer & AI Voice Speech Engine
 * Supports cloud Gemini TTS voices ('Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr')
 * for explicit high-fidelity voice previews, and instant zero-quota browser SpeechSynthesis
 * tuned to the selected AI Voice & Language for automatic chat readouts.
 */

class JarvisAudioSystem {
  private audioCtx: AudioContext | null = null;
  private maleVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;
  public isSpeaking = false;
  public lastSpokeEndTime = 0;
  public onSpeakingChange?: (speaking: boolean) => void;
  private speakingSubscribers = new Set<(speaking: boolean) => void>();

  private activeAiVoice: string = 'Puck';
  private activeLanguageLabel: string = 'English';
  private activeSpeechLang: string = 'en-US';
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private ttsAbortController: AbortController | null = null;

  private recentSpokenHistory: Array<{ normalized: string; words: Set<string>; time: number }> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.initVoices();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.initVoices();
        };
      }
    }
  }

  public setAiVoiceProfile(voiceName: string, languageLabel: string, speechLang: string) {
    this.activeAiVoice = voiceName || 'Puck';
    this.activeLanguageLabel = languageLabel || 'English';
    this.activeSpeechLang = speechLang || 'en-US';
    this.initVoices();
  }

  public getAiVoiceName(): string {
    return this.activeAiVoice;
  }

  public subscribeSpeakingChange(listener: (speaking: boolean) => void): () => void {
    this.speakingSubscribers.add(listener);
    return () => {
      this.speakingSubscribers.delete(listener);
    };
  }

  private setSpeakingState(speaking: boolean) {
    const changed = this.isSpeaking !== speaking;
    this.isSpeaking = speaking;
    if (!speaking && changed) {
      this.lastSpokeEndTime = Date.now();
    }
    if (changed) {
      this.onSpeakingChange?.(speaking);
      this.speakingSubscribers.forEach((fn) => {
        try {
          fn(speaking);
        } catch {}
      });
    }
  }

  private normalizeForEchoCheck(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private recordSpokenText(text: string) {
    const now = Date.now();
    this.recentSpokenHistory = this.recentSpokenHistory.filter((item) => now - item.time < 4000);
    const normalized = this.normalizeForEchoCheck(text);
    if (!normalized) return;
    const words = new Set(normalized.split(' ').filter((w) => w.length >= 3));
    this.recentSpokenHistory.push({ normalized, words, time: now });
  }

  public isEchoOfRecentSpeech(transcript: string): boolean {
    if (this.isSpeaking) return true;
    const now = Date.now();
    const msSinceStopped = now - this.lastSpokeEndTime;

    if (msSinceStopped < 420) return true;
    if (msSinceStopped > 2600) return false;

    this.recentSpokenHistory = this.recentSpokenHistory.filter((item) => now - item.time < 4000);
    if (this.recentSpokenHistory.length === 0) return false;

    const norm = this.normalizeForEchoCheck(transcript);
    if (!norm) return false;

    const spokenTokens = norm.split(' ').filter((w) => w.length >= 3);

    for (const entry of this.recentSpokenHistory) {
      if (norm.length >= 16 && entry.normalized.includes(norm)) {
        return true;
      }
      if (spokenTokens.length >= 4 && entry.words.size > 0) {
        let matched = 0;
        for (const token of spokenTokens) {
          if (entry.words.has(token)) matched++;
        }
        if (matched / spokenTokens.length >= 0.8) {
          return true;
        }
      }
    }

    return false;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public initVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return [];
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.voicesLoaded = true;
      const langPrefix = this.activeSpeechLang.split('-')[0].toLowerCase();
      const langVoice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
      const preferredMale =
        voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith(langPrefix) &&
            (v.name.toLowerCase().includes('daniel') ||
              v.name.toLowerCase().includes('george') ||
              v.name.toLowerCase().includes('male') ||
              v.name.toLowerCase().includes('david') ||
              v.name.toLowerCase().includes('james'))
        ) ||
        langVoice ||
        voices.find((v) => v.lang.startsWith('en'));

      if (preferredMale) {
        this.maleVoice = preferredMale;
      }
    }
    return voices;
  }

  public getAvailableMaleVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices();
    const prefix = this.activeSpeechLang.split('-')[0].toLowerCase();
    const filtered = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    return filtered.length > 0 ? filtered : voices;
  }

  public setVoice(voice: SpeechSynthesisVoice) {
    this.maleVoice = voice;
  }

  private speechSessionId = 0;
  private sentenceTimer: ReturnType<typeof setTimeout> | null = null;

  private splitIntoSentences(text: string): string[] {
    const rawParts = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    for (const part of rawParts) {
      if (part.length <= 220) {
        chunks.push(part);
      } else {
        const subParts = part.split(/(?<=[,;:])\s+/);
        let current = '';
        for (const sub of subParts) {
          if ((current + ' ' + sub).trim().length <= 220) {
            current = (current + ' ' + sub).trim();
          } else {
            if (current) chunks.push(current);
            current = sub;
          }
        }
        if (current) chunks.push(current);
      }
    }
    return chunks;
  }

  /**
   * Speaks text immediately using browser SpeechSynthesis tuned to the user's selected
   * AI Voice & Language by default (zero Gemini RPM overhead), or via cloud TTS when
   * `preferCloudVoice: true` is explicitly passed (such as Settings voice preview).
   */
  public speak(
    text: string,
    options?: {
      pitch?: number;
      rate?: number;
      initialDelayMs?: number;
      preferCloudVoice?: boolean;
      onStart?: () => void;
      onEnd?: () => void;
    }
  ) {
    if (typeof window === 'undefined') return;

    this.stopSpeaking();
    const sessionId = ++this.speechSessionId;

    const cleanText = text
      .replace(/```math-note[\s\S]*?```/g, 'I have written the vertical step-by-step calculation in the notes.')
      .replace(/```[\s\S]*?```/g, 'I have displayed the code implementation on screen.')
      .replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1 over $2')
      .replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1 over $2')
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'square root of $1')
      .replace(/\\cancel\s*\{([^{}]+)\}/g, '$1')
      .replace(/\\text\s*\{([^{}]+)\}/g, '$1')
      .replace(/\\times\b|×/g, ' times ')
      .replace(/\\div\b|÷/g, ' divided by ')
      .replace(/\\cdot\b/g, ' times ')
      .replace(/\$\$/g, ' ')
      .replace(/\$/g, '')
      .replace(/\\[()[\]]/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#>`~\\{}]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    this.recordSpokenText(cleanText);
    const shouldTryCloud =
      Boolean(options?.preferCloudVoice) &&
      typeof navigator !== 'undefined' &&
      navigator.onLine &&
      cleanText.length <= 600;

    if (shouldTryCloud) {
      this.speakViaCloudOrFallback(cleanText, sessionId, options);
      return;
    }

    this.speakViaBrowserSynthesis(cleanText, sessionId, options);
  }

  private async speakViaCloudOrFallback(
    cleanText: string,
    sessionId: number,
    options?: {
      pitch?: number;
      rate?: number;
      initialDelayMs?: number;
      onStart?: () => void;
      onEnd?: () => void;
    }
  ) {
    const controller = new AbortController();
    this.ttsAbortController = controller;

    try {
      const res = await fetch('/api/jarvis/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceName: this.activeAiVoice,
          language: this.activeLanguageLabel,
        }),
        signal: controller.signal,
      });

      if (sessionId !== this.speechSessionId) return;

      if (res.status === 200) {
        const data = await res.json();
        if (data?.audioBase64 && sessionId === this.speechSessionId) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
          audio.playbackRate = options?.rate ?? 1.0;
          this.activeHtmlAudio = audio;
          this.setSpeakingState(true);
          options?.onStart?.();

          audio.onended = () => {
            if (sessionId === this.speechSessionId) {
              this.activeHtmlAudio = null;
              this.setSpeakingState(false);
              options?.onEnd?.();
            }
          };
          audio.onerror = () => {
            if (sessionId === this.speechSessionId) {
              this.activeHtmlAudio = null;
              this.speakViaBrowserSynthesis(cleanText, sessionId, options);
            }
          };

          await audio.play();
          return;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || sessionId !== this.speechSessionId) return;
    }

    if (sessionId === this.speechSessionId) {
      this.speakViaBrowserSynthesis(cleanText, sessionId, options);
    }
  }

  private speakViaBrowserSynthesis(
    cleanText: string,
    sessionId: number,
    options?: {
      pitch?: number;
      rate?: number;
      initialDelayMs?: number;
      onStart?: () => void;
      onEnd?: () => void;
    }
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (!this.voicesLoaded) {
      this.initVoices();
    }

    const sentences = this.splitIntoSentences(cleanText);
    if (sentences.length === 0) return;

    for (const s of sentences) {
      this.recordSpokenText(s);
    }
    this.setSpeakingState(true);
    options?.onStart?.();

    const voicePitchMap: Record<string, number> = {
      Puck: 1.02,
      Charon: 0.86,
      Kore: 1.08,
      Fenrir: 0.82,
      Zephyr: 0.96,
    };

    const pitch = options?.pitch ?? voicePitchMap[this.activeAiVoice] ?? 0.94;
    const rate = options?.rate ?? 1.0;
    const initialDelay = options?.initialDelayMs ?? 30;

    let idx = 0;
    const speakNextSentence = () => {
      if (sessionId !== this.speechSessionId) return;

      if (idx >= sentences.length) {
        this.setSpeakingState(false);
        options?.onEnd?.();
        return;
      }

      const sentence = sentences[idx++];
      this.recordSpokenText(sentence);
      const utterance = new SpeechSynthesisUtterance(sentence);

      if (this.maleVoice) {
        utterance.voice = this.maleVoice;
      }
      utterance.lang = this.activeSpeechLang;
      utterance.pitch = pitch;
      utterance.rate = rate;
      utterance.volume = 1.0;

      utterance.onend = () => {
        if (sessionId !== this.speechSessionId) return;
        if (idx < sentences.length) {
          this.sentenceTimer = setTimeout(speakNextSentence, 85);
        } else {
          this.setSpeakingState(false);
          options?.onEnd?.();
        }
      };

      utterance.onerror = (e: any) => {
        if (sessionId !== this.speechSessionId) return;
        if (e?.error === 'canceled' || e?.error === 'interrupted') {
          this.setSpeakingState(false);
          return;
        }
        if (idx < sentences.length) {
          this.sentenceTimer = setTimeout(speakNextSentence, 80);
        } else {
          this.setSpeakingState(false);
          options?.onEnd?.();
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        this.setSpeakingState(false);
      }
    };

    this.sentenceTimer = setTimeout(speakNextSentence, initialDelay);
  }

  public stopSpeaking() {
    this.speechSessionId++;
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.src = '';
      } catch {}
      this.activeHtmlAudio = null;
    }
    if (this.sentenceTimer) {
      clearTimeout(this.sentenceTimer);
      this.sentenceTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (this.isSpeaking) {
      this.setSpeakingState(false);
    }
  }

  public playAcknowledgeSound() {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }

  public playRadarPing(distanceRatio: number = 0.5) {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 1200 - distanceRatio * 600;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.18);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playDimensionLockedSound() {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      [1046.5, 1318.51, 1567.98].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.09, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.15);
      });
    } catch {}
  }

  public playHoloHum(intensity: number = 1.0) {
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220 * intensity, now);
      osc.frequency.linearRampToValueAtTime(330 * intensity, now + 0.08);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {}
  }
}

export const jarvisAudio = new JarvisAudioSystem();
