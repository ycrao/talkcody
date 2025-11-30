import type { User } from '@talkcody/shared';
import { toast } from 'sonner';
import { create } from 'zustand';
import { logger } from '@/lib/logger';
import { authService } from '@/services/auth-service';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthStore extends AuthState {
  signInWithGitHub: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  handleOAuthCallback: (token: string) => Promise<void>;
  loadUser: () => Promise<void>;
  initAuth: () => Promise<void>;
  initAuthFast: () => Promise<void>;
  loadUserIfNeeded: () => Promise<void>;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>((set, _get) => ({
  // Initial state
  user: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,

  /**
   * Sign in with GitHub
   * Opens system browser for OAuth flow
   */
  signInWithGitHub: async () => {
    try {
      set({ isLoading: true, error: null });
      await authService.initiateGitHubOAuth();
      // OAuth flow continues in browser and returns via deep link
      set({ isLoading: false });
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, isLoading: false });
      toast.error(`Failed to initiate sign in: ${errorMessage}`);
    }
  },

  /**
   * Sign in with Google
   * Opens system browser for OAuth flow
   */
  signInWithGoogle: async () => {
    try {
      set({ isLoading: true, error: null });
      await authService.initiateGoogleOAuth();
      // OAuth flow continues in browser and returns via deep link
      set({ isLoading: false });
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, isLoading: false });
      toast.error(`Failed to initiate sign in: ${errorMessage}`);
    }
  },

  /**
   * Sign out user
   * Removes auth token and clears user state
   */
  signOut: async () => {
    try {
      await authService.signOut();
      set({
        user: null,
        isAuthenticated: false,
        error: null,
      });
      toast.success('Signed out successfully');
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({ error: errorMessage });
      toast.error(`Failed to sign out: ${errorMessage}`);
    }
  },

  /**
   * Handle OAuth callback with token
   * Called when deep link is received after OAuth flow
   */
  handleOAuthCallback: async (token: string) => {
    try {
      logger.info('[Auth Store] handleOAuthCallback called with token length:', token.length);
      set({ isLoading: true, error: null });

      // Store the token securely
      logger.info('[Auth Store] Storing auth token...');
      await authService.storeAuthToken(token);
      logger.info('[Auth Store] Auth token stored successfully');

      // Fetch user profile
      logger.info('[Auth Store] Fetching user profile...');
      const user = await authService.fetchUserProfile();
      logger.info(
        '[Auth Store] User profile fetched:',
        user ? `${user.name} (${user.email})` : 'null'
      );

      if (user) {
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
        logger.info('[Auth Store] Auth state updated - user authenticated');
        toast.success('Signed in successfully');
      } else {
        logger.error('[Auth Store] Failed to fetch user profile - user is null');
        set({
          error: 'Failed to fetch user profile',
          isLoading: false,
        });
        toast.error('Failed to complete sign in');
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('[Auth Store] OAuth callback error:', errorMessage, error);
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(`Failed to complete sign in: ${errorMessage}`);
    }
  },

  /**
   * Load user profile from API
   * Used to refresh user data
   */
  loadUser: async () => {
    try {
      set({ isLoading: true, error: null });

      const user = await authService.fetchUserProfile();

      if (user) {
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      set({
        error: errorMessage,
        isLoading: false,
      });
    }
  },

  /**
   * Initialize auth state on app start
   * Checks if token exists and loads user profile
   * @deprecated Use initAuthFast for faster startup
   */
  initAuth: async () => {
    try {
      const isAuthenticated = await authService.isAuthenticated();

      if (isAuthenticated) {
        const user = await authService.fetchUserProfile();

        if (user) {
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          // Token exists but is invalid - clean up
          await authService.signOut();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Failed to initialize auth:', errorMessage);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
    }
  },

  /**
   * Fast auth initialization - only checks token existence, no network request
   * User profile is loaded lazily when needed via loadUserIfNeeded()
   */
  initAuthFast: async () => {
    try {
      const hasToken = await authService.isAuthenticated();

      if (hasToken) {
        // Mark as authenticated based on token existence
        // User profile will be loaded lazily when needed
        set({
          isAuthenticated: true,
          isLoading: false,
        });
        logger.info('[Auth Store] Fast init: token found, user will be loaded lazily');
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        logger.info('[Auth Store] Fast init: no token found');
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('Failed to initialize auth (fast):', errorMessage);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
    }
  },

  /**
   * Load user profile if authenticated but user data is not loaded yet
   * Call this when user info is needed (e.g., account settings, share features)
   */
  loadUserIfNeeded: async () => {
    const { isAuthenticated, user, isLoading } = _get();

    // Skip if not authenticated, already have user, or currently loading
    if (!isAuthenticated || user || isLoading) {
      return;
    }

    logger.info('[Auth Store] Loading user profile (lazy load)...');
    await _get().loadUser();
  },

  /**
   * Update user profile in store
   * Used after profile updates
   */
  updateUser: (user: User) => {
    set({ user });
  },
}));
