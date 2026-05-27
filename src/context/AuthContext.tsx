import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContextType, AuthUser } from '../types/auth';
import {
  clearStoredAuth,
  fetchCurrentUser,
  getStoredToken,
  getStoredUser,
  loginWithPassword,
  logoutFromServer,
  persistAuth,
  registerWithPassword,
} from '../services/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapAuthError(error: unknown) {
  if (!(error instanceof Error)) return '操作失败，请稍后重试。';

  switch (error.message) {
    case 'invalid_username':
      return '用户名只能包含字母、数字或下划线，长度 3 到 20 位。';
    case 'invalid_password':
      return '密码长度需在 6 到 64 位之间。';
    case 'username_exists':
      return '这个用户名已经被注册了。';
    case 'invalid_credentials':
      return '用户名或密码不正确。';
    case 'unauthorized':
      return '登录状态已失效，请重新登录。';
    default:
      return '操作失败，请稍后重试。';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(!!getStoredToken());
  const [error, setError] = useState('');

  useEffect(() => {
    const syncStoredUser = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetchCurrentUser();
        persistAuth(token, response.user);
        setUser(response.user);
        setError('');
      } catch (authError) {
        clearStoredAuth();
        setToken('');
        setUser(null);
        setError(mapAuthError(authError));
      } finally {
        setIsLoading(false);
      }
    };

    void syncStoredUser();
  }, [token]);

  const handleAuthSuccess = (nextToken: string, nextUser: AuthUser) => {
    persistAuth(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
    setError('');
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await loginWithPassword(username, password);
      handleAuthSuccess(response.token, response.user);
    } catch (authError) {
      setError(mapAuthError(authError));
      throw authError;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await registerWithPassword(username, password);
      handleAuthSuccess(response.token, response.user);
    } catch (authError) {
      setError(mapAuthError(authError));
      throw authError;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutFromServer();
    } finally {
      clearStoredAuth();
      setToken('');
      setUser(null);
      setError('');
      setIsLoading(false);
    }
  };

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError: () => setError(''),
  }), [error, isLoading, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
