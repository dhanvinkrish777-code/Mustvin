import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AudioLines,
  Camera,
  Check,
  Copy,
  CornerDownRight,
  ExternalLink,
  FileAudio,
  FileUp,
  Globe,
  ImagePlus,
  LocateFixed,
  MapPin,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { jarvisAudio } from '../utils/audioSystem';
import { voiceCommander, type ActiveMicMode } from '../utils/voiceCommandService';
import { generateOfflineResponse, saveToOfflineCache } from '../utils/offlineBrain';
import {
  useJarvisSession,
  createWelcomeMessage,
  type AiModeData,
  type ChatMessage,
  type GeneratedImagePayload,
  type GeneratedMusicPayload,
  type GroundingSource,
} from '../contexts/JarvisSessionContext';
import { useJarvisPreferences } from '../contexts/JarvisPreferencesContext';
import { AiModeCard } from './AiModeCard';
import { CameraCaptureModal } from './CameraCaptureModal';
import { LiveVoiceModal } from './LiveVoiceModal';
import { NotebookMathRenderer, mathToSpokenPlainText } from './NotebookMathRenderer';
import { WorkspaceActionCard, type WorkspaceActionPayload } from './WorkspaceActionCard';
import {
  requestAiPresentation,
  requestAiDocument,
  requestAiSpreadsheet,
  requestAiEmail,
} from '../services/aiWorkspaceClient';
import {
  createGoogleDoc,
  createGooglePresentation,
  createGoogleSheet,
} from '../services/googleWorkspaceService';

const MAX_UPLOAD_PHOTOS = 15;

type ChatbotModelTier = 'auto' | 'fast' | 'general' | 'complex';
type ChatbotRolePersona = 'assistant' | 'bioscience' | 'architect' | 'analyst';
type StudioAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type StudioImageSize = '1K' | '2K' | '4K';

interface AttachedPhoto {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

interface AttachedLargeFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

interface JarvisChatProps {
  isGlobalMuted?: boolean;
  isOfflineMode?: boolean;
  externalQuestion?: { id: string; text: string } | null;
  clearSignal?: number;
  micMode?: ActiveMicMode;
  onSetMicMode?: (mode: ActiveMicMode) => void;
  wakeWordOnly?: boolean;
  onToggleWakeWordOnly?: () => void;
  onStatusUpdate?: (status: string) => void;
  onOpenWorkspaceTab?: (tab: 'docs' | 'sheets' | 'slides' | 'excel' | 'gmail') => void;
}

function extractTopicFromPrompt(rawInput: string): string {
  if (!rawInput || !rawInput.trim()) return '';
  let s = rawInput.trim();
  s = s.replace(/^(?:(?:hey|ok|okay|hi)\s+)?(?:jarvis|javis)[\s,.:;-]+/i, '');
  s = s.replace(
    /^(?:can you|could you|would you|will you|please|kindly|i want you to|i need you to|help me to?|let's)\s+/gi,
    ''
  );
  s = s.replace(/^(?:please|just|quickly)\s+/i, '');
  s = s.replace(
    /\s+(?:and\s+)?(?:paste|put|save|insert|add|keep|store)\s+(?:it|this|that|everything|the\s+(?:content|thing|info|information))?\s*(?:in|into|to|on)\s+(?:a\s+|my\s+|new\s+)?(?:google\s*)?(?:docs?|documents?|slides?|presentations?|sheets?|spreadsheets?|excel(?:\s*file)?|drive)\b.*$/i,
    ''
  );
  s = s.replace(
    /\s+(?:and\s+)?(?:apply|with|using)\s+(?:a\s+|an\s+|the\s+)?(?:matching|proper|appropriate|custom|dynamic|cool|nice|topic)?\s*(?:theme|background|style|palette|colors?)\b.*$/i,
    ''
  );
  s = s.replace(
    /\s+(?:in|into|to)\s+(?:a\s+|new\s+)?(?:google\s*)?(?:docs?|documents?|slides?|presentations?|sheets?|spreadsheets?|excel)\s*$/i,
    ''
  );

  const commandLeadRegex =
    /^(?:(?:search(?:\s+the\s+web)?|look\s*up|find|get|research|analyze|explain|tell\s+me)\s+(?:the\s+)?(?:right\s+|accurate\s+|detailed\s+)?(?:info|information|details|facts)\s+(?:about|on|for|regarding)\s+|(?:make|create|generate|build|prepare|design|draft|write|compose|produce|give\s+me|put|paste|save|insert|copy|add)\s+(?:(?:a|an|the|some|new|detailed|comprehensive|full|clear|proper|good)\s+)*(?:(?:google|microsoft|ms)\s+)?(?:(?:slides?|docs?|sheets?|excel)\s+)?(?:slides?\s*deck|presentations?|slide\s*decks?|slides?|pitch\s*decks?|ppt|powerpoint|docs?|documents?|reports?|proposals?|articles?|essays?|notes?|summaries|summary|sheets?|spreadsheets?|excel(?:\s+(?:sheets?|workbooks?|models?|tables?|files?))?|workbooks?|tables?|information|info|content)?\s*(?:about|on|regarding|covering|for|of|titled|called|named)?\s*)/i;

  let prev = '';
  let guard = 0;
  while (s !== prev && guard < 4) {
    prev = s;
    s = s.replace(commandLeadRegex, '').trim();
    guard++;
  }

  s = s
    .replace(
      /^(?:(?:presentation|slide\s*deck|slides?|document|docs?|spreadsheet|sheets?|excel|report|proposal)\s+)?(?:about|on|regarding|covering|for)\s+/i,
      ''
    )
    .trim();
  s = s
    .replace(/\s+(?:for me|please|right now|properly|with clearance|in detail)\s*[.?!]*$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[?!.]+$/g, '')
    .trim();

  return s;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSourceDomain(src: GroundingSource): string {
  if (src.domain && src.domain.trim()) return src.domain.trim();
  try {
    return new URL(src.uri).hostname.replace(/^www\./i, '');
  } catch {
    return src.sourceType === 'maps' ? 'maps.google.com' : 'google.com';
  }
}

interface UserLocationState {
  latitude?: number;
  longitude?: number;
  label?: string;
  source?: 'gps' | 'ip';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read audio data'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function compressImageFileToDataUrl(file: File): Promise<{
  name: string;
  mimeType: string;
  dataUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const rawUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ name: file.name, mimeType: file.type || 'image/jpeg', dataUrl: rawUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          name: file.name,
          mimeType: 'image/jpeg',
          dataUrl: compressed,
        });
      };
      img.onerror = () =>
        resolve({ name: file.name, mimeType: file.type || 'image/jpeg', dataUrl: rawUrl });
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}



export const JarvisChat: React.FC<JarvisChatProps> = ({
  isGlobalMuted = false,
  isOfflineMode = false,
  externalQuestion = null,
  clearSignal = 0,
  micMode = 'off',
  onSetMicMode,
  wakeWordOnly = false,
  onToggleWakeWordOnly,
  onStatusUpdate,
  onOpenWorkspaceTab,
}) => {
  const {
    activeChatId,
    activeMessages: messages,
    setActiveMessagesOptimistic: setMessages,
    persistConversationTurn,
    startNewChat,
    workspaceToken,
    getValidWorkspaceToken,
    signInWithGoogle,
  } = useJarvisSession();

  const { language, aiVoice } = useJarvisPreferences();

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [speechActive, setSpeechActive] = useState<boolean>(false);
  const [audioAutoSpeak, setAudioAutoSpeak] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Multi-turn Gemini Chatbot Tier & Persona Controls
  const [modelTier, setModelTier] = useState<ChatbotModelTier>('auto');
  const [rolePersona, setRolePersona] = useState<ChatbotRolePersona>('assistant');

  // Image Creation & Modification Studio Options (`gemini-nano-banana-2.1`)
  const [showImageStudioBar, setShowImageStudioBar] = useState<boolean>(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<StudioAspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<StudioImageSize>('1K');

  // Audio Transcription State (`gemini-3.5-transcribe`)
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState<boolean>(false);

  // Unified Upload Menu & Attachments State
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState<boolean>(false);
  const [isCameraCaptureOpen, setIsCameraCaptureOpen] = useState<boolean>(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState<boolean>(false);
  const [attachedPhotos, setAttachedPhotos] = useState<AttachedPhoto[]>([]);
  const [attachedLargeFiles, setAttachedLargeFiles] = useState<AttachedLargeFile[]>([]);
  const [uploadLimitNotice, setUploadLimitNotice] = useState<string>('');
  const [selectedModifyTarget, setSelectedModifyTarget] = useState<{
    dataUrl: string;
    label: string;
  } | null>(null);

  // Google AI Mode Search / Maps Grounding + Automatic IP & Precise GPS Location
  const [groundingPreference, setGroundingPreference] = useState<'auto' | 'search' | 'maps'>(
    'auto'
  );
  const [userLocation, setUserLocation] = useState<UserLocationState | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const largeFileInputRef = useRef<HTMLInputElement>(null);
  const audioTranscribeInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const messagesRef = useRef<ChatMessage[]>(messages);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const userLocationRef = useRef<UserLocationState | null>(userLocation);
  const activeAbortRef = useRef<AbortController | null>(null);
  const processedQuestionIdRef = useRef<string>('');
  const lastClearSignalRef = useRef<number>(clearSignal);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Close upload popover when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setIsUploadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (clearSignal !== lastClearSignalRef.current) {
      lastClearSignalRef.current = clearSignal;
      handleClearErrorsOnly();
    }
  }, [clearSignal]);

  useEffect(() => {
    const unsubscribeSpeaking = jarvisAudio.subscribeSpeakingChange((speaking) => {
      setSpeechActive(speaking);
      if (!speaking) {
        voiceCommander.notifyJarvisStoppedSpeaking();
      }
    });

    return () => {
      unsubscribeSpeaking();
      activeAbortRef.current?.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (
      externalQuestion &&
      externalQuestion.id !== processedQuestionIdRef.current &&
      externalQuestion.text.trim()
    ) {
      processedQuestionIdRef.current = externalQuestion.id;
      handleSendMessage(externalQuestion.text);
    }
  }, [externalQuestion]);

  // Find most recent generated or uploaded image in the active conversation for follow-up modifications
  const latestConversationImage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.generatedImage?.imageUrl) {
        return { dataUrl: m.generatedImage.imageUrl, mimeType: 'image/png' };
      }
      if (m.attachedPhotoUrls && m.attachedPhotoUrls.length > 0) {
        return { dataUrl: m.attachedPhotoUrls[0], mimeType: 'image/jpeg' };
      }
    }
    return null;
  }, [messages]);

  const isPromptLikelyImageTask = useMemo(() => {
    return /\b(create|generate|draw|paint|render|make|modify|edit|change|replace|transform)\b[\s\S]*\b(image|picture|photo|wallpaper|illustration|background|logo|poster)\b/i.test(
      inputPrompt
    );
  }, [inputPrompt]);

  const resolveServerLocationLabel = async (coords?: {
    latitude: number;
    longitude: number;
  }): Promise<UserLocationState | null> => {
    try {
      const qs = coords
        ? `?lat=${encodeURIComponent(String(coords.latitude))}&lng=${encodeURIComponent(
            String(coords.longitude)
          )}`
        : '';
      const res = await fetch(`/api/jarvis/location${qs}`);
      if (!res.ok) return coords ? { ...coords, source: 'gps' } : null;
      const data = await res.json();
      const next: UserLocationState = {
        latitude:
          typeof data?.latitude === 'number' ? data.latitude : coords?.latitude,
        longitude:
          typeof data?.longitude === 'number' ? data.longitude : coords?.longitude,
        label: typeof data?.label === 'string' && data.label.trim() ? data.label.trim() : undefined,
        source: coords || data?.source === 'gps' ? 'gps' : 'ip',
      };
      if (next.label || (next.latitude !== undefined && next.longitude !== undefined)) {
        return next;
      }
      return null;
    } catch {
      return coords ? { ...coords, source: 'gps' } : null;
    }
  };

  const requestPreciseLocation = async (
    silent = false
  ): Promise<UserLocationState | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!silent) onStatusUpdate?.('Precise browser geolocation is unavailable on this device.');
      return userLocationRef.current;
    }

    setIsLocating(true);
    try {
      const coords = await new Promise<{ latitude: number; longitude: number } | null>(
        (resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: silent ? 3500 : 7000, maximumAge: 180000 }
          );
        }
      );

      if (!coords) {
        if (!silent) {
          onStatusUpdate?.(
            'Location permission declined — using approximate regional location.'
          );
        }
        return userLocationRef.current;
      }

      const enriched = await resolveServerLocationLabel(coords);
      const finalLoc: UserLocationState = enriched || {
        ...coords,
        label: `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`,
        source: 'gps',
      };
      setUserLocation(finalLoc);
      userLocationRef.current = finalLoc;
      if (!silent) {
        onStatusUpdate?.(
          `Precise location active: ${finalLoc.label || 'GPS coordinates locked'}`
        );
      }
      return finalLoc;
    } finally {
      setIsLocating(false);
    }
  };

  // Automatic Google AI Mode Location Access on load:
  // 1) Immediately detect approximate city/region/country via IP (zero permission popup).
  // 2) If browser geolocation permission is already granted, upgrade automatically to Precise GPS.
  useEffect(() => {
    let cancelled = false;

    const initLocation = async () => {
      const ipLoc = await resolveServerLocationLabel();
      if (!cancelled && ipLoc && userLocationRef.current?.source !== 'gps') {
        setUserLocation(ipLoc);
        userLocationRef.current = ipLoc;
      }

      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({
            name: 'geolocation' as PermissionName,
          });
          if (!cancelled && perm.state === 'granted') {
            await requestPreciseLocation(true);
          }
          perm.onchange = () => {
            if (!cancelled && perm.state === 'granted') {
              requestPreciseLocation(true);
            }
          };
        } catch {}
      }
    };

    initLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearErrorsOnly = () => {
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    jarvisAudio.stopSpeaking();
    setIsLoading(false);
    setInputPrompt('');

    setMessages((prev) => {
      const clean = prev.filter((m) => !m.isError);
      return clean.length > 0 ? clean : [createWelcomeMessage()];
    });
    onStatusUpdate?.('Errors cleared.');
  };

  const handleCopyText = (content: string, key: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(key);
    setTimeout(() => {
      setCopiedId((curr) => (curr === key ? null : curr));
    }, 1800);
  };

  // Transcribe Audio Blob via `POST /api/jarvis/transcribe` (`gemini-3.5-transcribe`)
  const submitAudioBlobForTranscription = async (blob: Blob, fallbackMime: string) => {
    if (!blob || blob.size === 0) return;
    setIsTranscribingAudio(true);
    onStatusUpdate?.('Transcribing audio with gemini-3.5-transcribe...');
    try {
      const audioBase64 = await blobToBase64(blob);
      const mimeType = (blob.type || fallbackMime || 'audio/webm').split(';')[0];
      const res = await fetch('/api/jarvis/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          language: language.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Audio transcription failed.');
      }
      const transcript = String(data?.transcript || '').trim();
      if (transcript) {
        setInputPrompt((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        onStatusUpdate?.(`Transcribed (${data?.modelUsed || 'gemini-3.5-transcribe'}).`);
      } else {
        onStatusUpdate?.('No speech detected in audio recording.');
      }
    } catch (err: any) {
      onStatusUpdate?.(err?.message || 'Audio transcription failed.');
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  const handleToggleAudioTranscription = async () => {
    if (isTranscribingAudio) return;

    if (isRecordingAudio && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      setIsRecordingAudio(false);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onStatusUpdate?.('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordedAudioChunksRef.current = [];

      const preferredMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const supportedMime =
        typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
          : '';

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordedAudioChunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || supportedMime || 'audio/webm';
        const audioBlob = new Blob(recordedAudioChunksRef.current, { type: mime });
        recordedAudioChunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingAudio(false);
        submitAudioBlobForTranscription(audioBlob, mime);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
      jarvisAudio.playAcknowledgeSound();
      onStatusUpdate?.('Recording voice clip — click Stop to transcribe with gemini-3.5-transcribe.');
    } catch {
      onStatusUpdate?.('Microphone permission is required for audio transcription.');
    }
  };

  const handleSelectAudioForTranscription = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setIsUploadMenuOpen(false);
    if (!file) return;
    await submitAudioBlobForTranscription(file, file.type || 'audio/mpeg');
  };

  // Photo Upload Handler (Enforces strict maximum of 15 photos)
  const handleSelectPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    setIsUploadMenuOpen(false);
    if (fileList.length === 0) return;

    const currentCount = attachedPhotos.length;
    const remainingSlots = MAX_UPLOAD_PHOTOS - currentCount;
    if (remainingSlots <= 0) {
      setUploadLimitNotice(`Maximum limit of ${MAX_UPLOAD_PHOTOS} photos reached (15/15).`);
      return;
    }

    const acceptedFiles = fileList.slice(0, remainingSlots);
    if (fileList.length > remainingSlots) {
      setUploadLimitNotice(
        `Added ${acceptedFiles.length} photo(s). Maximum of ${MAX_UPLOAD_PHOTOS} photos reached (15/15).`
      );
    } else {
      setUploadLimitNotice('');
    }

    const compressed = await Promise.all(
      acceptedFiles.map((file) => compressImageFileToDataUrl(file))
    );

    const newPhotos: AttachedPhoto[] = compressed.map((item, idx) => ({
      id: `ph_${Date.now()}_${idx}`,
      name: item.name,
      mimeType: item.mimeType,
      dataUrl: item.dataUrl,
    }));

    setAttachedPhotos((prev) => [...prev, ...newPhotos].slice(0, MAX_UPLOAD_PHOTOS));
  };

  const handleCameraPhotoCaptured = (photo: {
    name: string;
    mimeType: string;
    dataUrl: string;
  }) => {
    setAttachedPhotos((prev) => {
      if (prev.length >= MAX_UPLOAD_PHOTOS) {
        setUploadLimitNotice(`Maximum limit of ${MAX_UPLOAD_PHOTOS} photos reached (15/15).`);
        return prev;
      }
      setUploadLimitNotice('');
      return [
        ...prev,
        {
          id: `cam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ...photo,
        },
      ];
    });
  };

  // Large File Upload Handler (Streams to `/api/jarvis/files/upload` with live progress)
  const handleSelectLargeFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setIsUploadMenuOpen(false);
    if (files.length === 0) return;

    files.forEach((file) => {
      const fileId = `lf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const entry: AttachedLargeFile = {
        id: fileId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uri: '',
        uploading: true,
        progress: 5,
      };
      setAttachedLargeFiles((prev) => [...prev, entry]);

      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100));
          setAttachedLargeFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, progress: pct } : f))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            setAttachedLargeFiles((prev) =>
              prev.map((f) =>
                f.id === fileId
                  ? {
                      ...f,
                      uri: resp.uri || '',
                      mimeType: resp.mimeType || f.mimeType,
                      uploading: false,
                      progress: 100,
                    }
                  : f
              )
            );
            onStatusUpdate?.(`Large file ready: ${file.name}`);
            return;
          } catch {}
        }
        setAttachedLargeFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, uploading: false, error: 'Upload failed — remove or retry.' }
              : f
          )
        );
      };

      xhr.onerror = () => {
        setAttachedLargeFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, uploading: false, error: 'Network error while uploading file.' }
              : f
          )
        );
      };

      xhr.open('POST', '/api/jarvis/files/upload');
      xhr.send(formData);
    });
  };

  const handleSaveLiveVoiceTurn = async (
    userSpoken: string,
    jarvisSpoken: string,
    sources?: GroundingSource[]
  ) => {
    const nowOrder = Date.now();
    const uMsg: ChatMessage = {
      id: `live_u_${nowOrder}`,
      role: 'user',
      text: userSpoken,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clientOrder: nowOrder,
    };
    const mMsg: ChatMessage = {
      id: `live_m_${nowOrder + 1}`,
      role: 'model',
      text: jarvisSpoken,
      fullText: jarvisSpoken,
      modelUsed: 'gemini-3.8-live',
      sources: sources && sources.length > 0 ? sources : undefined,
      locationUsed: userLocationRef.current?.label,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clientOrder: nowOrder + 1,
    };

    setMessages((prev) => [...prev.filter((m) => m.id !== 'msg-welcome'), uMsg, mMsg]);
    try {
      await persistConversationTurn({
        existingChatId: activeChatIdRef.current,
        userMessage: uMsg,
        modelMessage: mMsg,
      });
    } catch {}
  };

  const handleSendMessage = async (promptToSend?: string) => {
    const rawInput = (promptToSend !== undefined ? promptToSend : inputPrompt).trim();
    const readyLargeFiles = attachedLargeFiles.filter((f) => !f.uploading && f.uri);
    const hasStillUploading = attachedLargeFiles.some((f) => f.uploading);

    if (hasStillUploading) {
      onStatusUpdate?.('Please wait a moment for the large file upload to finish.');
      return;
    }

    if (!rawInput && attachedPhotos.length === 0 && readyLargeFiles.length === 0) return;

    if (
      rawInput &&
      attachedPhotos.length === 0 &&
      readyLargeFiles.length === 0 &&
      voiceCommander.evaluateCommand(rawInput)
    ) {
      setInputPrompt('');
      return;
    }

    const text =
      rawInput
        .replace(/^(?:hey\s+|ok\s+|okay\s+|hi\s+)?(?:jarvis|javis)[\s,.:;-]+/i, '')
        .trim() ||
      rawInput ||
      (attachedPhotos.length > 0
        ? `Analyze ${attachedPhotos.length} uploaded photo${attachedPhotos.length > 1 ? 's' : ''}`
        : `Analyze ${readyLargeFiles.map((f) => f.name).join(', ')}`);

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    jarvisAudio.stopSpeaking();
    jarvisAudio.playAcknowledgeSound();

    const photosPayload = attachedPhotos.slice(0, MAX_UPLOAD_PHOTOS).map((p) => ({
      name: p.name,
      mimeType: p.mimeType,
      dataUrl: p.dataUrl,
    }));
    const largeFilesPayload = readyLargeFiles.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      uri: f.uri,
      size: f.size,
    }));
    const modifyTargetNow = selectedModifyTarget;

    setInputPrompt('');
    setAttachedPhotos([]);
    setAttachedLargeFiles([]);
    setUploadLimitNotice('');
    setSelectedModifyTarget(null);

    const sessionIdAtStart = activeChatIdRef.current;
    const nowOrder = Date.now();
    const userMsg: ChatMessage = {
      id: `usr_${nowOrder}`,
      role: 'user',
      text,
      attachedPhotoUrls: photosPayload.map((p) => p.dataUrl),
      attachedFileNames: largeFilesPayload.map((f) => `${f.name} (${formatBytes(f.size)})`),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clientOrder: nowOrder,
    };

    const priorConversation = messagesRef.current
      .filter(
        (m) =>
          m.id !== 'msg-welcome' &&
          m.id !== 'msg-0' &&
          !m.isError &&
          (m.fullText || m.text).trim().length > 0
      )
      .slice(-12)
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.fullText || m.text }],
      }));

    setMessages((prev) => [
      ...prev.filter((m) => !m.isError && m.id !== 'msg-welcome'),
      userMsg,
    ]);
    setIsLoading(true);
    onStatusUpdate?.(`Processing: "${text.slice(0, 55)}${text.length > 55 ? '...' : ''}"`);

    // Refresh Precise GPS non-blockingly in the background when query involves local/nearby/weather/maps context
    const resolvedLocation = userLocationRef.current;
    if (
      resolvedLocation?.source !== 'gps' &&
      (groundingPreference === 'maps' ||
        /\b(near me|nearby|closest|around here|in my area|restaurants|cafes|coffee|hotels|places near|pharmacy|hospital|atm|weather|directions|open now)\b/i.test(
          text
        ))
    ) {
      void requestPreciseLocation(true);
    }

    const locationPayload = {
      ...(resolvedLocation?.latitude !== undefined && resolvedLocation?.longitude !== undefined
        ? { latitude: resolvedLocation.latitude, longitude: resolvedLocation.longitude }
        : {}),
      ...(resolvedLocation?.label ? { label: resolvedLocation.label } : {}),
      ...(resolvedLocation?.source ? { source: resolvedLocation.source } : {}),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      localTime: new Date().toLocaleString(),
    };

    const aiMsgId = `ai_${nowOrder + 1}`;
    let messageInserted = false;
    let accumulatedText = '';
    let finalSources: GroundingSource[] = [];
    let finalSearchQueries: string[] = [];
    let finalFollowUps: string[] = [];
    let finalModelUsed: string | undefined;
    let finalAiMode: AiModeData | undefined;
    let finalGeneratedImage: GeneratedImagePayload | undefined;
    let finalGeneratedMusic: GeneratedMusicPayload | undefined;
    let finalWorkspaceAction: WorkspaceActionPayload | undefined;

    const cleanTopic = extractTopicFromPrompt(text);
    const isReferentialPasteTarget =
      /^(?:(?:the\s+)?thing|it|this|that|above|previous|last(?:\s+(?:answer|response|message|output|text))?|same|them|something)$/i.test(
        cleanTopic
      ) ||
      cleanTopic.length < 2 ||
      /^\s*(?:please\s+)?(?:paste|put|save|copy|add)\s+(?:the\s+thing|it|this|that|the\s+above|the\s+last(?:\s+(?:answer|response|message))?)\s+(?:in|into|to)\s+(?:a\s+|new\s+)?(?:google\s*)?docs?\s*[.?!]*$/i.test(
        text
      );

    // Only treat as "paste prior chat output into Google Docs" if user did NOT specify a new topic
    const isPastePreviousDocIntent =
      /\b(paste|put|save|insert|copy|add)\b/i.test(text) &&
      /\b(in\s+(?:a\s+|new\s+)?google\s*docs?|into\s+(?:a\s+|new\s+)?google\s*docs?|to\s+(?:a\s+|new\s+)?google\s*docs?|in\s+(?:a\s+|new\s+)?docs?|into\s+(?:a\s+|new\s+)?docs?)\b/i.test(
        text
      ) &&
      isReferentialPasteTarget;

    // Detect if user is asking to create/edit Google Slides, Docs, Sheets, Microsoft Excel, or Gmail
    const isEmailIntent =
      /\b(email|mail|gmail|message to|draft an email|compose an email|send an email|write an email|send a mail|draft a mail)\b/i.test(
        text
      );

    const isSlidesIntent =
      /\b(presentation|presentations|slide\s*deck|slides?|pitch\s*deck|google\s*slides?|ppt|powerpoint)\b/i.test(
        text
      ) &&
      /\b(make|create|generate|build|prepare|design|draft|add|edit|theme|style|give)\b/i.test(text);

    const isExcelIntent =
      /\b(excel|xlsx|\.xlsx|excel\s*sheet|excel\s*model|excel\s*workbook)\b/i.test(text) &&
      /\b(make|create|generate|build|edit|formula|calculate|model|spreadsheet|prepare)\b/i.test(
        text
      );

    const isSheetIntent =
      !isExcelIntent &&
      /\b(spreadsheet|spreadsheets|google\s*sheet|google\s*sheets|sheets?|tabular|table)\b/i.test(
        text
      ) &&
      /\b(make|create|generate|build|edit|calculate|update|prepare)\b/i.test(text);

    const isDocIntent =
      !isEmailIntent &&
      !isSlidesIntent &&
      !isExcelIntent &&
      !isSheetIntent &&
      !isPastePreviousDocIntent &&
      (/\b(google\s*docs?|document|docs?|proposal|report|memo|contract|brief|article|essay|notes?)\b/i.test(
        text
      ) &&
        /\b(make|create|generate|write|draft|edit|summarize|compose|prepare|paste|put|save|add)\b/i.test(
          text
        ));

    const isComprehensiveWorkspaceIntent =
      /\b(presentation|slides)\b/i.test(text) &&
      /\b(doc|docs)\b/i.test(text) &&
      /\b(spreadsheet|excel|sheets)\b/i.test(text);

    const isExplicitGoogleWorkspaceIntent =
      isPastePreviousDocIntent ||
      isEmailIntent ||
      isSlidesIntent ||
      (isDocIntent && /\b(google\s*docs?|docs?)\b/i.test(text)) ||
      (isSheetIntent && /\b(google\s*sheets?)\b/i.test(text)) ||
      isComprehensiveWorkspaceIntent ||
      /\b(google\s*(workspace|doc|docs|sheet|sheets|slide|slides|drive)|gmail)\b/i.test(text);

    const currentValidToken = await getValidWorkspaceToken();

    // Alert if user requested Google Workspace operation while not signed in
    if (isExplicitGoogleWorkspaceIntent && !currentValidToken) {
      setIsLoading(false);
      const alertText = `⚠️ **Google Workspace Not Connected**\n\nYou haven't logged in to Google Workspace yet, Sir. To create or edit Google Docs, Google Sheets, Google Slides presentations, or compose and dispatch emails via Gmail, please connect your Google account.`;

      const aiReplyMsg: ChatMessage = {
        id: aiMsgId,
        role: 'model',
        text: alertText,
        fullText: alertText,
        requiresWorkspaceAuth: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clientOrder: nowOrder + 1,
      };

      setMessages((prev) => [...prev, aiReplyMsg]);
      onStatusUpdate?.('Google Workspace authentication required.');

      if (audioAutoSpeak && !isGlobalMuted) {
        setSpeechActive(true);
        jarvisAudio.speak(
          'Alert: You have not logged in to Google Workspace yet, Sir. Please connect your Google account first.',
          { onEnd: () => setSpeechActive(false) }
        );
      }

      await persistConversationTurn({
        existingChatId: sessionIdAtStart,
        userMessage: userMsg,
        modelMessage: aiReplyMsg,
      });

      return;
    }

    // Referential paste: "paste the thing in google docs" / "paste this into docs"
    if (isPastePreviousDocIntent && currentValidToken) {
      setIsLoading(false);
      onStatusUpdate?.('Creating Google Doc and pasting previous content...');

      let contentToPaste = '';
      const explicitMatch = text.match(
        /(?:paste|save|put)\s+(?:the following|this|content)?\s*[:]\s*([\s\S]+)/i
      );
      if (explicitMatch && explicitMatch[1]?.trim()) {
        contentToPaste = explicitMatch[1].trim();
      }

      let derivedTopicTitle = '';
      if (!contentToPaste) {
        const revIdx = [...messagesRef.current]
          .reverse()
          .findIndex(
            (m) =>
              m.role === 'model' &&
              m.id !== 'msg-welcome' &&
              !m.isError &&
              !m.requiresWorkspaceAuth &&
              (m.fullText || m.text)?.trim()
          );

        if (revIdx !== -1) {
          const actualIdx = messagesRef.current.length - 1 - revIdx;
          const previousModelMsg = messagesRef.current[actualIdx];
          const rawContent =
            previousModelMsg.workspaceAction?.docContent ||
            previousModelMsg.fullText ||
            previousModelMsg.text;

          // Strip previous Open in Google Docs links if pasting a prior summary
          contentToPaste = rawContent
            .replace(/\n*\[Open in Google Docs[^\]]*\]\([^)]*\)\s*/gi, '')
            .trim();

          // Check preceding user prompt for a clean topic title
          const precedingUserMsg = messagesRef.current
            .slice(0, actualIdx)
            .reverse()
            .find((m) => m.role === 'user');
          if (precedingUserMsg?.text) {
            const cleanedPrev = extractTopicFromPrompt(precedingUserMsg.text);
            if (cleanedPrev && cleanedPrev.length >= 2 && cleanedPrev.length <= 65) {
              derivedTopicTitle = cleanedPrev.replace(/\b\w/g, (c) => c.toUpperCase());
            }
          }
          if (!derivedTopicTitle && previousModelMsg.workspaceAction?.title) {
            derivedTopicTitle = previousModelMsg.workspaceAction.title;
          }
        }
      }

      if (!contentToPaste || !contentToPaste.trim()) {
        contentToPaste = text;
      }

      let docTitle = derivedTopicTitle || 'Jarvis AI Document';
      if (!derivedTopicTitle) {
        const firstLine =
          contentToPaste.split('\n').find((l) => l.trim().length > 0) || '';
        const cleanFirstLine = firstLine.replace(/^[#* \-_]+/, '').trim();
        if (cleanFirstLine && cleanFirstLine.length <= 60) {
          docTitle = cleanFirstLine;
        } else {
          docTitle = `Document ${new Date().toLocaleDateString()}`;
        }
      }

      try {
        const createdDoc = await createGoogleDoc(currentValidToken, docTitle, contentToPaste);
        const replyText = `I have created a new Google Doc titled **"${createdDoc.title}"** and pasted the content into it, Sir.\n\n[Open in Google Docs ↗](${createdDoc.webViewLink})`;

        const pasteWorkspaceAction: WorkspaceActionPayload = {
          type: 'doc',
          title: createdDoc.title,
          summary: `Pasted content into new Google Document (${(createdDoc.bodyText || contentToPaste).length} characters). Ready to view and edit in Google Docs.`,
          docContent: createdDoc.bodyText || contentToPaste,
          createdUrl: createdDoc.webViewLink,
          createdId: createdDoc.id,
        };

        const aiReplyMsg: ChatMessage = {
          id: aiMsgId,
          role: 'model',
          text: replyText,
          fullText: replyText,
          workspaceAction: pasteWorkspaceAction,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          clientOrder: nowOrder + 1,
        };

        setMessages((prev) => [...prev, aiReplyMsg]);
        onStatusUpdate?.(`Created Google Doc: ${createdDoc.title}`);

        if (audioAutoSpeak && !isGlobalMuted) {
          setSpeechActive(true);
          jarvisAudio.speak(
            `I have created a new Google Doc titled ${createdDoc.title} and pasted the content into it, Sir.`,
            { onEnd: () => setSpeechActive(false) }
          );
        }

        await persistConversationTurn({
          existingChatId: sessionIdAtStart,
          userMessage: userMsg,
          modelMessage: aiReplyMsg,
        });

        return;
      } catch (err: any) {
        console.error('Failed to create doc and paste content:', err);
        const errText = `⚠️ Failed to create Google Doc: ${err?.message || 'Authentication or network error'}. Please verify your Google Workspace connection.`;
        const aiReplyMsg: ChatMessage = {
          id: aiMsgId,
          role: 'model',
          text: errText,
          fullText: errText,
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          clientOrder: nowOrder + 1,
        };
        setMessages((prev) => [...prev, aiReplyMsg]);
        return;
      }
    }

    const topicForGeneration = cleanTopic && cleanTopic.length >= 2 ? cleanTopic : text;

    // Launch grounded topic research + Google Workspace creation concurrently with chat stream
    const workspaceActionPromise: Promise<WorkspaceActionPayload | undefined> = (async () => {
      try {
        if (isEmailIntent) {
          const emailRes = await requestAiEmail(text);
          return {
            type: 'email',
            title: emailRes.subject,
            summary: `Draft to ${emailRes.to || '(Recipient)'} — Review before sending`,
            emailData: {
              to: emailRes.to,
              subject: emailRes.subject,
              body: emailRes.body,
            },
          };
        } else if (isComprehensiveWorkspaceIntent || isSlidesIntent) {
          const presRes = await requestAiPresentation(topicForGeneration, 5);
          let createdUrl: string | undefined;
          let createdId: string | undefined;
          if (currentValidToken) {
            try {
              const pres = await createGooglePresentation(
                currentValidToken,
                presRes.title,
                presRes.slides,
                presRes.theme
              );
              createdUrl = pres.webViewLink;
              createdId = pres.id;
            } catch (createErr) {
              console.warn('Auto-create presentation notice:', createErr);
            }
          }
          return {
            type: 'slides',
            title: presRes.title,
            summary: createdUrl
              ? `Created in Google Slides (${presRes.slides.length} slides · ${presRes.theme?.name || 'Themed'})`
              : presRes.subtitle,
            theme: presRes.theme,
            slides: presRes.slides,
            createdUrl,
            createdId,
          };
        } else if (isExcelIntent) {
          const sheetRes = await requestAiSpreadsheet(topicForGeneration);
          return {
            type: 'excel',
            title: sheetRes.title,
            summary: `Interactive Excel model with ${sheetRes.headers.length} columns and ${sheetRes.rows.length} rows. Ready to edit and export as .xlsx.`,
            headers: sheetRes.headers,
            rows: sheetRes.rows,
          };
        } else if (isSheetIntent) {
          const sheetRes = await requestAiSpreadsheet(topicForGeneration);
          let createdUrl: string | undefined;
          let createdId: string | undefined;
          if (currentValidToken) {
            try {
              const sheet = await createGoogleSheet(
                currentValidToken,
                sheetRes.title,
                sheetRes.headers,
                sheetRes.rows
              );
              createdUrl = sheet.webViewLink;
              createdId = sheet.id;
            } catch (createErr) {
              console.warn('Auto-create sheet notice:', createErr);
            }
          }
          return {
            type: 'sheet',
            title: sheetRes.title,
            summary: createdUrl
              ? `Created in Google Sheets (${sheetRes.headers.length} columns, ${sheetRes.rows.length} rows).`
              : `Google Sheet table with ${sheetRes.headers.length} columns and ${sheetRes.rows.length} rows.`,
            headers: sheetRes.headers,
            rows: sheetRes.rows,
            createdUrl,
            createdId,
          };
        } else if (isDocIntent) {
          const docRes = await requestAiDocument(topicForGeneration);
          let createdUrl: string | undefined;
          let createdId: string | undefined;
          if (currentValidToken) {
            try {
              const created = await createGoogleDoc(
                currentValidToken,
                docRes.title,
                docRes.bodyText
              );
              createdUrl = created.webViewLink;
              createdId = created.id;
            } catch (createErr) {
              console.warn('Auto-create doc notice:', createErr);
            }
          }
          return {
            type: 'doc',
            title: docRes.title,
            summary: createdUrl
              ? `Created in Google Docs (${docRes.bodyText.length} characters) on "${topicForGeneration}".`
              : `Google Document draft on "${topicForGeneration}" ready to save in Google Docs.`,
            docContent: docRes.bodyText,
            createdUrl,
            createdId,
          };
        }
      } catch (err) {
        console.warn('Workspace copilot generation warning:', err);
      }
      return undefined;
    })();

    const upsertStreamingMessage = (
      content: string,
      done: boolean,
      sources?: GroundingSource[],
      aiMode?: AiModeData,
      generatedImage?: GeneratedImagePayload,
      generatedMusic?: GeneratedMusicPayload,
      modelUsed?: string,
      searchQueries?: string[],
      followUpQuestions?: string[],
      workspaceAction?: WorkspaceActionPayload
    ) => {
      if (!messageInserted) {
        messageInserted = true;
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: aiMsgId,
            role: 'model',
            text: content,
            fullText: content,
            isStreaming: !done,
            modelUsed,
            sources: sources || [],
            searchQueries: searchQueries || aiMode?.searchQueries,
            followUpQuestions: followUpQuestions || aiMode?.followUpQuestions,
            locationUsed: resolvedLocation?.label,
            aiMode,
            generatedImage,
            generatedMusic,
            workspaceAction: workspaceAction ?? finalWorkspaceAction,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            clientOrder: nowOrder + 1,
          },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: content,
                  fullText: content,
                  isStreaming: !done,
                  modelUsed: modelUsed ?? m.modelUsed,
                  sources: sources ?? m.sources,
                  searchQueries:
                    searchQueries && searchQueries.length > 0
                      ? searchQueries
                      : aiMode?.searchQueries ?? m.searchQueries,
                  followUpQuestions:
                    followUpQuestions && followUpQuestions.length > 0
                      ? followUpQuestions
                      : aiMode?.followUpQuestions ?? m.followUpQuestions,
                  locationUsed: resolvedLocation?.label ?? m.locationUsed,
                  aiMode: aiMode ?? m.aiMode,
                  generatedImage: generatedImage ?? m.generatedImage,
                  generatedMusic: generatedMusic ?? m.generatedMusic,
                  workspaceAction: workspaceAction ?? finalWorkspaceAction ?? m.workspaceAction,
                }
              : m
          )
        );
      }
    };

    const finalizeAndPersist = async (
      replyText: string,
      sources: GroundingSource[],
      offlineGenerated: boolean,
      aiMode?: AiModeData,
      generatedImage?: GeneratedImagePayload,
      generatedMusic?: GeneratedMusicPayload,
      modelUsed?: string,
      searchQueries?: string[],
      followUpQuestions?: string[],
      workspaceAction?: WorkspaceActionPayload
    ) => {
      const mergedSearchQueries =
        searchQueries && searchQueries.length > 0 ? searchQueries : aiMode?.searchQueries;
      const mergedFollowUps =
        followUpQuestions && followUpQuestions.length > 0
          ? followUpQuestions
          : aiMode?.followUpQuestions;

      const modelMsg: ChatMessage = {
        id: aiMsgId,
        role: 'model',
        text: replyText,
        fullText: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clientOrder: nowOrder + 1,
        modelUsed,
        sources,
        searchQueries: mergedSearchQueries,
        followUpQuestions: mergedFollowUps,
        locationUsed: resolvedLocation?.label,
        aiMode,
        generatedImage,
        generatedMusic,
        workspaceAction: workspaceAction ?? finalWorkspaceAction,
        isStreaming: false,
        isOfflineGenerated: offlineGenerated,
      };

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === aiMsgId);
        if (exists) {
          return prev.map((m) => (m.id === aiMsgId ? modelMsg : m));
        }
        return [...prev, modelMsg];
      });

      setIsLoading(false);

      if (audioAutoSpeak && !isGlobalMuted && !generatedMusic) {
        const spokenSummary = mathToSpokenPlainText(aiMode?.summary || replyText);
        jarvisAudio.speak(spokenSummary);
      }

      try {
        await persistConversationTurn({
          existingChatId: sessionIdAtStart,
          userMessage: userMsg,
          modelMessage: modelMsg,
        });
      } catch (persistErr) {
        console.warn('Chat persistence notice:', persistErr);
      }
    };

    const respondViaOfflineBrain = async () => {
      const historyPlain = messagesRef.current
        .filter((m) => m.id !== 'msg-welcome' && m.id !== 'msg-0' && !m.isError)
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.fullText || m.text }));

      const offlineReply = generateOfflineResponse(text, historyPlain);
      onStatusUpdate?.(
        offlineReply.fromCache
          ? 'Answered from offline memory.'
          : 'Answered via Local Neural Core.'
      );
      await finalizeAndPersist(offlineReply.text, [], true);
    };

    if (isOfflineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await respondViaOfflineBrain();
      return;
    }

    const requestBody = {
      prompt: text,
      history: priorConversation,
      rolePersona,
      modelTier,
      language: language.label,
      photos: photosPayload,
      largeFiles: largeFilesPayload,
      lastImageDataUrl: modifyTargetNow?.dataUrl || latestConversationImage?.dataUrl,
      lastImageMimeType: latestConversationImage?.mimeType || 'image/png',
      forceModifyImage: Boolean(modifyTargetNow),
      imageAspectRatio,
      imageSize,
      groundingPreference,
      userLocation: locationPayload,
    };

    let reportedRateLimit = false;
    let lastErrorMessage = '';

    try {
      const streamRes = await fetch('/api/jarvis/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!streamRes.ok || !streamRes.body) {
        if (streamRes.status === 429) reportedRateLimit = true;
        throw new Error(`Stream unavailable (${streamRes.status})`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === 'chunk' && payload.delta) {
              accumulatedText += payload.delta;
              upsertStreamingMessage(accumulatedText, false);
            } else if (payload.type === 'done') {
              if (payload.text) accumulatedText = payload.text;
              if (Array.isArray(payload.sources)) finalSources = payload.sources;
              if (Array.isArray(payload.searchQueries)) finalSearchQueries = payload.searchQueries;
              if (Array.isArray(payload.followUpQuestions)) {
                finalFollowUps = payload.followUpQuestions;
              }
              if (typeof payload.modelUsed === 'string') finalModelUsed = payload.modelUsed;
              if (payload.aiMode) finalAiMode = payload.aiMode;
              if (payload.generatedImage) finalGeneratedImage = payload.generatedImage;
              if (payload.generatedMusic) finalGeneratedMusic = payload.generatedMusic;
              upsertStreamingMessage(
                accumulatedText,
                true,
                finalSources,
                finalAiMode,
                finalGeneratedImage,
                finalGeneratedMusic,
                finalModelUsed,
                finalSearchQueries,
                finalFollowUps
              );
            } else if (payload.type === 'error') {
              if (payload.code === 'RATE_LIMIT' || String(payload.error || '').includes('quota')) {
                reportedRateLimit = true;
              }
              throw new Error(payload.error || 'Stream interrupted');
            }
          } catch (parseErr: any) {
            if (parseErr?.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }

      if (
        !accumulatedText.trim() &&
        !finalAiMode &&
        !finalGeneratedImage &&
        !finalGeneratedMusic &&
        !reportedRateLimit
      ) {
        const fallbackRes = await fetch('/api/jarvis/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        const fallbackData = await fallbackRes.json();
        if (!fallbackRes.ok) {
          if (fallbackRes.status === 429) reportedRateLimit = true;
          throw new Error(fallbackData?.error || 'Request failed');
        }
        accumulatedText = fallbackData.text?.trim() || 'Ready for your next question.';
        finalSources = Array.isArray(fallbackData.sources) ? fallbackData.sources : [];
        finalSearchQueries = Array.isArray(fallbackData.searchQueries)
          ? fallbackData.searchQueries
          : [];
        finalFollowUps = Array.isArray(fallbackData.followUpQuestions)
          ? fallbackData.followUpQuestions
          : [];
        finalModelUsed = fallbackData.modelUsed;
        finalAiMode = fallbackData.aiMode;
        finalGeneratedImage = fallbackData.generatedImage;
        finalGeneratedMusic = fallbackData.generatedMusic;
      }

      const finalCleanText = accumulatedText.trim() || 'Completed.';
      saveToOfflineCache(text, finalCleanText);
      onStatusUpdate?.('Response complete & synced.');
      if (!finalWorkspaceAction) {
        finalWorkspaceAction = await workspaceActionPromise;
      }
      await finalizeAndPersist(
        finalCleanText,
        finalSources,
        false,
        finalAiMode,
        finalGeneratedImage,
        finalGeneratedMusic,
        finalModelUsed,
        finalSearchQueries,
        finalFollowUps,
        finalWorkspaceAction
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      lastErrorMessage = err?.message || 'Unable to complete request.';

      if (isOfflineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        await respondViaOfflineBrain();
        return;
      }

      // Retry via /api/jarvis/chat if the SSE stream dropped due to a transport glitch
      if (!reportedRateLimit) {
        try {
          const retryRes = await fetch('/api/jarvis/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          const retryData = await retryRes.json();
          if (
            retryRes.ok &&
            (retryData?.text ||
              retryData?.aiMode ||
              retryData?.generatedImage ||
              retryData?.generatedMusic)
          ) {
            const cleanReply = (retryData.text || 'Completed.').trim();
            const retrySources = Array.isArray(retryData.sources) ? retryData.sources : [];
            const retryQueries = Array.isArray(retryData.searchQueries)
              ? retryData.searchQueries
              : [];
            const retryFollowUps = Array.isArray(retryData.followUpQuestions)
              ? retryData.followUpQuestions
              : [];
            saveToOfflineCache(text, cleanReply);
            onStatusUpdate?.('Response complete & synced.');
            if (!finalWorkspaceAction) {
              finalWorkspaceAction = await workspaceActionPromise;
            }
            await finalizeAndPersist(
              cleanReply,
              retrySources,
              false,
              retryData.aiMode,
              retryData.generatedImage,
              retryData.generatedMusic,
              retryData.modelUsed,
              retryQueries,
              retryFollowUps,
              finalWorkspaceAction
            );
            return;
          }
          if (retryRes.status === 429) {
            reportedRateLimit = true;
          }
          if (retryData?.error) {
            lastErrorMessage = retryData.error;
          }
        } catch {}
      }

      // Online error bubble with 1-click Retry (never disguise online queries with canned offline strings)
      setIsLoading(false);
      const errText = reportedRateLimit
        ? 'Google AI Mode rate limit momentarily reached. Please wait a few seconds and click Retry.'
        : lastErrorMessage || 'Connection interrupted while fetching Google AI Mode response.';
      onStatusUpdate?.(errText);
      const errorMsg: ChatMessage = {
        id: aiMsgId,
        role: 'model',
        text: errText,
        fullText: errText,
        isError: true,
        retryPrompt: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clientOrder: nowOrder + 1,
      };
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === aiMsgId);
        return exists ? prev.map((m) => (m.id === aiMsgId ? errorMsg : m)) : [...prev, errorMsg];
      });
    }
  };

  const isWelcomeNewChat = messages.length === 1 && messages[0]?.id === 'msg-welcome';

  const samplePrompts = [
    'Explain the difference between Vivo V70 Lite and Oppo Find X9s',
    'Draft a project proposal in Google Docs with strategic milestones',
    'Build a financial budget model in Microsoft Excel (.xlsx) with formulas',
    'What is the weather and top news around my location today?',
    'Create an image of a sleek futuristic electric supercar in a minimalist studio',
  ];

  return (
    <div className="relative w-full h-full min-h-[540px] flex flex-col bg-white text-black dark:bg-[#060606] dark:text-white rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-base font-display font-bold text-black dark:text-white tracking-tight">
            Jarvis
          </h2>
          <span className="text-xs text-neutral-400">·</span>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {activeChatId === null ? 'New Chat' : 'Saved Conversation'}
          </span>
          <span className="text-xs text-neutral-400">·</span>
          <span className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
            {aiVoice} ({language.label})
          </span>
          {isOfflineMode && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              · Offline Core
            </span>
          )}
        </div>

        {/* Model Tier + Role Persona + Grounding Mode + Live Voice + Conversation Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model Tier Selector (`gemini-4-argon` / `gemini-3.8-flash` / `gemini-3.1-flash-lite`) */}
          <select
            aria-label="Gemini model tier"
            value={modelTier}
            onChange={(e) => setModelTier(e.target.value as ChatbotModelTier)}
            className="px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-[11px] font-medium text-black dark:text-neutral-200 focus:outline-none cursor-pointer"
            title="Select Gemini chatbot reasoning tier"
          >
            <option value="auto">Auto Tier</option>
            <option value="fast">Fast · 3.1 Lite</option>
            <option value="general">Balanced · 3.8 Flash</option>
            <option value="complex">Complex · 4 Argon</option>
          </select>

          {/* System Role Persona Selector */}
          <select
            aria-label="Assistant persona"
            value={rolePersona}
            onChange={(e) => setRolePersona(e.target.value as ChatbotRolePersona)}
            className="px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black text-[11px] font-medium text-black dark:text-neutral-200 focus:outline-none cursor-pointer"
            title="Select system role persona"
          >
            <option value="assistant">Role: Executive</option>
            <option value="bioscience">Role: Bioscience</option>
            <option value="architect">Role: Architect</option>
            <option value="analyst">Role: Analyst</option>
          </select>

          {/* Search / Maps Grounding Selector */}
          <div className="flex items-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setGroundingPreference('auto')}
              className={`px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                groundingPreference === 'auto'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
              title="Google AI Mode — Complete Web Search, Maps, Location & Visual Explanations"
            >
              AI Mode
            </button>
            <button
              type="button"
              onClick={() => setGroundingPreference('search')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                groundingPreference === 'search'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
              title="Ground answers with live Google Search"
            >
              <Globe className="w-3 h-3" />
              <span>Search</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGroundingPreference('maps');
                requestPreciseLocation(false);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition cursor-pointer ${
                groundingPreference === 'maps'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
              }`}
              title="Ground nearby place & map answers with Google Maps"
            >
              <MapPin className="w-3 h-3" />
              <span>Maps</span>
            </button>
          </div>

          {/* Google AI Mode Location Access Button (Automatic IP + 1-click Precise GPS) */}
          <button
            type="button"
            onClick={() => requestPreciseLocation(false)}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white hover:bg-neutral-100 dark:bg-black dark:hover:bg-neutral-900 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 transition cursor-pointer max-w-[230px]"
            title={
              userLocation?.source === 'gps'
                ? `Precise GPS location active (${userLocation.label || 'GPS'}) — click to refresh`
                : 'Click to grant Precise GPS location (just like Google AI Mode)'
            }
          >
            {isLocating ? (
              <RefreshCw className="w-3 h-3 shrink-0 animate-spin" />
            ) : userLocation?.source === 'gps' ? (
              <LocateFixed className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <MapPin className="w-3 h-3 shrink-0 text-neutral-500" />
            )}
            <span className="truncate">
              {isLocating
                ? 'Locating...'
                : userLocation?.label
                ? `${userLocation.label.split(',').slice(0, 2).join(',')}${
                    userLocation.source === 'gps' ? '' : ' · Use precise'
                  }`
                : 'Use precise location'}
            </span>
          </button>

          {/* Live Two-Way Voice Conversation Button (`gemini-3.8-live`) */}
          <button
            type="button"
            onClick={() => setIsLiveVoiceOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition cursor-pointer"
            title="Start real-time two-way Live Voice conversation (gemini-3.8-live)"
          >
            <AudioLines className="w-3.5 h-3.5" />
            <span>Live Voice</span>
          </button>

          <button
            type="button"
            onClick={startNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 dark:bg-[#141414] dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-black dark:text-neutral-200 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>

          {onToggleWakeWordOnly && (
            <button
              type="button"
              onClick={onToggleWakeWordOnly}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                wakeWordOnly
                  ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:text-black dark:bg-[#141414] dark:text-neutral-300 dark:border-neutral-800 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Wake: {wakeWordOnly ? 'Strict' : 'Auto'}</span>
            </button>
          )}

          {speechActive && (
            <button
              type="button"
              onClick={() => jarvisAudio.stopSpeaking()}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 text-xs font-medium text-emerald-800 dark:text-emerald-300 transition cursor-pointer"
            >
              Stop Speaking
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (speechActive) jarvisAudio.stopSpeaking();
              setAudioAutoSpeak(!audioAutoSpeak);
            }}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              audioAutoSpeak && !isGlobalMuted
                ? 'bg-white text-black border-neutral-300 dark:bg-[#141414] dark:text-white dark:border-neutral-700'
                : 'bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800'
            }`}
            title={audioAutoSpeak ? 'Auto-speak answers ON' : 'Auto-speak answers OFF'}
          >
            {audioAutoSpeak && !isGlobalMuted ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Active Mic 2 Banner */}
      {micMode === 'mic2' && (
        <div className="px-5 py-2 bg-emerald-50 dark:bg-[#0d1912] border-b border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-300 gap-2 flex-wrap">
          <span>
            {speechActive
              ? 'Echo Shield active while Jarvis speaks — Mic 2 resumes automatically when speech finishes.'
              : 'Mic 2 is ON and listening to your questions. Say "stop answering questions" anytime to switch back to Mic 1.'}
          </span>
          {onSetMicMode && (
            <button
              type="button"
              onClick={() => onSetMicMode('mic1')}
              className="px-2.5 py-0.5 rounded bg-white dark:bg-black/70 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 transition text-[11px] cursor-pointer"
            >
              Switch to Mic 1
            </button>
          )}
        </div>
      )}

      {/* Conversation Message Viewport */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-white dark:bg-black select-text">
        {/* Prominent Welcome Greeting on Entering Jarvis 2.5 */}
        {isWelcomeNewChat && (
          <div className="py-8 px-4 max-w-2xl mx-auto text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-black dark:text-white">
              Welcome to Jarvis 2.5!
            </h1>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              Ask any question naturally, solve fractions, multiplication &amp; division step by
              step like handwritten notes, compare items side-by-side, explain named subjects with
              pictures, create or modify high-resolution images, compose Lyria 3 music, draft and review emails via Gmail, or generate themed Google Slides presentations.
            </p>
          </div>
        )}

        {messages
          .filter((m) => !(isWelcomeNewChat && m.id === 'msg-welcome'))
          .map((msg) => {
            const hasRichCard = Boolean(
              msg.aiMode || msg.generatedImage || msg.generatedMusic
            );
            const mapsReviews = (msg.sources || []).filter(
              (s) => s.sourceType === 'maps' && s.reviewSnippet
            );
            const searchedQueries =
              msg.searchQueries && msg.searchQueries.length > 0
                ? msg.searchQueries
                : msg.aiMode?.searchQueries || [];
            const followUps =
              msg.followUpQuestions && msg.followUpQuestions.length > 0
                ? msg.followUpQuestions
                : msg.aiMode?.followUpQuestions || [];

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 px-1 text-[11px] font-mono text-neutral-500">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-300">
                    {msg.role === 'user' ? 'You' : 'Jarvis 2.5 · Google AI Mode'}
                  </span>
                  {msg.timestamp && <span>{msg.timestamp}</span>}
                </div>

                <div
                  className={`${
                    msg.aiMode ? 'w-full max-w-4xl' : 'max-w-3xl'
                  } rounded-2xl px-4 py-3.5 text-sm leading-relaxed border ${
                    msg.role === 'user'
                      ? 'bg-neutral-100 text-black border-neutral-300 dark:bg-[#161616] dark:text-white dark:border-neutral-700 rounded-tr-xs'
                      : msg.isError
                      ? 'bg-red-50 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800/60 rounded-tl-xs'
                      : 'bg-neutral-50 text-black border-neutral-200 dark:bg-[#0b0b0b] dark:text-neutral-100 dark:border-neutral-800 rounded-tl-xs'
                  }`}
                >
                  {/* User Attached Photos Grid */}
                  {msg.attachedPhotoUrls && msg.attachedPhotoUrls.length > 0 && (
                    <div className="mb-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {msg.attachedPhotoUrls.map((url, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={url}
                            alt={`Uploaded ${idx + 1}`}
                            className="w-full h-20 object-cover rounded-lg border border-neutral-300 dark:border-neutral-700"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedModifyTarget({
                                dataUrl: url,
                                label: `Photo ${idx + 1}`,
                              })
                            }
                            className="opacity-0 group-hover:opacity-100 absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-medium cursor-pointer"
                            title="Modify this photo"
                          >
                            Modify
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User Attached Large Files */}
                  {msg.attachedFileNames && msg.attachedFileNames.length > 0 && (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      {msg.attachedFileNames.map((fname, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-black border border-neutral-300 dark:border-neutral-700 text-xs font-mono"
                        >
                          <FileUp className="w-3.5 h-3.5 shrink-0" />
                          <span>{fname}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Google AI Mode Searched Web Queries */}
                  {msg.role === 'model' && searchedQueries.length > 0 && (
                    <div className="mb-2.5 pb-2 border-b border-neutral-200/80 dark:border-neutral-800/80 flex items-center gap-1.5 flex-wrap text-[11px] text-neutral-500 dark:text-neutral-400">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="font-medium">Searched Google:</span>
                      <span className="truncate max-w-full">
                        {searchedQueries.slice(0, 4).join(' · ')}
                      </span>
                    </div>
                  )}

                  {/* Google Workspace & Microsoft Excel Interactive Action Card */}
                  {msg.workspaceAction && (
                    <div className="mb-3">
                      <WorkspaceActionCard
                        action={msg.workspaceAction}
                        onOpenWorkspaceHub={onOpenWorkspaceTab}
                      />
                    </div>
                  )}

                  {/* Google AI Mode Visual Comparison / Named Picture Explanation / Generated Image / Lyria Music */}
                  {hasRichCard && (
                    <div className={msg.aiMode ? '' : 'mb-3'}>
                      <AiModeCard
                        aiMode={msg.aiMode}
                        generatedImage={msg.generatedImage}
                        generatedMusic={msg.generatedMusic}
                        onSelectImageForModify={(dataUrl, label) => {
                          setSelectedModifyTarget({ dataUrl, label });
                          onStatusUpdate?.(
                            'Image selected for modification — describe your changes below.'
                          );
                        }}
                      />
                    </div>
                  )}

                  {/* Notebook-Style Math & Formatted Prose (shown when not already rendered inside AI Mode layout) */}
                  {!msg.aiMode && (
                    <div>
                      <NotebookMathRenderer
                        text={msg.text}
                        copiedKey={copiedId}
                        onCopyBlock={handleCopyText}
                      />
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-black dark:bg-white animate-pulse" />
                      )}
                    </div>
                  )}

                  {/* Google Workspace Authentication Alert & Connect Action */}
                  {msg.requiresWorkspaceAuth && (
                    <div className="mt-3 p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs">
                          <span className="font-semibold block mb-0.5">
                            Google Workspace Access Needed
                          </span>
                          <span>
                            Sign in with your Google account to grant access to Docs, Sheets, Slides, and Gmail.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await signInWithGoogle();
                            } catch (err) {
                              console.error('Google Workspace sign in error:', err);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition cursor-pointer shrink-0"
                        >
                          <span>Connect Google Workspace</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Retry Button for Online Request Errors */}
                  {msg.isError && msg.retryPrompt && (
                    <div className="mt-3 pt-2 border-t border-red-200 dark:border-red-900/60">
                      <button
                        type="button"
                        onClick={() => handleSendMessage(msg.retryPrompt)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry in Google AI Mode</span>
                      </button>
                    </div>
                  )}

                  {/* Google AI Mode Grounded Web & Maps Source Cards */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800/80 space-y-2.5">
                      <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" />
                          <span>
                            Sources ({msg.sources.length}) · Google Search &amp; Maps
                          </span>
                        </span>
                        {msg.locationUsed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-normal text-neutral-500">
                            <MapPin className="w-2.5 h-2.5" />
                            <span className="truncate max-w-[180px]">{msg.locationUsed}</span>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {msg.sources.map((src, i) => {
                          const domain = getSourceDomain(src);
                          const isMaps = src.sourceType === 'maps';
                          return (
                            <a
                              key={i}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex flex-col justify-between gap-1.5 p-2.5 rounded-xl bg-white hover:bg-neutral-100 dark:bg-black dark:hover:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-left transition"
                            >
                              <div className="flex items-center justify-between gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  {isMaps ? (
                                    <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                  ) : (
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                                        domain
                                      )}&sz=32`}
                                      alt=""
                                      className="w-3.5 h-3.5 rounded-xs shrink-0"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).style.display =
                                          'none';
                                      }}
                                    />
                                  )}
                                  <span className="truncate font-mono text-[10px]">
                                    {isMaps ? 'Google Maps' : domain}
                                  </span>
                                </span>
                                <ExternalLink className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100 transition" />
                              </div>
                              <div className="text-xs font-semibold text-black dark:text-neutral-100 line-clamp-2 leading-snug">
                                {src.title}
                              </div>
                            </a>
                          );
                        })}
                      </div>

                      {mapsReviews.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {mapsReviews.map((rev, rIdx) => (
                            <div
                              key={rIdx}
                              className="p-2.5 rounded-xl bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 flex items-start justify-between gap-2"
                            >
                              <div>
                                <span className="font-semibold text-black dark:text-white">
                                  {rev.title}:{' '}
                                </span>
                                <span>“{rev.reviewSnippet}”</span>
                              </div>
                              <a
                                href={rev.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-[11px] font-semibold underline hover:opacity-80"
                              >
                                Maps
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Google AI Mode Follow-up Questions ("Ask a follow-up") */}
                  {msg.role === 'model' &&
                    !msg.isError &&
                    !msg.isStreaming &&
                    followUps.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800/80 space-y-1.5">
                        <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                          Ask a follow-up
                        </div>
                        <div className="divide-y divide-neutral-200/80 dark:divide-neutral-800/80 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black overflow-hidden">
                          {followUps.slice(0, 4).map((q, qIdx) => (
                            <button
                              key={qIdx}
                              type="button"
                              disabled={isLoading}
                              onClick={() => handleSendMessage(q)}
                              className="w-full px-3 py-2.5 text-left text-xs font-medium text-black dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-between gap-2 transition disabled:opacity-50 cursor-pointer"
                            >
                              <span>{q}</span>
                              <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Message Actions */}
                  {msg.role === 'model' && !msg.isError && !msg.isStreaming && (
                    <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-900 flex items-center justify-between gap-4 text-[11px] text-neutral-500">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            jarvisAudio.speak(
                              mathToSpokenPlainText(msg.aiMode?.summary || msg.fullText || msg.text)
                            )
                          }
                          className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Speak</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(msg.fullText || msg.text, msg.id)
                          }
                          className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {msg.modelUsed && (
                          <span className="font-mono text-[10px] text-neutral-500">
                            {msg.modelUsed}
                          </span>
                        )}
                        {msg.isOfflineGenerated && (
                          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                            Offline Core
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 px-1">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-black dark:text-white" />
            <span>Jarvis 2.5 is preparing your response...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Starter Prompts when in a fresh New Chat */}
      {isWelcomeNewChat && (
        <div className="px-5 py-2.5 flex items-center gap-2 overflow-x-auto border-t border-neutral-200 dark:border-neutral-900 bg-neutral-50 dark:bg-[#070707] text-xs">
          <span className="text-neutral-600 dark:text-neutral-500 shrink-0 font-medium">Try:</span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(p)}
              disabled={isLoading}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-100 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-black dark:text-neutral-200 text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Image Studio Options Bar (`gemini-nano-banana-2.1` Aspect Ratio & Resolution) */}
      {(showImageStudioBar || Boolean(selectedModifyTarget) || isPromptLikelyImageTask) && (
        <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0d0d0d] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-semibold text-black dark:text-white">
              Image Studio (gemini-nano-banana-2.1):
            </span>
            <div className="flex items-center gap-1">
              {(['1:1', '16:9', '9:16', '4:3', '3:4'] as StudioAspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setImageAspectRatio(ar)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer ${
                    imageAspectRatio === ar
                      ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-300 dark:bg-[#151515] dark:text-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-1">
              {(['1K', '2K', '4K'] as StudioImageSize[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setImageSize(sz)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono cursor-pointer ${
                    imageSize === sz
                      ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-semibold'
                      : 'bg-white text-neutral-700 border-neutral-300 dark:bg-[#151515] dark:text-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {showImageStudioBar && !selectedModifyTarget && !isPromptLikelyImageTask && (
            <button
              type="button"
              onClick={() => setShowImageStudioBar(false)}
              className="text-[11px] text-neutral-500 hover:text-black dark:hover:text-white cursor-pointer"
            >
              Hide
            </button>
          )}
        </div>
      )}

      {/* Composer Attachment Tray (Selected Modify Image, Up to 15 Photos, and Large Files) */}
      {(selectedModifyTarget ||
        attachedPhotos.length > 0 ||
        attachedLargeFiles.length > 0 ||
        uploadLimitNotice) && (
        <div className="px-4 py-2.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0c0c0c] space-y-2">
          {uploadLimitNotice && (
            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
              {uploadLimitNotice}
            </div>
          )}

          {selectedModifyTarget && (
            <div className="inline-flex items-center gap-2.5 p-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] text-xs">
              <img
                src={selectedModifyTarget.dataUrl}
                alt="Target to modify"
                className="w-10 h-10 rounded-lg object-cover border border-neutral-200 dark:border-neutral-700"
              />
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1 text-black dark:text-white">
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Modifying Image</span>
                </div>
                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate max-w-[220px]">
                  Describe how you want to modify it below
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModifyTarget(null)}
                className="p-1 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {attachedPhotos.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
                <span>
                  Uploaded Photos: <strong>{attachedPhotos.length}</strong> / {MAX_UPLOAD_PHOTOS}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedPhotos([])}
                  className="hover:underline cursor-pointer"
                >
                  Clear photos
                </button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {attachedPhotos.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    <img
                      src={p.dataUrl}
                      alt={p.name}
                      className="w-14 h-14 rounded-lg object-cover border border-neutral-300 dark:border-neutral-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedPhotos((prev) => prev.filter((item) => item.id !== p.id))
                      }
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center text-[10px] font-bold cursor-pointer"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {attachedLargeFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachedLargeFiles.map((lf) => (
                <div
                  key={lf.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#141414] text-xs"
                >
                  <FileUp className="w-3.5 h-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[180px]">{lf.name}</div>
                    <div className="text-[10px] font-mono text-neutral-500">
                      {lf.error
                        ? lf.error
                        : lf.uploading
                        ? `Uploading ${lf.progress}% · ${formatBytes(lf.size)}`
                        : `Ready · ${formatBytes(lf.size)}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachedLargeFiles((prev) => prev.filter((item) => item.id !== lf.id))
                    }
                    className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Composer Bar with Upload Icon (Photos max 15 + Take Photo + Large Files + Audio Transcribe in SAME menu), Transcribe Mic & Dual-Mic */}
      <div className="p-4 bg-neutral-50 dark:bg-[#0a0a0a] border-t border-neutral-200 dark:border-neutral-800">
        {/* Hidden File Inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleSelectPhotos}
          className="hidden"
        />
        <input
          ref={largeFileInputRef}
          type="file"
          multiple
          onChange={handleSelectLargeFiles}
          className="hidden"
        />
        <input
          ref={audioTranscribeInputRef}
          type="file"
          accept="audio/*"
          onChange={handleSelectAudioForTranscription}
          className="hidden"
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          {/* Unified Upload Icon & Popover Menu inside Chat */}
          <div ref={uploadMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsUploadMenuOpen((o) => !o)}
              className="p-3 rounded-xl border border-neutral-300 dark:border-neutral-800 bg-white hover:bg-neutral-100 dark:bg-[#121212] dark:hover:bg-neutral-800 text-black dark:text-white transition flex items-center gap-1.5 cursor-pointer"
              title="Upload photos (max 15), take a photo, upload large files, or transcribe audio"
              aria-label="Upload photos, take photo, upload large files, or transcribe audio"
            >
              <Upload className="w-4 h-4" />
              {attachedPhotos.length > 0 && (
                <span className="text-[11px] font-mono font-semibold">
                  {attachedPhotos.length}/15
                </span>
              )}
            </button>

            {isUploadMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-68 rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-white text-black dark:bg-[#101010] dark:text-white p-1.5 shadow-xl z-40 space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-mono text-neutral-500 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                  <span>Upload &amp; Capture</span>
                  <span>{attachedPhotos.length}/15 photos</span>
                </div>

                {/* Option 1: Upload Photos (Max 15) */}
                <button
                  type="button"
                  disabled={attachedPhotos.length >= MAX_UPLOAD_PHOTOS}
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-3 text-left text-xs transition disabled:opacity-40 cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Upload Photos</div>
                    <div className="text-[11px] text-neutral-500">
                      Up to 15 photos ({MAX_UPLOAD_PHOTOS - attachedPhotos.length} left)
                    </div>
                  </div>
                </button>

                {/* Option 2: Take a Photo */}
                <button
                  type="button"
                  disabled={attachedPhotos.length >= MAX_UPLOAD_PHOTOS}
                  onClick={() => {
                    setIsUploadMenuOpen(false);
                    setIsCameraCaptureOpen(true);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-3 text-left text-xs transition disabled:opacity-40 cursor-pointer"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Take Photo</div>
                    <div className="text-[11px] text-neutral-500">
                      Capture directly from camera
                    </div>
                  </div>
                </button>

                {/* Option 3: Upload Large Files (Inside the SAME menu as images!) */}
                <button
                  type="button"
                  onClick={() => largeFileInputRef.current?.click()}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-3 text-left text-xs transition cursor-pointer"
                >
                  <FileUp className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Upload Large Files</div>
                    <div className="text-[11px] text-neutral-500">
                      PDFs, videos, audio, docs &amp; data
                    </div>
                  </div>
                </button>

                {/* Option 4: Transcribe Audio File (`gemini-3.5-transcribe`) */}
                <button
                  type="button"
                  onClick={() => audioTranscribeInputRef.current?.click()}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-3 text-left text-xs transition cursor-pointer"
                >
                  <FileAudio className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Transcribe Audio File</div>
                    <div className="text-[11px] text-neutral-500">
                      Convert speech audio to text
                    </div>
                  </div>
                </button>

                {/* Option 5: Image Studio Aspect/Size Controls */}
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadMenuOpen(false);
                    setShowImageStudioBar((v) => !v);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-3 text-left text-xs transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Image Studio Settings</div>
                    <div className="text-[11px] text-neutral-500">
                      Aspect ratio ({imageAspectRatio}) &amp; resolution ({imageSize})
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Dedicated Audio Transcription Recorder Button (`gemini-3.5-transcribe`) */}
          <button
            type="button"
            onClick={handleToggleAudioTranscription}
            disabled={isTranscribingAudio}
            className={`px-3 py-3 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              isRecordingAudio
                ? 'bg-red-600 text-white border-red-600 font-semibold animate-pulse'
                : isTranscribingAudio
                ? 'bg-neutral-200 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-[#121212] dark:hover:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-800'
            }`}
            title="Record microphone audio and transcribe to text with gemini-3.5-transcribe"
          >
            {isTranscribingAudio ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isRecordingAudio ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <AudioLines className="w-4 h-4" />
            )}
            <span className="hidden md:inline">
              {isTranscribingAudio ? 'Transcribing...' : isRecordingAudio ? 'Stop' : 'Transcribe'}
            </span>
          </button>

          {/* Mic 1: Command Mic */}
          {onSetMicMode && (
            <button
              type="button"
              onClick={() => onSetMicMode(micMode === 'mic1' ? 'off' : 'mic1')}
              className={`px-3 py-3 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                micMode === 'mic1'
                  ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white font-semibold'
                  : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-[#121212] dark:hover:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-800'
              }`}
              title='Mic 1 (Command Mic) — Say "start answering questions" to switch to Mic 2'
            >
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">Mic 1</span>
            </button>
          )}

          {/* Mic 2: Answering Questions Mic */}
          {onSetMicMode && (
            <button
              type="button"
              onClick={() => onSetMicMode(micMode === 'mic2' ? 'mic1' : 'mic2')}
              className={`px-3 py-3 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                micMode === 'mic2'
                  ? 'bg-emerald-500 text-black border-emerald-500 font-semibold'
                  : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-[#121212] dark:hover:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-800'
              }`}
              title='Mic 2 (Answering Questions) — Switches back to Mic 1 on "stop answering questions"'
            >
              {micMode === 'mic2' ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Mic 2</span>
            </button>
          )}

          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder={
              selectedModifyTarget
                ? 'Describe how to modify this image (e.g., "change background to sunset")...'
                : isRecordingAudio
                ? 'Recording voice clip — click Stop to transcribe...'
                : micMode === 'mic2'
                ? 'Mic 2 active — speak your question aloud or type here...'
                : 'Ask anything in Google AI Mode — web search, local places, comparisons, math, or images...'
            }
            className="flex-1 min-w-0 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-black dark:text-white placeholder-neutral-500 focus:outline-none focus:border-black dark:focus:border-neutral-600"
          />

          {/* Google AI Mode Live Conversation Button (`gemini-3.8-live`) right in the input bar */}
          <button
            type="button"
            onClick={() => setIsLiveVoiceOpen(true)}
            className="px-3 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white hover:bg-neutral-100 dark:bg-[#121212] dark:hover:bg-neutral-800 text-black dark:text-white text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            title="Start real-time Live Voice & Camera conversation (gemini-3.8-live)"
            aria-label="Start Live Voice conversation"
          >
            <AudioLines className="w-4 h-4" />
            <span className="hidden lg:inline">Live</span>
          </button>

          <button
            type="submit"
            disabled={
              !inputPrompt.trim() &&
              attachedPhotos.length === 0 &&
              attachedLargeFiles.filter((f) => !f.uploading && f.uri).length === 0
            }
            className="p-3 bg-black hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-black rounded-xl font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            aria-label="Send message"
          >
            {isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>

      {/* Camera Photo Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraCaptureOpen}
        remainingPhotoSlots={MAX_UPLOAD_PHOTOS - attachedPhotos.length}
        onCapturePhoto={handleCameraPhotoCaptured}
        onClose={() => setIsCameraCaptureOpen(false)}
      />

      {/* Live Two-Way Voice Conversation Modal (`gemini-3.8-live`) */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        userLocation={userLocation}
        onSaveTurnToChat={handleSaveLiveVoiceTurn}
      />
    </div>
  );
};
