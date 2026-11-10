import React, { useMemo, useState } from 'react';
import {
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useJarvisSession } from '../contexts/JarvisSessionContext';
import { useJarvisPreferences } from '../contexts/JarvisPreferencesContext';

interface SidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenChatTab: () => void;
  onOpenWorkspaceTab?: () => void;
}

function getInitials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return 'U';
  const parts = nameOrEmail.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return nameOrEmail.slice(0, 2).toUpperCase();
}

function formatSessionDate(ms: number): string {
  const now = new Date();
  const date = new Date(ms);
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpenMobile,
  onCloseMobile,
  onOpenChatTab,
  onOpenWorkspaceTab,
}) => {
  const {
    user,
    authLoading,
    authError,
    chatsLoading,
    chatSessions,
    activeChatId,
    signInWithGoogle,
    signOutUser,
    startNewChat,
    selectChat,
    deleteChatSession,
  } = useJarvisSession();

  const { aiVoice, language, openSettings } = useJarvisPreferences();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chatSessions;
    return chatSessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [chatSessions, searchQuery]);

  const handleNewChat = () => {
    startNewChat();
    onOpenChatTab();
    onCloseMobile();
  };

  const handleSelectSession = (id: string) => {
    selectChat(id);
    onOpenChatTab();
    onCloseMobile();
  };

  const sidebarContent = (
    <aside className="w-[280px] shrink-0 h-full bg-white text-black dark:bg-[#070707] dark:text-white border-r border-neutral-200 dark:border-neutral-800 flex flex-col select-none">
      {/* Top-Left Minimalist Brand Header: Strictly "Jarvis" with NO symbol */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-900">
        <span className="text-xl font-display font-bold tracking-tight text-black dark:text-white">
          Jarvis
        </span>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Top-Left Google Login / Account Control */}
      <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800/90">
        {authLoading ? (
          <div className="h-[58px] rounded-xl bg-neutral-100 dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 animate-pulse" />
        ) : user ? (
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0e0e0e] border border-neutral-200 dark:border-neutral-800 space-y-2.5">
            <div className="flex items-center gap-3 min-w-0">
              {user.photoURL && !avatarFailed ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Google Account'}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-9 h-9 rounded-full object-cover border border-neutral-300 dark:border-neutral-700 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-xs font-semibold text-black dark:text-white shrink-0">
                  {getInitials(user.displayName || user.email)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-black dark:text-white truncate">
                  {user.displayName || 'Google Account'}
                </div>
                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">
                  {user.email}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800/80 text-[11px]">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                Synced across devices
              </span>
              <button
                onClick={signOutUser}
                className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition cursor-pointer"
                title="Sign out of Google account"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={signInWithGoogle}
              className="w-full py-2.5 px-3.5 rounded-xl bg-black hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-black text-xs font-semibold flex items-center justify-center gap-2.5 transition cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.4l3.99-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.99 3.09c.95-2.85 3.6-4.94 6.72-4.94z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-500 leading-snug px-0.5">
              Sign in to keep your chat history synced on every device.
            </p>
            {authError && (
              <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug px-0.5">
                {authError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add New Chat + Search + Settings Icon ABOVE Chat History */}
      <div className="p-3.5 pb-2 space-y-2.5">
        <button
          onClick={handleNewChat}
          className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
            activeChatId === null
              ? 'bg-neutral-100 border-neutral-400 text-black dark:bg-neutral-900 dark:border-neutral-700 dark:text-white'
              : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-800 hover:text-black dark:bg-[#0e0e0e] dark:hover:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200 dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-black dark:text-white" />
            <span>New Chat</span>
          </span>
          {activeChatId === null && (
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
              ACTIVE
            </span>
          )}
        </button>

        {/* Office & Workspace Hub Button */}
        {onOpenWorkspaceTab && (
          <button
            type="button"
            onClick={() => {
              onOpenWorkspaceTab();
              onCloseMobile();
            }}
            className="w-full py-2 px-3 rounded-xl border border-blue-500/30 bg-blue-50/60 hover:bg-blue-100/80 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center justify-between transition cursor-pointer"
            title="Google Docs, Sheets, Slides, Gmail & Microsoft Excel"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">🏢</span>
              <span>Office &amp; Workspace</span>
            </span>
            <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
              Docs &amp; Excel
            </span>
          </button>
        )}

        {/* Settings Icon Button Directly ABOVE Chat History */}
        <button
          type="button"
          onClick={() => {
            openSettings();
            onCloseMobile();
          }}
          className="w-full py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 hover:bg-neutral-100 dark:bg-[#0e0e0e] dark:hover:bg-neutral-900 text-black dark:text-white text-xs font-medium flex items-center justify-between transition cursor-pointer"
          title="Open Settings (Voice, Language, Sign-In Info, Add Account, Sign Out)"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-black dark:text-white" />
            <span>Settings</span>
          </span>
          <span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 truncate max-w-[125px]">
            {aiVoice} · {language.label}
          </span>
        </button>

        {/* Search Chat History */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chat history..."
            className="w-full bg-neutral-50 dark:bg-[#0d0d0d] border border-neutral-200 dark:border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-black dark:text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-600"
          />
        </div>
      </div>

      {/* Persistent Cross-Device Chat History List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        <div className="px-1.5 py-1.5 flex items-center justify-between text-[11px] font-medium text-neutral-600 dark:text-neutral-500">
          <span>Chat History</span>
          <span className="font-mono tabular-nums">{filteredSessions.length}</span>
        </div>

        {chatsLoading ? (
          <div className="space-y-1.5 pt-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-10 rounded-lg bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-900 animate-pulse"
              />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-2.5 py-6 text-center space-y-1">
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {searchQuery ? 'No matching conversations' : 'No previous chats yet'}
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-600 leading-relaxed">
              {user
                ? 'Ask Jarvis a question to save your first cloud-synced thread.'
                : 'Conversations save locally and sync across devices when signed in.'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isSelected = activeChatId === session.id;
            const isConfirmingDelete = confirmDeleteId === session.id;

            return (
              <div
                key={session.id}
                className={`group relative rounded-lg border transition ${
                  isSelected
                    ? 'bg-neutral-100 border-neutral-300 text-black dark:bg-neutral-900 dark:border-neutral-700 dark:text-white'
                    : 'bg-transparent hover:bg-neutral-100 border-transparent hover:border-neutral-200 text-neutral-800 dark:hover:bg-[#111111] dark:hover:border-neutral-800/80 dark:text-neutral-300'
                }`}
              >
                <button
                  onClick={() => handleSelectSession(session.id)}
                  className="w-full text-left px-2.5 py-2.5 pr-9 flex items-start gap-2.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500 group-hover:text-black dark:group-hover:text-neutral-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate leading-snug">
                      {session.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono tabular-nums text-neutral-500">
                      <span>{formatSessionDate(session.updatedAtMs)}</span>
                      <span>·</span>
                      <span>{session.messageCount} msgs</span>
                    </div>
                  </div>
                </button>

                {isConfirmingDelete ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(null);
                      deleteChatSession(session.id);
                    }}
                    onMouseLeave={() => setConfirmDeleteId(null)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-red-600 text-[10px] font-semibold text-white cursor-pointer"
                    title="Confirm delete chat"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:flex h-screen sticky top-0 z-30">{sidebarContent}</div>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
