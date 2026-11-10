import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress noisy internal WebChannel transport retry logs in the browser console;
// explicit application diagnostics are handled via verifyFirestoreConnection & handleFirestoreError.
try {
  setLogLevel('silent');
} catch {}

const app = initializeApp(firebaseConfig);

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    (firebaseConfig as any).firestoreDatabaseId
  );
} catch {
  firestoreInstance = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
}

export const db: Firestore = firestoreInstance;
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
] as const;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
WORKSPACE_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

// In-memory access token cache (MANDATORY: never store in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

// Clear token on sign out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as any)?.code || '';
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    code === 'permission-denied' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED')
  );
}

export function isTokenServiceOrTransientError(error: unknown): boolean {
  const code = (error as any)?.code || '';
  const msg = error instanceof Error ? error.message : String(error || '');
  return (
    code === 'unavailable' ||
    msg.includes('token-service-api') ||
    msg.includes('securetoken.googleapis.com') ||
    msg.includes('Fetching auth token failed') ||
    msg.includes('the client is offline') ||
    msg.includes('Failed to get document')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Verifies whether a signed-in user's ID token can be refreshed cleanly.
 * If a stale cached session fails because `securetoken.googleapis.com` is still propagating
 * or disabled, clears the broken cached token so Firestore does not repeatedly fail to connect.
 */
export async function validateAuthSessionToken(candidateUser: User | null): Promise<boolean> {
  if (!candidateUser) return false;
  try {
    await candidateUser.getIdToken();
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (
      msg.includes('token-service-api') ||
      msg.includes('securetoken.googleapis.com') ||
      msg.includes('user-token-expired') ||
      msg.includes('invalid-user-token')
    ) {
      try {
        await firebaseSignOut(auth);
      } catch {}
      return false;
    }
    // Network offline — keep user session locally without cloud calls
    return false;
  }
}

let connectionTested = false;
export async function verifyFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (auth.currentUser) {
      const valid = await validateAuthSessionToken(auth.currentUser);
      if (!valid) {
        return;
      }
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isTokenServiceOrTransientError(error)) {
      // Operate smoothly in persistent local cache / offline mode while network or token service propagates
      return;
    }
    if (error instanceof Error && error.message.includes('project')) {
      console.warn('Firestore connection check notice:', error.message);
    }
  }
}

export { signInWithPopup, firebaseSignOut, onAuthStateChanged, type User };
