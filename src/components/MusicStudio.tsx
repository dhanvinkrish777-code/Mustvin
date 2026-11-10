import React, { useRef, useState } from 'react';
import {
  Disc3,
  Download,
  ImagePlus,
  Music,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type { GeneratedMusicPayload } from '../contexts/JarvisSessionContext';

interface MusicStudioProps {
  onStatusUpdate?: (msg: string) => void;
  onShareTrackToChat?: (track: GeneratedMusicPayload) => void;
}

const PRESET_MUSIC_PROMPTS = [
  {
    label: 'Cinematic Sci-Fi',
    prompt: 'Generate a 30-second cinematic sci-fi orchestral soundtrack with warm analog brass and arpeggiated synths.',
  },
  {
    label: 'Midnight Synthwave',
    prompt: 'Generate a punchy retro-futuristic 80s synthwave night-drive track with pulsing bass and neon leads.',
  },
  {
    label: 'Lo-Fi Study Chill',
    prompt: 'Generate a warm lo-fi chillhop beat with mellow electric piano chords and soft vinyl ambiance.',
  },
  {
    label: 'Piano & Strings',
    prompt: 'Generate an uplifting neoclassical solo piano and chamber strings piece with emotional dynamics.',
  },
  {
    label: 'Upbeat Electronic',
    prompt: 'Generate an energetic melodic electronic dance track with crisp percussion and bright vocal chops.',
  },
];

export const MusicStudio: React.FC<MusicStudioProps> = ({
  onStatusUpdate,
  onShareTrackToChat,
}) => {
  const [prompt, setPrompt] = useState<string>(PRESET_MUSIC_PROMPTS[0].prompt);
  const [modelVariant, setModelVariant] = useState<
    'lyria-3-clip-preview' | 'lyria-3-pro-preview'
  >('lyria-3-clip-preview');
  const [attachedImage, setAttachedImage] = useState<{
    name: string;
    mimeType: string;
    dataUrl: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [tracks, setTracks] = useState<Array<GeneratedMusicPayload & { id: string }>>([]);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        dataUrl: String(reader.result || ''),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateMusic = async (customPrompt?: string) => {
    const targetPrompt = (customPrompt ?? prompt).trim();
    if (!targetPrompt || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage('');
    onStatusUpdate?.(
      `Generating music via ${modelVariant} (${
        modelVariant === 'lyria-3-pro-preview' ? 'Full Track' : '30s Clip'
      })...`
    );

    try {
      const response = await fetch('/api/jarvis/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: targetPrompt,
          model: modelVariant,
          imageBase64: attachedImage?.dataUrl,
          imageMimeType: attachedImage?.mimeType,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Music generation failed.');
      }

      const createdTrack: GeneratedMusicPayload & { id: string } = {
        id: `trk_${Date.now()}`,
        audioDataUrl: data.audioDataUrl,
        mimeType: data.mimeType || 'audio/mpeg',
        lyrics: data.lyrics || '',
        prompt: targetPrompt,
        modelUsed: data.modelUsed || modelVariant,
        durationLabel:
          data.durationLabel ||
          (modelVariant === 'lyria-3-pro-preview' ? 'Full-Length Track' : '30s Clip'),
        isFallbackSynth: Boolean(data.isFallbackSynth),
      };

      setTracks((prev) => [createdTrack, ...prev]);
      onStatusUpdate?.(`Music ready: ${createdTrack.durationLabel}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to generate music right now.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadTrack = (track: GeneratedMusicPayload) => {
    const a = document.createElement('a');
    a.href = track.audioDataUrl;
    a.download = `jarvis-lyria-${Date.now()}.${track.mimeType.includes('wav') ? 'wav' : 'mp3'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full h-full min-h-[540px] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white text-black dark:bg-[#060606] dark:text-white flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Music className="w-4 h-4" />
          <h2 className="text-base font-display font-bold tracking-tight">
            Jarvis Lyria 3 Music Studio
          </h2>
          <span className="text-xs text-neutral-500 font-mono">
            lyria-3-clip-preview · lyria-3-pro-preview
          </span>
        </div>

        {/* Model Selector: 30s Clip vs Full-Length Track */}
        <div className="flex items-center rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black p-1 text-xs">
          <button
            type="button"
            onClick={() => setModelVariant('lyria-3-clip-preview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              modelVariant === 'lyria-3-clip-preview'
                ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Lyria 3 Clip (Up to 30s)
          </button>
          <button
            type="button"
            onClick={() => setModelVariant('lyria-3-pro-preview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              modelVariant === 'lyria-3-pro-preview'
                ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Lyria 3 Pro (Full Track)
          </button>
        </div>
      </div>

      {/* Quick-Try Preset Strip */}
      <div className="px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-900 bg-neutral-50/70 dark:bg-[#080808] flex items-center gap-2 overflow-x-auto text-xs">
        <span className="font-semibold text-neutral-500 shrink-0">Presets:</span>
        {PRESET_MUSIC_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setPrompt(preset.prompt);
              handleGenerateMusic(preset.prompt);
            }}
            disabled={isGenerating}
            className="shrink-0 px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-white hover:bg-neutral-100 dark:bg-[#111111] dark:hover:bg-neutral-800 text-black dark:text-neutral-200 font-medium transition disabled:opacity-50 cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-5 overflow-y-auto space-y-6">
        {/* Composer Card */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0c0c0c] p-4 space-y-3">
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Describe genre, instruments, tempo, mood, or vocals (optionally attach an image for visual inspiration)
          </label>

          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Generate a 30-second cinematic orchestral piece with soaring strings and deep percussion..."
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black px-3.5 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-neutral-600 resize-none"
          />

          {attachedImage && (
            <div className="inline-flex items-center gap-2.5 p-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] text-xs">
              <img
                src={attachedImage.dataUrl}
                alt={attachedImage.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-lg object-cover"
              />
              <span className="font-medium truncate max-w-[200px]">{attachedImage.name}</span>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white hover:bg-neutral-100 dark:bg-[#141414] dark:hover:bg-neutral-800 text-xs font-medium cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Inspire from Image</span>
              </button>
            </div>

            <button
              type="button"
              disabled={!prompt.trim() || isGenerating}
              onClick={() => handleGenerateMusic()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition disabled:opacity-40 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Composing Audio...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    Generate{' '}
                    {modelVariant === 'lyria-3-pro-preview' ? 'Full Track' : '30s Clip'}
                  </span>
                </>
              )}
            </button>
          </div>

          {errorMessage && (
            <div className="text-xs text-red-600 dark:text-red-400 font-medium">{errorMessage}</div>
          )}
        </div>

        {/* Generated Tracks List */}
        {tracks.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-neutral-500">
            <Disc3 className="w-10 h-10 mx-auto opacity-60" />
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Ready to compose original music
            </div>
            <p className="text-xs max-w-md mx-auto">
              Choose <strong>Lyria 3 Clip</strong> (`lyria-3-clip-preview`) for 30-second clips or{' '}
              <strong>Lyria 3 Pro</strong> (`lyria-3-pro-preview`) for full-length tracks, then click
              Generate or pick a preset above.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0d0d0d] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-display font-bold text-black dark:text-white">
                      {track.prompt}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500">
                      Model: {track.modelUsed} · {track.durationLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onShareTrackToChat && (
                      <button
                        type="button"
                        onClick={() => onShareTrackToChat(track)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#171717] text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Save to Chat</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadTrack(track)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>

                <audio controls src={track.audioDataUrl} className="w-full h-10" />

                {track.lyrics && (
                  <pre className="p-3 rounded-lg bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-xs font-sans whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 leading-relaxed max-h-48 overflow-y-auto">
                    {track.lyrics}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
