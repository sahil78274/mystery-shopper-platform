import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getAuthSession,
  login as loginRequest,
  logout as logoutRequest,
  registerShopper,
  setAuthTokenGetter,
} from '@workspace/api-client-react';
import type { AuthUser, LoginInput, RegisterShopperInput } from '@workspace/api-client-react';

// Keep the original key so existing sessions survive the Ricoz branding update.
const TOKEN_STORAGE_KEY = 'fieldnote.session-token';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  /** True while the stored token is being verified on first load. */
  loading: boolean;
  login: (body: LoginInput) => Promise<AuthUser>;
  register: (body: RegisterShopperInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — the session stays in memory only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(readToken()));
  const queryClient = useQueryClient();

  // Generated API calls read the token from this getter on every request.
  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    writeToken(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const account = await getAuthSession();
      setUser(account);
    } catch {
      clearSession();
    }
  }, [token, clearSession]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const account = await getAuthSession();
        if (!active) return;
        setUser(account);
      } catch {
        if (!active) return;
        clearSession();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, clearSession]);

  const login = useCallback(
    async (body: LoginInput) => {
      const session = await loginRequest(body);
      writeToken(session.token);
      setToken(session.token);
      setUser(session.user);
      queryClient.clear();
      return session.user;
    },
    [queryClient],
  );

  const register = useCallback(
    async (body: RegisterShopperInput) => {
      const session = await registerShopper(body);
      writeToken(session.token);
      setToken(session.token);
      setUser(session.user);
      queryClient.clear();
      return session.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // The local session is cleared even if the server call fails.
    }
    clearSession();
    queryClient.clear();
  }, [clearSession, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, register, logout, refresh, setUser }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  mystery_shopper: 'Mystery Shopper',
  reviewer: 'Quality Reviewer',
  regional_executive: 'Regional Brand Executive',
};

export function roleLabel(role?: string | null): string {
  return ROLE_LABELS[role ?? ''] ?? 'Team member';
}

export function homeForRole(role?: string | null): string {
  switch (role) {
    case 'mystery_shopper':
      return '/my-work';
    case 'reviewer':
      return '/reviews';
    case 'regional_executive':
      return '/region';
    default:
      return '/';
  }
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | null)?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
