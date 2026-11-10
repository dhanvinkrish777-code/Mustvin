import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import {
  Briefcase,
  Camera,
  Code2,
  FlaskConical,
  Hand,
  LayoutGrid,
  Menu,
  Mic,
  MicOff,
  Music,
  Palette,
  Plus,
  Radio,
  Ruler,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Sidebar } from './components/Sidebar';
import { JarvisChat } from './components/JarvisChat';
import { GestureBall3D } from './components/GestureBall3D';
import { CameraMeasurement } from './components/CameraMeasurement';
import { RadarScanner } from './components/RadarScanner';
import { BatteryIndicator } from './components/BatteryIndicator';
import { OfficeWorkspaceHub } from './components/OfficeWorkspaceHub';

const BioscienceWorkbench = lazy(() =>
  import('./components/BioscienceWorkbench').then((m) => ({ default: m.BioscienceWorkbench }))
);
const MusicStudio = lazy(() =>
  import('./components/MusicStudio').then((m) => ({ default: m.MusicStudio }))
);
import { PythonCodeModal } from './components/PythonCodeModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useOnlineStatus } from './hooks/usePWA';
import {
  useJarvisSession,
  type ChatMessage,
  type GeneratedMusicPayload,
} from './contexts/JarvisSessionContext';
import { useJarvisPreferences } from './contexts/JarvisPreferencesContext';
import { jarvisAudio } from './utils/audioSystem';
import {
  voiceCommander,
  type ActiveMicMode,
  type CommandMatch,
} from './utils/voiceCommandService';

type WorkspaceTab =
  | 'chat'
  | 'workspace'
  | 'bioscience'
  | 'music'
  | 'ball'
  | 'camera'
  | 'radar'
  | 'multiview';

export default function App() {
  const { isOnline, browserOnline, forceOffline, setForceOffline, toggleForceOffline } =
    useOnlineStatus();
  const {
    activeChatId,
    startNewChat,
    setActiveMessagesOptimistic,
    persistConversationTurn,
  } = useJarvisSession();
  const { backgroundColor, setBackgroundColor, toggleBackgroundColor } = useJarvisPreferences();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  const [officeSubTab, setOfficeSubTab] = useState<'docs' | 'sheets' | 'slides' | 'gmail' | 'excel'>('docs');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isPythonModalOpen, setIsPythonModalOpen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const handleOpenWorkspaceTab = (tab: 'docs' | 'sheets' | 'slides' | 'gmail' | 'excel') => {
    setOfficeSubTab(tab);
    setActiveTab('workspace');
  };

  // Sensor & Dual-Mic States
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>(
    'prompt'
  );
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [micMode, setMicMode] = useState<ActiveMicMode>('off');
  const [, setIsVoiceListening] = useState<boolean>(false);
  const [wakeWordOnly, setWakeWordOnly] = useState<boolean>(false);

  const [externalQuestion, setExternalQuestion] = useState<{ id: string; text: string } | null>(
    null
  );
  const [clearSignal, setClearSignal] = useState<number>(0);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [statusNotice, setStatusNotice] = useState<string>('');

  // Auto-action flags for child modules
  const [autoStartMonitoring, setAutoStartMonitoring] = useState<boolean>(false);
  const [autoScanNearby, setAutoScanNearby] = useState<boolean>(false);
  const [handCamTrigger, setHandCamTrigger] = useState<number>(0);

  const isMutedRef = useRef<boolean>(isMuted);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    voiceCommander.requireWakeWord = wakeWordOnly;
  }, [activeTab, wakeWordOnly]);

  // Query existing browser permissions quietly on startup; if mic is already granted, turn Mic 1 ON automatically
  useEffect(() => {
    const nav = navigator as any;
    if (!nav?.permissions?.query) return;

    nav.permissions
      .query({ name: 'camera' })
      .then((res: any) => {
        if (res.state === 'granted') setCameraPermission('granted');
      })
      .catch(() => {});

    nav.permissions
      .query({ name: 'microphone' })
      .then((res: any) => {
        if (res.state === 'granted') {
          setMicPermission('granted');
          voiceCommander.setMicMode('mic1');
        }
      })
      .catch(() => {});
  }, []);

  const ensureMicHardwareReady = useCallback(async (): Promise<boolean> => {
    if (micPermission === 'granted') return true;
    try {
      const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      aStream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      setMicPermission('denied');
      setStatusNotice('Microphone access is blocked in browser settings.');
      return false;
    }
  }, [micPermission]);

  const handleSetDualMicMode = useCallback(
    async (targetMode: ActiveMicMode) => {
      if (targetMode === 'off') {
        voiceCommander.setMicMode('off');
        setMicMode('off');
        setStatusNotice('Microphones turned off.');
        return;
      }

      const ok = await ensureMicHardwareReady();
      if (!ok) return;

      voiceCommander.setMicMode(targetMode);
      setMicMode(targetMode);
      jarvisAudio.playAcknowledgeSound();

      if (targetMode === 'mic1') {
        setStatusNotice(
          'Mic 1 active — say "start answering questions" to switch automatically to Mic 2.'
        );
      } else {
        setStatusNotice(
          'Mic 2 active — answering your questions. Say "stop answering questions" to switch back to Mic 1.'
        );
      }
    },
    [ensureMicHardwareReady]
  );

  const handleGlobalClearErrors = useCallback(() => {
    jarvisAudio.stopSpeaking();
    setClearSignal((n) => n + 1);
    setLiveTranscript('');
    setStatusNotice('Diagnostics cleared.');
  }, []);

  const handleVoiceCommandAction = useCallback(
    (action: string) => {
      if (action === 'clear_errors') {
        handleGlobalClearErrors();
        if (!isMutedRef.current) {
          jarvisAudio.speak('All errors cleared, Sir.');
        }
      } else if (action === 'new_chat') {
        startNewChat();
        setActiveTab('chat');
        const msg = 'Started a new chat, Sir. Your previous chat history remains saved.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
      } else if (action === 'qa') {
        if (activeTabRef.current !== 'multiview') {
          setActiveTab('chat');
        }
        voiceCommander.setMicMode('mic2');
        setMicMode('mic2');
        const msg = 'Mic 2 active, Sir. Go ahead with your questions.';
        setStatusNotice(msg);
        if (!isMutedRef.current) {
          jarvisAudio.speak(msg);
        }
      } else if (action === 'stop_qa') {
        voiceCommander.setMicMode('mic1');
        setMicMode('mic1');
        const msg = 'Switched back to Mic 1, Sir. Listening for commands.';
        setStatusNotice(msg);
        if (!isMutedRef.current) {
          jarvisAudio.speak(msg);
        }
      } else if (action === 'dimension') {
        setActiveTab('camera');
        setAutoStartMonitoring(true);
        const msg = 'Opening 3D dimension caliper, Sir. Starting fast measurement.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
        setTimeout(() => setAutoStartMonitoring(false), 2000);
      } else if (action === 'home') {
        setActiveTab('chat');
        const msg = 'Jarvis 2.5 chat ready, Sir.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
      } else if (action === 'radar') {
        setActiveTab('radar');
        setAutoScanNearby(true);
        const msg = 'Scanning nearby devices within 10 meters, Sir.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
        setTimeout(() => setAutoScanNearby(false), 2000);
      } else if (action === 'handcam') {
        setActiveTab('ball');
        setHandCamTrigger((n) => n + 1);
        const msg = 'Hand camera active, Sir.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
      } else if (action === 'offline_mode') {
        setForceOffline(true);
        const msg = 'Local offline core active, Sir.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
      } else if (action === 'online_mode') {
        setForceOffline(false);
        const msg = 'Online cloud connection restored, Sir.';
        setStatusNotice(msg);
        if (!isMutedRef.current) jarvisAudio.speak(msg);
      }
    },
    [handleGlobalClearErrors, setForceOffline, startNewChat]
  );

  // Wire Dual-Mic Voice Engine callbacks once
  useEffect(() => {
    voiceCommander.onCommandDetected = (match: CommandMatch) => {
      handleVoiceCommandAction(match.action);
    };

    voiceCommander.onQuestionSpoken = (question: string) => {
      if (activeTabRef.current !== 'chat' && activeTabRef.current !== 'multiview') {
        setActiveTab('chat');
      }
      setExternalQuestion({
        id: `voice_q_${Date.now()}`,
        text: question,
      });
    };

    voiceCommander.onTranscriptChange = (text: string) => {
      setLiveTranscript(text);
    };

    voiceCommander.onListeningStateChange = (listening: boolean) => {
      setIsVoiceListening(listening);
    };

    voiceCommander.onMicModeChange = (mode: ActiveMicMode) => {
      setMicMode(mode);
    };

    voiceCommander.onOfflineSpeechNotice = (notice: string) => {
      setStatusNotice(notice);
    };

    return () => {
      voiceCommander.stopListening();
    };
  }, [handleVoiceCommandAction]);

  const requestSensorsAccess = async () => {
    jarvisAudio.playAcknowledgeSound();
    let videoOk = false;
    let audioOk = false;

    try {
      const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoOk = true;
      setCameraPermission('granted');
      vStream.getTracks().forEach((t) => t.stop());
    } catch {
      setCameraPermission('denied');
    }

    try {
      const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioOk = true;
      setMicPermission('granted');
      aStream.getTracks().forEach((t) => t.stop());
      voiceCommander.setMicMode('mic1');
      setMicMode('mic1');
    } catch {
      setMicPermission('denied');
    }

    if (videoOk && audioOk) {
      const msg =
        'Camera and Mic 1 are online, Sir. Say start answering questions whenever you want Mic 2.';
      setStatusNotice(msg);
      if (!isMutedRef.current) jarvisAudio.speak(msg);
    } else if (audioOk) {
      const msg = 'Mic 1 is online, Sir. Say start answering questions to switch to Mic 2.';
      setStatusNotice(msg);
      if (!isMutedRef.current) jarvisAudio.speak(msg);
    }
  };

  const handleSpeak = (text: string) => {
    if (!isMutedRef.current) {
      jarvisAudio.speak(text);
    }
  };

  const handleTabChange = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    jarvisAudio.playAcknowledgeSound();
  };

  const handleExplainFromBioscience = (queryText: string) => {
    setActiveTab('chat');
    setExternalQuestion({
      id: `sci_explain_${Date.now()}`,
      text: queryText,
    });
  };

  const handleShareTrackToChat = async (track: GeneratedMusicPayload) => {
    const nowOrder = Date.now();
    const userMsg: ChatMessage = {
      id: `mus_u_${nowOrder}`,
      role: 'user',
      text: track.prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clientOrder: nowOrder,
    };
    const modelMsg: ChatMessage = {
      id: `mus_m_${nowOrder + 1}`,
      role: 'model',
      text: track.lyrics
        ? `Generated music track (${track.durationLabel}) using ${track.modelUsed}.\n\n${track.lyrics}`
        : `Generated music track (${track.durationLabel}) using ${track.modelUsed}.`,
      fullText: track.lyrics
        ? `Generated music track (${track.durationLabel}) using ${track.modelUsed}.\n\n${track.lyrics}`
        : `Generated music track (${track.durationLabel}) using ${track.modelUsed}.`,
      modelUsed: track.modelUsed,
      generatedMusic: track,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      clientOrder: nowOrder + 1,
    };

    setActiveMessagesOptimistic((prev) => [
      ...prev.filter((m) => m.id !== 'msg-welcome'),
      userMsg,
      modelMsg,
    ]);
    setActiveTab('chat');
    setStatusNotice('Music track saved to conversation.');

    try {
      await persistConversationTurn({
        existingChatId: activeChatId,
        userMessage: userMsg,
        modelMessage: modelMsg,
      });
    } catch {}
  };

  const navBtnClass = (isActive: boolean) =>
    isActive
      ? 'bg-black text-white dark:bg-white dark:text-black font-semibold border border-black dark:border-white'
      : 'bg-neutral-100 text-neutral-700 hover:text-black border border-neutral-300 dark:bg-[#0d0d0d] dark:text-neutral-400 dark:hover:text-white dark:border-neutral-800';

  return (
    <div className="min-h-screen w-full bg-white text-black dark:bg-black dark:text-white flex overflow-x-hidden font-sans transition-colors duration-150">
      {/* Persistent Top-Left Sidebar: Brand ("Jarvis", no symbol) + Google Account + Settings (above Chat History) + Chat History */}
      <Sidebar
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenChatTab={() => setActiveTab('chat')}
        onOpenWorkspaceTab={() => setActiveTab('workspace')}
      />

      {/* Main Workspace (Pure White with Black Letters OR Pure Black with White Letters) */}
      <div className="flex-1 min-w-0 flex flex-col bg-white text-black dark:bg-black dark:text-white min-h-screen">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 w-full bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Mobile Menu + Minimalist Brand ("Jarvis" on mobile, no symbol) + Module Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-neutral-100 dark:bg-[#0f0f0f] border border-neutral-300 dark:border-neutral-800 text-black dark:text-neutral-200 hover:opacity-80 transition shrink-0 cursor-pointer"
              aria-label="Open menu and chat history"
            >
              <Menu className="w-4 h-4" />
            </button>

            <span className="lg:hidden text-lg font-display font-bold tracking-tight text-black dark:text-white mr-2 shrink-0">
              Jarvis
            </span>

            <nav className="flex items-center gap-1.5">
              <button
                onClick={() => handleTabChange('chat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'chat'
                )}`}
              >
                Jarvis
              </button>

              <button
                onClick={() => handleTabChange('workspace')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'workspace'
                )}`}
                title="Google Docs, Sheets, Slides, Gmail & Microsoft Excel Editor"
              >
                <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                <span>Office &amp; Workspace</span>
              </button>

              <button
                onClick={() => handleTabChange('bioscience')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'bioscience'
                )}`}
                title="AlphaFold 3D, RCSB PDB, PubChem, ChEMBL, gnomAD, ClinVar & Literature Workbench"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Bioscience</span>
              </button>

              <button
                onClick={() => handleTabChange('music')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'music'
                )}`}
                title="Lyria 3 Music Generation Studio (lyria-3-clip-preview & lyria-3-pro-preview)"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Music</span>
              </button>

              <button
                onClick={() => handleTabChange('ball')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'ball'
                )}`}
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Hand Cam 3D</span>
              </button>

              <button
                onClick={() => handleTabChange('camera')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'camera'
                )}`}
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>3D Dimension</span>
              </button>

              <button
                onClick={() => handleTabChange('radar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'radar'
                )}`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>10m Radar</span>
              </button>

              <button
                onClick={() =>
                  handleTabChange(activeTab === 'multiview' ? 'chat' : 'multiview')
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${navBtnClass(
                  activeTab === 'multiview'
                )}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Multi-View</span>
              </button>
            </nav>
          </div>

          {/* Right: Dual-Mic Switcher + Sensor & Utility Controls + Top-Right "Background Colors" Control */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Glitch-Free Dual-Mic Switcher: Mic 1 (Command) <-> Mic 2 (Answering Questions) */}
            <div className="flex items-center bg-neutral-100 dark:bg-[#0b0b0b] border border-neutral-300 dark:border-neutral-800 rounded-xl p-1 gap-1">
              <button
                onClick={() =>
                  handleSetDualMicMode(micMode === 'mic1' ? 'off' : 'mic1')
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  micMode === 'mic1'
                    ? 'bg-black text-white dark:bg-white dark:text-black font-semibold'
                    : 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
                }`}
                title='Mic 1 (Command Mic) — Say "start answering questions" to automatically switch to Mic 2'
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Mic 1: {micMode === 'mic1' ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() =>
                  handleSetDualMicMode(micMode === 'mic2' ? 'mic1' : 'mic2')
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                  micMode === 'mic2'
                    ? 'bg-emerald-500 text-black font-semibold'
                    : 'text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white'
                }`}
                title='Mic 2 (Answering Questions) — Automatically turns ON when you say "start answering questions", and switches back to Mic 1 on "stop answering questions"'
              >
                {micMode === 'mic2' ? (
                  <Mic className="w-3.5 h-3.5" />
                ) : (
                  <MicOff className="w-3.5 h-3.5" />
                )}
                <span>Mic 2 (Q&amp;A): {micMode === 'mic2' ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {(cameraPermission !== 'granted' || micPermission !== 'granted') && (
              <button
                onClick={requestSensorsAccess}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-[#121212] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-black dark:text-white transition whitespace-nowrap cursor-pointer"
                title="Authorize Camera & Microphone once"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Authorize Sensors</span>
              </button>
            )}

            <PWAInstallButton />

            <button
              onClick={() => {
                toggleForceOffline();
                jarvisAudio.playAcknowledgeSound();
                setStatusNotice(
                  !forceOffline
                    ? 'Local Offline Core active.'
                    : browserOnline
                    ? 'Online cloud connection active.'
                    : 'No internet — running on Local Offline Core.'
                );
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                !isOnline
                  ? 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60'
                  : 'bg-neutral-100 text-black border-neutral-300 hover:bg-neutral-200 dark:bg-[#0d0d0d] dark:text-neutral-300 dark:border-neutral-800 dark:hover:text-white'
              }`}
              title="Switch between Cloud Stream and On-Device Offline Mode"
            >
              {!isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Offline</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Online</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setIsPythonModalOpen(true);
                jarvisAudio.playAcknowledgeSound();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#0d0d0d] dark:hover:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg text-xs font-medium text-black dark:text-neutral-300 dark:hover:text-white transition whitespace-nowrap cursor-pointer"
              title="View and export Python desktop implementation"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Python</span>
            </button>

            <button
              onClick={() => {
                if (!isMuted) jarvisAudio.stopSpeaking();
                setIsMuted(!isMuted);
              }}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isMuted
                  ? 'bg-neutral-200 text-neutral-500 border-neutral-300 dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800'
                  : 'bg-neutral-100 text-black border-neutral-300 hover:border-neutral-500 dark:bg-[#0d0d0d] dark:text-white dark:border-neutral-800 dark:hover:border-neutral-700'
              }`}
              title={isMuted ? 'Voice output muted' : 'Voice output active'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Top-Right Corner Icon: "Background Colors" (Strictly Black OR White Only) */}
            <div
              className="flex items-center gap-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-[#0d0d0d] px-2.5 py-1"
              title="Background Colors: Switch between Black (white letters) and White (black letters)"
            >
              <button
                type="button"
                onClick={() => {
                  toggleBackgroundColor();
                  jarvisAudio.playAcknowledgeSound();
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-black dark:text-white whitespace-nowrap cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5 shrink-0" />
                <span>Background Colors</span>
              </button>

              <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-neutral-300 dark:border-neutral-700">
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundColor('black');
                    jarvisAudio.playAcknowledgeSound();
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    backgroundColor === 'black'
                      ? 'bg-black text-white border border-neutral-600'
                      : 'bg-white text-black border border-neutral-300 hover:bg-neutral-200'
                  }`}
                >
                  Black
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundColor('white');
                    jarvisAudio.playAcknowledgeSound();
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    backgroundColor === 'white'
                      ? 'bg-white text-black border border-black'
                      : 'bg-neutral-900 text-neutral-300 border border-neutral-700 hover:text-white'
                  }`}
                >
                  White
                </button>
              </div>
            </div>

            {/* Top-Right Battery Indicator with Live Level % and Charging Status */}
            <BatteryIndicator />
          </div>
        </header>

        {/* Subtle Voice Command & Live Transcript Strip */}
        <div className="w-full bg-neutral-50 dark:bg-[#050505] border-b border-neutral-200 dark:border-neutral-900 px-4 lg:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-neutral-600 dark:text-neutral-500 shrink-0">
              {micMode === 'mic2'
                ? 'Mic 2 (Answering Questions) — say "stop answering questions" for Mic 1'
                : micMode === 'mic1'
                ? 'Mic 1 (Commands) — say "start answering questions" for Mic 2'
                : 'Enable Mic 1 to use hands-free voice switching'}
            </span>
            {liveTranscript && (
              <span className="text-black dark:text-white font-mono truncate max-w-xs sm:max-w-md">
                “{liveTranscript}”
              </span>
            )}
            {!liveTranscript && statusNotice && (
              <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-xs sm:max-w-md">
                · {statusNotice}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => {
                startNewChat();
                setActiveTab('chat');
              }}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New Chat</span>
            </button>
            <button
              onClick={() =>
                handleSetDualMicMode(micMode === 'mic2' ? 'mic1' : 'mic2')
              }
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              {micMode === 'mic2' ? '"stop answering questions"' : '"start answering questions"'}
            </button>
            <button
              onClick={() => handleVoiceCommandAction('handcam')}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              "go to the hand cam"
            </button>
            <button
              onClick={() => handleVoiceCommandAction('dimension')}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              "start monitoring dimension"
            </button>
            <button
              onClick={() => handleVoiceCommandAction('radar')}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              "find the nearby device"
            </button>
            <button
              onClick={() => handleTabChange('bioscience')}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              Bioscience Lab
            </button>
            <button
              onClick={() => handleTabChange('music')}
              className="shrink-0 px-2 py-0.5 rounded bg-white hover:bg-neutral-200 dark:bg-[#111111] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-[11px] text-black dark:text-neutral-300 transition cursor-pointer"
            >
              Lyria Music
            </button>
          </div>
        </div>

        {/* Main Viewport Stage */}
        <main className="flex-1 w-full p-3 sm:p-5 flex flex-col max-w-6xl mx-auto">
          {activeTab === 'multiview' ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full flex-1">
              <div className="h-[520px]">
                <JarvisChat
                  isGlobalMuted={isMuted}
                  isOfflineMode={!isOnline}
                  externalQuestion={externalQuestion}
                  clearSignal={clearSignal}
                  micMode={micMode}
                  onSetMicMode={handleSetDualMicMode}
                  wakeWordOnly={wakeWordOnly}
                  onToggleWakeWordOnly={() => setWakeWordOnly((prev) => !prev)}
                  onStatusUpdate={setStatusNotice}
                  onOpenWorkspaceTab={handleOpenWorkspaceTab}
                />
              </div>
              <div className="h-[520px]">
                <GestureBall3D
                  onStatusUpdate={setStatusNotice}
                  autoStartCamera={handCamTrigger}
                />
              </div>
              <div className="h-[520px]">
                <CameraMeasurement
                  onSpeak={handleSpeak}
                  onStatusUpdate={setStatusNotice}
                  autoStartMonitoring={autoStartMonitoring}
                  isOfflineMode={!isOnline}
                />
              </div>
              <div className="h-[520px]">
                <RadarScanner
                  onStatusUpdate={setStatusNotice}
                  onSpeak={handleSpeak}
                  autoScanNearby={autoScanNearby}
                />
              </div>
            </div>
          ) : (
            <div className="w-full flex-1 flex flex-col min-h-[calc(100vh-122px)]">
              {activeTab === 'chat' && (
                <JarvisChat
                  isGlobalMuted={isMuted}
                  isOfflineMode={!isOnline}
                  externalQuestion={externalQuestion}
                  clearSignal={clearSignal}
                  micMode={micMode}
                  onSetMicMode={handleSetDualMicMode}
                  wakeWordOnly={wakeWordOnly}
                  onToggleWakeWordOnly={() => setWakeWordOnly((prev) => !prev)}
                  onStatusUpdate={setStatusNotice}
                  onOpenWorkspaceTab={handleOpenWorkspaceTab}
                />
              )}
              {activeTab === 'workspace' && (
                <div className="w-full flex-1 min-h-[calc(100vh-122px)] rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-800 shadow-xl">
                  <OfficeWorkspaceHub
                    initialTab={officeSubTab}
                    onClose={() => setActiveTab('chat')}
                  />
                </div>
              )}
              {activeTab === 'bioscience' && (
                <Suspense
                  fallback={
                    <div className="p-8 text-center text-sm text-neutral-500">
                      Loading Bioscience Workbench...
                    </div>
                  }
                >
                  <BioscienceWorkbench
                    onStatusUpdate={setStatusNotice}
                    onExplainInChat={handleExplainFromBioscience}
                  />
                </Suspense>
              )}
              {activeTab === 'music' && (
                <Suspense
                  fallback={
                    <div className="p-8 text-center text-sm text-neutral-500">
                      Loading Lyria 3 Music Studio...
                    </div>
                  }
                >
                  <MusicStudio
                    onStatusUpdate={setStatusNotice}
                    onShareTrackToChat={handleShareTrackToChat}
                  />
                </Suspense>
              )}
              {activeTab === 'ball' && (
                <GestureBall3D
                  onStatusUpdate={setStatusNotice}
                  autoStartCamera={handCamTrigger}
                />
              )}
              {activeTab === 'camera' && (
                <CameraMeasurement
                  onSpeak={handleSpeak}
                  onStatusUpdate={setStatusNotice}
                  autoStartMonitoring={autoStartMonitoring}
                  isOfflineMode={!isOnline}
                />
              )}
              {activeTab === 'radar' && (
                <RadarScanner
                  onStatusUpdate={setStatusNotice}
                  onSpeak={handleSpeak}
                  autoScanNearby={autoScanNearby}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <OfflineIndicator />

      <SettingsModal />

      <PythonCodeModal
        isOpen={isPythonModalOpen}
        onClose={() => setIsPythonModalOpen(false)}
      />
    </div>
  );
}
