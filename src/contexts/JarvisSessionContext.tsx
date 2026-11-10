import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { GoogleAuthProvider } from 'firebase/auth';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  firebaseSignOut,
  onAuthStateChanged,
  setCachedAccessToken,
  getCachedAccessToken,
  handleFirestoreError,
  isPermissionDeniedError,
  validateAuthSessionToken,
  verifyFirestoreConnection,
  OperationType,
  type User,
} from '../firebase';

export interface GroundingSource {
  title: string;
  uri: string;
  domain?: string;
  sourceType?: 'web' | 'maps';
  reviewSnippet?: string;
}

export interface ProductStoreLink {
  storeName: string;
  url: string;
  kind: 'amazon' | 'flipkart' | 'retailer' | 'web';
}

export interface ComparisonSide {
  name: string;
  subtitle: string;
  imageUrl: string;
  highlights: string[];
  storeLinks?: ProductStoreLink[];
}

export interface ComparisonRow {
  feature: string;
  itemAValue: string;
  itemBValue: string;
}

export interface SingleVisualSection {
  heading: string;
  body: string;
}

export interface AiModeData {
  mode: 'comparison' | 'single_visual';
  cardKind?: 'explanation' | 'definition' | 'product_research';
  headline: string;
  summary: string;
  itemA?: ComparisonSide;
  itemB?: ComparisonSide;
  comparisonRows?: ComparisonRow[];
  verdict?: string;
  subjectName?: string;
  subjectSubtitle?: string;
  imageUrl?: string;
  highlights?: Array<{ label: string; value: string }>;
  sections?: SingleVisualSection[];
  storeLinks?: ProductStoreLink[];
  searchQueries?: string[];
  followUpQuestions?: string[];
}

export interface GeneratedImagePayload {
  imageUrl: string;
  prompt: string;
  wasModified: boolean;
  modelUsed?: string;
}

export interface GeneratedMusicPayload {
  audioDataUrl: string;
  mimeType: string;
  lyrics: string;
  prompt: string;
  modelUsed: string;
  durationLabel: string;
  isFallbackSynth?: boolean;
}

import type { SlideTheme } from '../services/aiWorkspaceClient';

export interface WorkspaceEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface WorkspaceActionPayload {
  type: 'slides' | 'doc' | 'sheet' | 'excel' | 'email';
  title: string;
  summary: string;
  slides?: Array<{ title: string; bullets: string[]; subtitle?: string }>;
  theme?: SlideTheme;
  docContent?: string;
  headers?: string[];
  rows?: any[][];
  emailData?: WorkspaceEmailPayload;
  createdUrl?: string;
  createdId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  fullText?: string;
  timestamp: string;
  clientOrder: number;
  modelUsed?: string;
  sources?: GroundingSource[];
  searchQueries?: string[];
  followUpQuestions?: string[];
  locationUsed?: string;
  aiMode?: AiModeData;
  workspaceAction?: WorkspaceActionPayload;
  generatedImage?: GeneratedImagePayload;
  generatedMusic?: GeneratedMusicPayload;
  attachedPhotoUrls?: string[];
  attachedFileNames?: string[];
  isError?: boolean;
  isStreaming?: boolean;
  isOfflineGenerated?: boolean;
  retryPrompt?: string;
  requiresWorkspaceAuth?: boolean;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface KnownGoogleAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastSignedInAt: number;
}

interface LocalStoredSession extends ChatSessionSummary {
  messages: ChatMessage[];
}

interface JarvisSessionContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  knownAccounts: KnownGoogleAccount[];
  chatsLoading: boolean;
  chatSessions: ChatSessionSummary[];
  activeChatId: string | null;
  activeMessages: ChatMessage[];
  workspaceToken: string | null;
  getValidWorkspaceToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  addNewGoogleAccount: () => Promise<void>;
  signOutUser: () => Promise<void>;
  startNewChat: () => void;
  selectChat: (chatId: string) => void;
  deleteChatSession: (chatId: string) => Promise<void>;
  setActiveMessagesOptimistic: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  persistConversationTurn: (params: {
    existingChatId: string | null;
    userMessage: ChatMessage;
    modelMessage: ChatMessage;
  }) => Promise<string>;
}

const LOCAL_SESSIONS_KEY = 'jarvis_local_sessions_v2';
const LEGACY_HISTORY_KEY = 'jarvis_chat_history_v1';
const KNOWN_ACCOUNTS_KEY = 'jarvis2_known_accounts_v1';
const RICH_MEDIA_CACHE_KEY = 'jarvis2_rich_msg_cache_v1';

interface RichMediaCacheEntry {
  aiMode?: AiModeData;
  workspaceAction?: WorkspaceActionPayload;
  generatedImage?: GeneratedImagePayload;
  generatedMusic?: GeneratedMusicPayload;
  attachedPhotoUrls?: string[];
  attachedFileNames?: string[];
  savedAt: number;
}

function loadRichMediaCache(): Record<string, RichMediaCacheEntry> {
  try {
    const raw = localStorage.getItem(RICH_MEDIA_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRichMediaEntry(msgId: string, entry: Omit<RichMediaCacheEntry, 'savedAt'>) {
  if (
    !entry.aiMode &&
    !entry.workspaceAction &&
    !entry.generatedImage &&
    !entry.generatedMusic &&
    (!entry.attachedPhotoUrls || entry.attachedPhotoUrls.length === 0) &&
    (!entry.attachedFileNames || entry.attachedFileNames.length === 0)
  ) {
    return;
  }
  try {
    const cache = loadRichMediaCache();
    cache[msgId] = { ...entry, savedAt: Date.now() };
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, 24);
    localStorage.setItem(RICH_MEDIA_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

function loadKnownAccounts(): KnownGoogleAccount[] {
  try {
    const raw = localStorage.getItem(KNOWN_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveKnownAccounts(accounts: KnownGoogleAccount[]) {
  try {
    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 10)));
  } catch {}
}

export function createWelcomeMessage(): ChatMessage {
  return {
    id: 'msg-welcome',
    role: 'model',
    text: 'Welcome to Jarvis 2.5! Ask me to explain differences side-by-side with visuals, create or modify images, upload up to 15 photos or large files, search Google & Maps, draft and review emails via Gmail, make themed Google Slides, or start a live voice conversation.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    clientOrder: 0,
  };
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function buildTitleFromPrompt(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New Conversation';
  return cleaned.length > 64 ? `${cleaned.slice(0, 61).trim()}...` : cleaned;
}

function loadLocalSessions(storageKey = LOCAL_SESSIONS_KEY): LocalStoredSession[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    if (storageKey === LOCAL_SESSIONS_KEY) {
      const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacy) {
        const legacyMsgs = JSON.parse(legacy);
        if (Array.isArray(legacyMsgs)) {
          const realMsgs: ChatMessage[] = legacyMsgs
            .filter((m: any) => m && m.id !== 'msg-0' && m.text)
            .map((m: any, idx: number) => ({
              id: typeof m.id === 'string' ? m.id.replace(/[^a-zA-Z0-9_-]/g, '_') : `legacy_${idx}`,
              role: m.role === 'user' ? 'user' : 'model',
              text: String(m.text),
              fullText: String(m.fullText || m.text),
              timestamp: String(m.timestamp || ''),
              clientOrder: idx + 1,
              sources: Array.isArray(m.sources) ? m.sources : [],
              isOfflineGenerated: Boolean(m.isOfflineGenerated),
            }));

          if (realMsgs.length > 0) {
            const firstUser = realMsgs.find((m) => m.role === 'user');
            const migrated: LocalStoredSession = {
              id: makeSafeId('local'),
              title: buildTitleFromPrompt(firstUser?.text || realMsgs[0].text),
              messageCount: realMsgs.length,
              createdAtMs: Date.now() - 60000,
              updatedAtMs: Date.now() - 60000,
              messages: realMsgs,
            };
            localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([migrated]));
            return [migrated];
          }
        }
      }
    }
  } catch {}
  return [];
}

function saveLocalSessions(sessions: LocalStoredSession[], storageKey = LOCAL_SESSIONS_KEY) {
  try {
    const compact = sessions.slice(0, 80).map((s) => ({
      ...s,
      messages: s.messages.map((m) => ({
        ...m,
        attachedPhotoUrls: m.attachedPhotoUrls?.slice(0, 4),
      })),
    }));
    localStorage.setItem(storageKey, JSON.stringify(compact));
  } catch {}
}

function toMillis(val: unknown, fallback: number): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (val && typeof (val as any).toMillis === 'function') {
    return (val as any).toMillis();
  }
  return fallback;
}

const JarvisSessionContext = createContext<JarvisSessionContextValue | null>(null);

export const JarvisSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [cloudTokenHealthy, setCloudTokenHealthy] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(() =>
    getCachedAccessToken()
  );
  const [knownAccounts, setKnownAccounts] = useState<KnownGoogleAccount[]>(() =>
    loadKnownAccounts()
  );
  const [chatsLoading, setChatsLoading] = useState<boolean>(false);

  const [localSessions, setLocalSessions] = useState<LocalStoredSession[]>(() =>
    loadLocalSessions()
  );
  const [cloudSessions, setCloudSessions] = useState<ChatSessionSummary[]>([]);

  // Always start in a fresh New Chat upon entering Jarvis 2.5 while preserving chat history
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>(() => [
    createWelcomeMessage(),
  ]);

  const userRef = useRef<User | null>(null);
  const cloudTokenHealthyRef = useRef<boolean>(false);
  const activeChatIdRef = useRef<string | null>(null);
  const inFlightCreatedChatIdRef = useRef<string | null>(null);
  const fatalFirestoreErrorState = useState<Error | null>(null);

  if (fatalFirestoreErrorState[0]) {
    throw fatalFirestoreErrorState[0];
  }

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    cloudTokenHealthyRef.current = cloudTokenHealthy;
  }, [cloudTokenHealthy]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    verifyFirestoreConnection();
  }, []);

  const syncUserProfile = useCallback(async (firebaseUser: User) => {
    const uid = firebaseUser.uid;
    const userPath = `users/${uid}`;
    const userDocRef = doc(db, 'users', uid);

    const safeEmail = (firebaseUser.email || 'user@example.com').slice(0, 254);
    const safeName = (
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'Jarvis User'
    ).slice(0, 100);
    const safePhoto = (firebaseUser.photoURL || '').slice(0, 1000);

    setKnownAccounts((prev) => {
      const updatedAccount: KnownGoogleAccount = {
        uid,
        email: safeEmail,
        displayName: safeName,
        photoURL: safePhoto,
        lastSignedInAt: Date.now(),
      };
      const next = [updatedAccount, ...prev.filter((a) => a.uid !== uid && a.email !== safeEmail)];
      saveKnownAccounts(next);
      return next;
    });

    try {
      const existing = await getDoc(userDocRef);
      if (!existing.exists()) {
        await setDoc(userDocRef, {
          uid,
          email: safeEmail,
          displayName: safeName,
          photoURL: safePhoto,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userDocRef, {
          email: safeEmail,
          displayName: safeName,
          photoURL: safePhoto,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        try {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        } catch {
          // Non-fatal profile sync warning
        }
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      const previousUid = userRef.current?.uid;

      if (!nextUser) {
        if (cancelled) return;
        setUser(null);
        setWorkspaceToken(null);
        setCachedAccessToken(null);
        setCloudTokenHealthy(false);
        setAuthLoading(false);
        setAuthError(null);
        setCloudSessions([]);
        setChatsLoading(false);
        if (previousUid) {
          setActiveChatId(null);
          setActiveMessages([createWelcomeMessage()]);
        }
        return;
      }

      // Validate that the auth token can be minted/refreshed before touching Firestore
      const tokenOk = await validateAuthSessionToken(nextUser);
      if (cancelled) return;

      if (!tokenOk) {
        // Stale or broken token was cleared or offline; operate cleanly on local sessions
        setUser(auth.currentUser);
        setCloudTokenHealthy(false);
        setAuthLoading(false);
        setChatsLoading(false);
        return;
      }

      setUser(nextUser);
      setCloudTokenHealthy(true);
      setAuthLoading(false);
      setAuthError(null);

      syncUserProfile(nextUser);
      if (previousUid !== nextUser.uid) {
        setActiveChatId(null);
        setActiveMessages([createWelcomeMessage()]);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [syncUserProfile]);

  // Subscribe to cloud chat sessions ONLY when user is signed in AND token is verified healthy
  useEffect(() => {
    if (!user || !cloudTokenHealthy) {
      setChatsLoading(false);
      return;
    }

    setChatsLoading(true);
    const chatsPath = `users/${user.uid}/chats`;
    const chatsQuery = query(
      collection(db, 'users', user.uid, 'chats'),
      where('ownerId', '==', user.uid)
    );

    const unsub = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const now = Date.now();
        const items: ChatSessionSummary[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const createdMs = toMillis(d.createdAt, now);
          const updatedMs = toMillis(d.updatedAt, createdMs);
          return {
            id: docSnap.id,
            title: String(d.title || 'Conversation'),
            messageCount: typeof d.messageCount === 'number' ? d.messageCount : 0,
            createdAtMs: createdMs,
            updatedAtMs: updatedMs,
          };
        });

        items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setCloudSessions(items);
        setChatsLoading(false);
      },
      (err) => {
        setChatsLoading(false);
        if (isPermissionDeniedError(err)) {
          try {
            handleFirestoreError(err, OperationType.LIST, chatsPath);
          } catch (formatted) {
            fatalFirestoreErrorState[1](formatted as Error);
          }
          return;
        }
        // Transient network / token propagation issue -> fall back smoothly to local sessions
        setCloudTokenHealthy(false);
      }
    );

    return () => unsub();
  }, [user, cloudTokenHealthy]);

  // Subscribe to messages for the selected chat
  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    if (!user || !cloudTokenHealthy) {
      const found = localSessions.find((s) => s.id === activeChatId);
      if (found && found.messages.length > 0) {
        setActiveMessages(found.messages);
      }
      return;
    }

    if (inFlightCreatedChatIdRef.current === activeChatId) {
      return;
    }

    const msgsPath = `users/${user.uid}/chats/${activeChatId}/messages`;
    const msgsQuery = query(
      collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'),
      where('ownerId', '==', user.uid)
    );

    const unsub = onSnapshot(
      msgsQuery,
      (snapshot) => {
        if (inFlightCreatedChatIdRef.current === activeChatId) {
          return;
        }
        const richCache = loadRichMediaCache();

        const loaded: ChatMessage[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          let parsedSources: GroundingSource[] = [];
          if (typeof d.sourcesJson === 'string' && d.sourcesJson.startsWith('[')) {
            try {
              parsedSources = JSON.parse(d.sourcesJson);
            } catch {
              parsedSources = [];
            }
          }
          const createdMs = toMillis(d.createdAt, Date.now());
          const formattedTime = new Date(createdMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const cachedRich = richCache[docSnap.id];

          return {
            id: docSnap.id,
            role: d.role === 'user' ? 'user' : 'model',
            text: String(d.text || ''),
            fullText: String(d.text || ''),
            timestamp: formattedTime,
            clientOrder: typeof d.clientOrder === 'number' ? d.clientOrder : createdMs,
            sources: parsedSources,
            aiMode: cachedRich?.aiMode,
            workspaceAction: cachedRich?.workspaceAction,
            generatedImage: cachedRich?.generatedImage,
            generatedMusic: cachedRich?.generatedMusic,
            attachedPhotoUrls: cachedRich?.attachedPhotoUrls,
            attachedFileNames: cachedRich?.attachedFileNames,
            isOfflineGenerated: Boolean(d.isOfflineGenerated),
          };
        });

        loaded.sort((a, b) => a.clientOrder - b.clientOrder);

        setActiveMessages((prev) => {
          const streamingMsg = prev.find((m) => m.isStreaming);
          if (streamingMsg && !loaded.some((l) => l.id === streamingMsg.id)) {
            return [...loaded, streamingMsg];
          }
          return loaded.length > 0 ? loaded : [createWelcomeMessage()];
        });
      },
      (err) => {
        if (isPermissionDeniedError(err)) {
          try {
            handleFirestoreError(err, OperationType.LIST, msgsPath);
          } catch (formatted) {
            fatalFirestoreErrorState[1](formatted as Error);
          }
          return;
        }
        setCloudTokenHealthy(false);
      }
    );

    return () => unsub();
  }, [user, cloudTokenHealthy, activeChatId, localSessions]);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setCachedAccessToken(token);
        setWorkspaceToken(token);
      }
      return token;
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
        return null;
      }
      setAuthError(err?.message || 'Unable to sign in with Google. Please try again.');
      return null;
    }
  }, []);

  const getValidWorkspaceToken = useCallback(async (): Promise<string | null> => {
    const cached = getCachedAccessToken();
    if (cached) {
      if (workspaceToken !== cached) {
        setWorkspaceToken(cached);
      }
      return cached;
    }
    // Prompt Google Auth with workspace scopes if not cached
    return await signInWithGoogle();
  }, [workspaceToken, signInWithGoogle]);

  const addNewGoogleAccount = useCallback(async () => {
    setAuthError(null);
    try {
      const accountSelectorProvider = new GoogleAuthProvider();
      accountSelectorProvider.setCustomParameters({
        prompt: 'select_account',
      });
      const result = await signInWithPopup(auth, accountSelectorProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setCachedAccessToken(token);
        setWorkspaceToken(token);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
        return;
      }
      setAuthError(err?.message || 'Unable to add Google account. Please try again.');
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      setCachedAccessToken(null);
      setWorkspaceToken(null);
      setCloudTokenHealthy(false);
      setActiveChatId(null);
      setActiveMessages([createWelcomeMessage()]);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign out failed.');
    }
  }, []);

  const startNewChat = useCallback(() => {
    inFlightCreatedChatIdRef.current = null;
    setActiveChatId(null);
    setActiveMessages([createWelcomeMessage()]);
  }, []);

  const selectChat = useCallback(
    (chatId: string) => {
      inFlightCreatedChatIdRef.current = null;
      setActiveChatId(chatId);
      if (!userRef.current || !cloudTokenHealthyRef.current) {
        const found = localSessions.find((s) => s.id === chatId);
        if (found) {
          setActiveMessages(found.messages);
        }
      }
    },
    [localSessions]
  );

  const deleteChatSession = useCallback(async (chatId: string) => {
    if (activeChatIdRef.current === chatId) {
      setActiveChatId(null);
      setActiveMessages([createWelcomeMessage()]);
    }

    const currentUser = userRef.current;
    if (!currentUser || !cloudTokenHealthyRef.current) {
      setLocalSessions((prev) => {
        const next = prev.filter((s) => s.id !== chatId);
        saveLocalSessions(next);
        return next;
      });
      return;
    }

    const chatPath = `users/${currentUser.uid}/chats/${chatId}`;
    try {
      const msgsSnap = await getDocs(
        query(
          collection(db, 'users', currentUser.uid, 'chats', chatId, 'messages'),
          where('ownerId', '==', currentUser.uid)
        )
      );
      for (const msgDoc of msgsSnap.docs) {
        await deleteDoc(msgDoc.ref);
      }
      await deleteDoc(doc(db, 'users', currentUser.uid, 'chats', chatId));
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        handleFirestoreError(err, OperationType.DELETE, chatPath);
      }
    }
  }, []);

  const persistTurnLocally = useCallback(
    (resolvedChatId: string, isNewChat: boolean, userMessage: ChatMessage, modelMessage: ChatMessage) => {
      setLocalSessions((prev) => {
        const now = Date.now();
        const idx = prev.findIndex((s) => s.id === resolvedChatId);
        let next: LocalStoredSession[];

        if (idx === -1) {
          const created: LocalStoredSession = {
            id: resolvedChatId,
            title: buildTitleFromPrompt(userMessage.text),
            messageCount: 2,
            createdAtMs: now,
            updatedAtMs: now,
            messages: [userMessage, modelMessage],
          };
          next = [created, ...prev];
        } else {
          const current = prev[idx];
          const filteredMsgs = current.messages.filter(
            (m) => m.id !== userMessage.id && m.id !== modelMessage.id && m.id !== 'msg-welcome'
          );
          const updated: LocalStoredSession = {
            ...current,
            updatedAtMs: now,
            messageCount: filteredMsgs.length + 2,
            messages: [...filteredMsgs, userMessage, modelMessage],
          };
          next = [updated, ...prev.filter((_, i) => i !== idx)];
        }

        saveLocalSessions(next);
        return next;
      });

      if (isNewChat) {
        setActiveChatId(resolvedChatId);
      }
    },
    []
  );

  const persistConversationTurn = useCallback(
    async ({
      existingChatId,
      userMessage,
      modelMessage,
    }: {
      existingChatId: string | null;
      userMessage: ChatMessage;
      modelMessage: ChatMessage;
    }): Promise<string> => {
      const currentUser = userRef.current;
      const resolvedChatId = existingChatId || makeSafeId('chat');
      const isNewChat = !existingChatId;

      const safeUserMsgId = userMessage.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeModelMsgId = modelMessage.id.replace(/[^a-zA-Z0-9_-]/g, '_');

      saveRichMediaEntry(safeUserMsgId, {
        attachedPhotoUrls: userMessage.attachedPhotoUrls?.slice(0, 6),
        attachedFileNames: userMessage.attachedFileNames,
      });
      saveRichMediaEntry(safeModelMsgId, {
        aiMode: modelMessage.aiMode,
        workspaceAction: modelMessage.workspaceAction,
        generatedImage: modelMessage.generatedImage,
        generatedMusic: modelMessage.generatedMusic,
      });

      if (!currentUser || !cloudTokenHealthyRef.current) {
        persistTurnLocally(resolvedChatId, isNewChat, userMessage, modelMessage);
        return resolvedChatId;
      }

      const uid = currentUser.uid;
      const chatPath = `users/${uid}/chats/${resolvedChatId}`;
      const chatRef = doc(db, 'users', uid, 'chats', resolvedChatId);
      const userMsgRef = doc(db, 'users', uid, 'chats', resolvedChatId, 'messages', safeUserMsgId);
      const modelMsgRef = doc(
        db,
        'users',
        uid,
        'chats',
        resolvedChatId,
        'messages',
        safeModelMsgId
      );

      const safeUserText = (userMessage.text || 'Uploaded attachment').slice(0, 24900);
      const safeModelText = (modelMessage.fullText || modelMessage.text || 'Done.').slice(0, 24900);
      const safeSourcesJson = JSON.stringify((modelMessage.sources || []).slice(0, 8)).slice(
        0,
        7900
      );

      if (isNewChat) {
        inFlightCreatedChatIdRef.current = resolvedChatId;
        setActiveChatId(resolvedChatId);
      }

      try {
        if (isNewChat) {
          await setDoc(chatRef, {
            ownerId: uid,
            title: buildTitleFromPrompt(safeUserText),
            messageCount: 2,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const existingSummary = cloudSessions.find((c) => c.id === resolvedChatId);
          const nextCount = Math.min(5000, (existingSummary?.messageCount || 0) + 2);
          await updateDoc(chatRef, {
            title: existingSummary?.title || buildTitleFromPrompt(safeUserText),
            messageCount: nextCount,
            updatedAt: serverTimestamp(),
          });
        }

        const baseOrder = Date.now();
        await setDoc(userMsgRef, {
          chatId: resolvedChatId,
          ownerId: uid,
          role: 'user',
          text: safeUserText,
          sourcesJson: '[]',
          isOfflineGenerated: false,
          clientOrder: userMessage.clientOrder > 0 ? userMessage.clientOrder : baseOrder,
          createdAt: serverTimestamp(),
        });

        await setDoc(modelMsgRef, {
          chatId: resolvedChatId,
          ownerId: uid,
          role: 'model',
          text: safeModelText,
          sourcesJson: safeSourcesJson.length >= 2 ? safeSourcesJson : '[]',
          isOfflineGenerated: Boolean(modelMessage.isOfflineGenerated),
          clientOrder:
            modelMessage.clientOrder > userMessage.clientOrder
              ? modelMessage.clientOrder
              : baseOrder + 1,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        inFlightCreatedChatIdRef.current = null;
        if (isPermissionDeniedError(err)) {
          handleFirestoreError(err, OperationType.WRITE, chatPath);
        }
        // Save locally so the user never loses their conversation turn on transient offline/token glitches
        persistTurnLocally(resolvedChatId, isNewChat, userMessage, modelMessage);
      } finally {
        inFlightCreatedChatIdRef.current = null;
      }

      return resolvedChatId;
    },
    [cloudSessions, persistTurnLocally]
  );

  const displayedSessions: ChatSessionSummary[] =
    user && cloudTokenHealthy
      ? cloudSessions
      : localSessions.map(({ messages: _m, ...summary }) => summary);

  return (
    <JarvisSessionContext.Provider
      value={{
        user,
        authLoading,
        authError,
        knownAccounts,
        chatsLoading: user && cloudTokenHealthy ? chatsLoading : false,
        chatSessions: displayedSessions,
        activeChatId,
        activeMessages,
        workspaceToken,
        getValidWorkspaceToken,
        signInWithGoogle,
        addNewGoogleAccount,
        signOutUser,
        startNewChat,
        selectChat,
        deleteChatSession,
        setActiveMessagesOptimistic: setActiveMessages,
        persistConversationTurn,
      }}
    >
      {children}
    </JarvisSessionContext.Provider>
  );
};

export function useJarvisSession(): JarvisSessionContextValue {
  const ctx = useContext(JarvisSessionContext);
  if (!ctx) {
    throw new Error('useJarvisSession must be used inside JarvisSessionProvider');
  }
  return ctx;
}
