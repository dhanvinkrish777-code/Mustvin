import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Camera,
  CameraOff,
  ExternalLink,
  Globe,
  MapPin,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import { useJarvisPreferences } from '../contexts/JarvisPreferencesContext';
import type { GroundingSource } from '../contexts/JarvisSessionContext';
import { voiceCommander } from '../utils/voiceCommandService';
import { jarvisAudio } from '../utils/audioSystem';

export interface LiveVoiceLocationInfo {
  latitude?: number;
  longitude?: number;
  label?: string;
}

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation?: LiveVoiceLocationInfo | null;
  onSaveTurnToChat?: (
    userText: string,
    modelText: string,
    sources?: GroundingSource[]
  ) => void;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  userLocation,
  onSaveTurnToChat,
}) => {
  const { aiVoice, language } = useJarvisPreferences();

  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [searchEnabled, setSearchEnabled] = useState<boolean>(true);
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [jarvisTranscript, setJarvisTranscript] = useState<string>('');
  const [liveSources, setLiveSources] = useState<GroundingSource[]>([]);
  const [isModelSpeaking, setIsModelSpeaking] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMicMutedRef = useRef<boolean>(false);
  const turnUserBufRef = useRef<string>('');
  const turnModelBufRef = useRef<string>('');
  const turnSourcesRef = useRef<GroundingSource[]>([]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    if (!isOpen) return;

    jarvisAudio.stopSpeaking();
    voiceCommander.setExternalVoiceSessionActive(true);
    startLiveSession();

    return () => {
      cleanupLiveSession();
      voiceCommander.setExternalVoiceSessionActive(false);
    };
  }, [isOpen, aiVoice, language.label]);

  const stopCameraFeed = () => {
    if (videoIntervalRef.current !== null) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (videoElRef.current) {
      videoElRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  const handleToggleCamera = async () => {
    if (isCameraOn) {
      stopCameraFeed();
      return;
    }
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
      });
      camStreamRef.current = vStream;
      setIsCameraOn(true);

      requestAnimationFrame(() => {
        if (videoElRef.current) {
          videoElRef.current.srcObject = vStream;
          videoElRef.current.play().catch(() => {});
        }
      });

      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      videoIntervalRef.current = window.setInterval(() => {
        const ws = wsRef.current;
        const vid = videoElRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !vid || !ctx || vid.readyState < 2) return;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        const commaIdx = dataUrl.indexOf(',');
        const base64Jpeg = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        ws.send(JSON.stringify({ video: base64Jpeg, mimeType: 'image/jpeg' }));
      }, 1000);
    } catch {
      setErrorMsg('Camera permission is needed to share live video.');
    }
  };

  const stopScheduledPlayback = () => {
    scheduledSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    scheduledSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
    setIsModelSpeaking(false);
  };

  const playPcm24kChunk = (base64Audio: string) => {
    const outCtx = outputCtxRef.current;
    if (!outCtx) return;
    if (outCtx.state === 'suspended') {
      outCtx.resume().catch(() => {});
    }

    const floatSamples = base64Pcm16ToFloat32(base64Audio);
    if (floatSamples.length === 0) return;

    const audioBuffer = outCtx.createBuffer(1, floatSamples.length, 24000);
    audioBuffer.getChannelData(0).set(floatSamples);

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const startAt = Math.max(outCtx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    setIsModelSpeaking(true);

    scheduledSourcesRef.current.add(source);
    source.onended = () => {
      scheduledSourcesRef.current.delete(source);
      if (scheduledSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };
  };

  const startLiveSession = async () => {
    cleanupLiveSession();
    setStatus('connecting');
    setErrorMsg('');
    setUserTranscript('');
    setJarvisTranscript('');
    setLiveSources([]);
    turnUserBufRef.current = '';
    turnModelBufRef.current = '';
    turnSourcesRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      inputCtxRef.current = inCtx;
      outputCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        voice: aiVoice,
        lang: language.label,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      if (
        userLocation &&
        Number.isFinite(userLocation.latitude) &&
        Number.isFinite(userLocation.longitude)
      ) {
        params.set('lat', String(userLocation.latitude));
        params.set('lng', String(userLocation.longitude));
      }
      if (userLocation?.label) {
        params.set('loc', userLocation.label);
      }

      const wsUrl = `${proto}//${window.location.host}/ws/live?${params.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'ready') {
            setStatus('live');
            if (typeof msg.searchEnabled === 'boolean') {
              setSearchEnabled(msg.searchEnabled);
            }
          } else if (msg.type === 'audio' && msg.audio) {
            playPcm24kChunk(msg.audio);
          } else if (msg.type === 'input_transcript' && msg.text) {
            turnUserBufRef.current = (turnUserBufRef.current + ' ' + msg.text).trim();
            setUserTranscript(turnUserBufRef.current);
          } else if (msg.type === 'output_transcript' && msg.text) {
            turnModelBufRef.current = (turnModelBufRef.current + ' ' + msg.text).trim();
            setJarvisTranscript(turnModelBufRef.current);
          } else if (msg.type === 'sources' && Array.isArray(msg.sources)) {
            const combined = Array.from(
              new Map(
                [...turnSourcesRef.current, ...msg.sources].map((s: GroundingSource) => [s.uri, s])
              ).values()
            ).slice(0, 6);
            turnSourcesRef.current = combined;
            setLiveSources(combined);
          } else if (msg.type === 'interrupted') {
            stopScheduledPlayback();
          } else if (msg.type === 'turn_complete') {
            if (
              onSaveTurnToChat &&
              turnUserBufRef.current.trim() &&
              turnModelBufRef.current.trim()
            ) {
              onSaveTurnToChat(
                turnUserBufRef.current.trim(),
                turnModelBufRef.current.trim(),
                turnSourcesRef.current
              );
            }
            turnUserBufRef.current = '';
            turnModelBufRef.current = '';
            turnSourcesRef.current = [];
          } else if (msg.type === 'error') {
            setStatus('error');
            setErrorMsg(msg.error || 'Live voice connection interrupted.');
          }
        } catch {}
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMsg('Unable to reach live voice stream.');
      };

      const micSource = inCtx.createMediaStreamSource(stream);
      const processor = inCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMicMutedRef.current) return;
        const activeWs = wsRef.current;
        if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
        const pcmBase64 = float32ToBase64Pcm16(e.inputBuffer.getChannelData(0));
        activeWs.send(JSON.stringify({ audio: pcmBase64 }));
      };

      micSource.connect(processor);
      processor.connect(inCtx.destination);
    } catch {
      setStatus('error');
      setErrorMsg('Microphone permission is required for live two-way voice conversations.');
    }
  };

  const cleanupLiveSession = () => {
    stopScheduledPlayback();
    stopCameraFeed();
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-300 dark:border-neutral-800 bg-white text-black dark:bg-[#080808] dark:text-white p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-display font-bold">
              Google AI Mode · Live Voice
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              <span>{aiVoice}</span>
              <span aria-hidden="true">·</span>
              <span>{language.label}</span>
              {searchEnabled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span>Google Search Live</span>
                  </span>
                </>
              )}
              {userLocation?.label && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{userLocation.label}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 shrink-0">
            {status === 'connecting'
              ? 'Connecting...'
              : status === 'live'
              ? isModelSpeaking
                ? 'Speaking'
                : 'Listening'
              : 'Disconnected'}
          </span>
        </div>

        {/* Live Camera Feed or Audio Orb */}
        <div className="py-4 flex flex-col items-center justify-center space-y-4">
          {isCameraOn ? (
            <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-800 bg-black aspect-4/3">
              <video
                ref={videoElRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] flex items-center justify-between">
                <span>Live Vision Active</span>
                <span>{isModelSpeaking ? 'Jarvis speaking...' : 'Ask about what you show'}</span>
              </div>
            </div>
          ) : (
            <div
              className={`w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isModelSpeaking
                  ? 'scale-110 border-emerald-500 bg-emerald-500/10'
                  : status === 'live' && !isMicMuted
                  ? 'scale-100 border-black dark:border-white bg-neutral-100 dark:bg-neutral-900'
                  : 'scale-95 border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-[#111111]'
              }`}
            >
              {isModelSpeaking ? (
                <Volume2 className="w-10 h-10 text-emerald-500 animate-pulse" />
              ) : (
                <AudioLines className="w-10 h-10 text-black dark:text-white" />
              )}
            </div>
          )}

          {status === 'error' ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-xs text-red-600 dark:text-red-400 max-w-xs">{errorMsg}</p>
              <button
                type="button"
                onClick={startLiveSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 text-center">
              {status === 'connecting'
                ? 'Connecting real-time Gemini Live voice stream...'
                : isMicMuted
                ? 'Microphone muted'
                : 'Speak naturally — ask anything, interrupt anytime'}
            </p>
          )}
        </div>

        {/* Live Transcripts */}
        {(userTranscript || jarvisTranscript) && (
          <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] space-y-2 text-xs max-h-36 overflow-y-auto">
            {userTranscript && (
              <div>
                <span className="font-semibold text-neutral-500">You: </span>
                <span>{userTranscript}</span>
              </div>
            )}
            {jarvisTranscript && (
              <div>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Jarvis:{' '}
                </span>
                <span>{jarvisTranscript}</span>
              </div>
            )}
          </div>
        )}

        {/* Grounded Web Sources Discovered During Live Voice */}
        {liveSources.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] font-medium text-neutral-500">
              Live Google Search Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {liveSources.map((src, idx) => (
                <a
                  key={idx}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#121212] text-[11px] hover:underline max-w-[210px]"
                >
                  <Globe className="w-3 h-3 shrink-0 text-neutral-500" />
                  <span className="truncate">{src.domain || src.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 text-neutral-400" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setIsMicMuted((m) => !m)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
              isMicMuted
                ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#141414] text-black dark:text-white'
            }`}
          >
            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleCamera}
            disabled={status !== 'live'}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition disabled:opacity-40 cursor-pointer ${
              isCameraOn
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#141414] text-black dark:text-white'
            }`}
          >
            {isCameraOn ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            <span>{isCameraOn ? 'Stop Camera' : 'Share Camera'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Voice</span>
          </button>
        </div>
      </div>
    </div>
  );
};
