import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const isConfigValid = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey.trim() !== "";

let app: any = null;
let auth: any = null;
let provider: any = null;

if (isConfigValid) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    // Request Workspace scope to only access spreadsheets and files created or opened by this applet
    provider.addScope('https://www.googleapis.com/auth/drive.file');
  } catch (e) {
    console.error('Firebase initialization failed:', e);
  }
}

export { auth };
export const isGoogleAuthEnabled = isConfigValid && auth !== null;

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!isGoogleAuthEnabled || !auth) {
    if (onAuthFailure) onAuthFailure();
    // Return a dummy unsubscribe function
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!isGoogleAuthEnabled || !auth || !provider) {
    throw new Error('Google Authentication is disabled: No API Key provided in firebase-applet-config.json');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogout = async () => {
  if (!isGoogleAuthEnabled || !auth) {
    cachedAccessToken = null;
    return;
  }
  await auth.signOut();
  cachedAccessToken = null;
};

