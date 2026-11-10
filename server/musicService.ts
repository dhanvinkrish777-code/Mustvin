import { GoogleGenAI, ThinkingLevel } from '@google/genai';

function createAI(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      retryOptions: {
        attempts: 1,
      },
    },
  });
}

let lyriaUnavailableForKey: string | null = null;

export type LyriaModelVariant = 'lyria-3-clip-preview' | 'lyria-3-pro-preview';

export interface MusicGenerationRequest {
  prompt: string;
  model?: LyriaModelVariant;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface MusicGenerationResponse {
  audioDataUrl: string;
  mimeType: string;
  lyrics: string;
  prompt: string;
  modelUsed: string;
  durationLabel: string;
  isFallbackSynth: boolean;
}

/**
 * Synthesizes a clean, pleasant stereo 24kHz 16-bit PCM WAV instrumental track
 * tuned to the prompt's musical mood (cinematic, synthwave, ambient/piano, upbeat electronic, or lo-fi)
 * when the current API key does not have paid Lyria billing enabled.
 */
function synthesizeHarmonicWavBase64(prompt: string, durationSec: number): string {
  const sampleRate = 24000;
  const numChannels = 2;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const dataSize = totalSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format = 1
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buffer.writeUInt16LE(numChannels * 2, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const lower = prompt.toLowerCase();
  const isUpbeat = /\b(upbeat|edm|dance|techno|fast|energetic|rock|pop|synthwave|cyber|arcade)\b/.test(
    lower
  );
  const isChill = /\b(chill|lofi|lo-fi|ambient|calm|sleep|piano|relax|jazz|acoustic)\b/.test(lower);

  const bpm = isUpbeat ? 122 : isChill ? 78 : 96;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;

  // 4-bar chord progressions in Hz (Am - F - C - G or Cm - Ab - Eb - Bb)
  const chords = isChill
    ? [
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 392.0], // Am7
        [174.61, 220.0, 261.63, 349.23], // Fmaj7
        [196.0, 246.94, 293.66, 392.0], // G6
      ]
    : [
        [220.0, 261.63, 329.63, 440.0], // Am
        [174.61, 220.0, 261.63, 349.23], // F
        [261.63, 329.63, 392.0, 523.25], // C
        [196.0, 246.94, 293.66, 392.0], // G
      ];

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDur) % chords.length;
    const chord = chords[barIdx];

    // Global fade-in & fade-out envelope
    const fadeIn = Math.min(1, t / 1.2);
    const fadeOut = Math.min(1, (durationSec - t) / 1.8);
    const masterEnv = Math.max(0, Math.min(fadeIn, fadeOut));

    // Warm stereo chorus pad
    let padL = 0;
    let padR = 0;
    for (let n = 0; n < chord.length; n++) {
      const f = chord[n];
      padL += Math.sin(2 * Math.PI * (f * 0.998) * t + n * 0.4) * 0.14;
      padR += Math.sin(2 * Math.PI * (f * 1.002) * t + n * 0.7) * 0.14;
    }

    // Deep sub-bass on chord root
    const bassFreq = chord[0] * 0.5;
    const beatPos = (t % beatDur) / beatDur;
    const bassEnv = Math.exp(-beatPos * (isUpbeat ? 4.2 : 2.0));
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.24 * bassEnv;

    // Eighth-note melodic arpeggio
    const stepDur = beatDur / 2;
    const stepIdx = Math.floor(t / stepDur);
    const arpFreq = chord[stepIdx % chord.length] * 2;
    const stepPos = (t % stepDur) / stepDur;
    const arpEnv = Math.exp(-stepPos * 6.5);
    const arpPan = stepIdx % 2 === 0 ? 0.75 : 0.35;
    const arpWave =
      (Math.sin(2 * Math.PI * arpFreq * t) + 0.3 * Math.sin(4 * Math.PI * arpFreq * t)) *
      0.16 *
      arpEnv;

    // Gentle kick & hi-hat pulse
    let perc = 0;
    if (!isChill) {
      const kickEnv = Math.exp(-beatPos * 22);
      const kickFreq = 52 + 95 * kickEnv;
      perc += Math.sin(2 * Math.PI * kickFreq * t) * 0.22 * kickEnv;
    }

    const left = Math.max(-0.95, Math.min(0.95, (padL + bass + arpWave * arpPan + perc) * masterEnv));
    const right = Math.max(
      -0.95,
      Math.min(0.95, (padR + bass + arpWave * (1.1 - arpPan) + perc) * masterEnv)
    );

    buffer.writeInt16LE(Math.round(left * 32767), offset);
    buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
    offset += 4;
  }

  return buffer.toString('base64');
}

/**
 * Generates music from a text prompt (and optional image) using Google Lyria 3 models:
 * - `lyria-3-clip-preview` for short clips (up to 30s)
 * - `lyria-3-pro-preview` for full-length tracks
 *
 * Per `@google/genai` guidelines:
 * - Uses `generateContentStream` and omits `responseModalities` so both audio (`audio/mpeg`) and
 *   generated lyrics/metadata (`text`) are returned.
 */
export async function generateJarvisMusic(
  req: MusicGenerationRequest
): Promise<MusicGenerationResponse> {
  const prompt = (req.prompt || 'Generate a 30-second cinematic electronic track.').trim();
  const model: LyriaModelVariant =
    req.model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
  const currentKey = process.env.GEMINI_API_KEY || '';
  const ai = createAI();

  if (currentKey && lyriaUnavailableForKey !== currentKey) {
    try {
      const cleanImg = req.imageBase64
        ? req.imageBase64.replace(/^data:[^;]+;base64,/, '')
        : '';

      const contents: any = cleanImg
        ? {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: cleanImg,
                  mimeType: req.imageMimeType || 'image/jpeg',
                },
              },
            ],
          }
        : prompt;

      // Omit responseModalities so both MP3 audio chunks and generated lyrics text are streamed
      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(45000),
        },
      });

      const audioChunks: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length > 0) {
        const audioBase64 = Buffer.concat(audioChunks).toString('base64');
        return {
          audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
          mimeType,
          lyrics: lyrics.trim(),
          prompt,
          modelUsed: model,
          durationLabel: model === 'lyria-3-pro-preview' ? 'Full-Length Track' : '30s Clip',
          isFallbackSynth: false,
        };
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (
        msg.includes('403') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('404')
      ) {
        lyriaUnavailableForKey = currentKey;
      }
    }
  }

  // Free-tier fallback: synthesize a playable stereo harmonic WAV track + compose lyrics via gemini-3.8-flash
  const fallbackSeconds = model === 'lyria-3-pro-preview' ? 36 : 20;
  const wavBase64 = synthesizeHarmonicWavBase64(prompt, fallbackSeconds);

  let composedLyrics = '';
  if (currentKey) {
    try {
      const lyricRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Write concise song lyrics or musical arrangement notes (8-12 lines max) matching this music request: "${prompt}".`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(6500),
        },
      });
      composedLyrics = (lyricRes.text || '').trim();
    } catch {}
  }

  return {
    audioDataUrl: `data:audio/wav;base64,${wavBase64}`,
    mimeType: 'audio/wav',
    lyrics:
      composedLyrics ||
      `[Instrumental Synth Arrangement]\nPrompt: ${prompt}\nTip: Attach a billing-enabled API key in Settings > Secrets to unlock full studio vocal & multi-instrument rendering via ${model}.`,
    prompt,
    modelUsed: `${model} (Harmonic Synth Preview)`,
    durationLabel:
      model === 'lyria-3-pro-preview' ? 'Full Arrangement Preview (36s)' : 'Short Clip (20s)',
    isFallbackSynth: true,
  };
}
