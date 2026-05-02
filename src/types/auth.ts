export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  token: string;
  isLoading: boolean;
  error: string;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}
