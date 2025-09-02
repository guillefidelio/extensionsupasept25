import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthState, User } from '../types';
import { getAuthState, signOut } from '../utils/auth';

interface AuthContextType {
  authState: AuthState;
  login: (user: User) => void;
  logout: () => Promise<void>;
  updateAuthState: (updates: Partial<AuthState>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true
  });

  // Check authentication state on mount
  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const currentAuthState = await getAuthState();
      setAuthState({
        ...currentAuthState,
        isLoading: false
      });
    } catch (error) {
      console.error('Error checking auth state:', error);
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        error: 'Failed to check authentication status'
      });
    }
  };

  const login = (user: User) => {
    setAuthState({
      isAuthenticated: true,
      user,
      isLoading: false,
      error: undefined
    });
  };

  const logout = async () => {
    try {
      await signOut();
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: undefined,
        token: undefined,
        tokenExpiry: undefined,
        error: undefined
      });
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if logout fails, clear local state
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: undefined,
        token: undefined,
        tokenExpiry: undefined,
        error: 'Logout failed, but you have been signed out locally'
      });
    }
  };

  const updateAuthState = (updates: Partial<AuthState>) => {
    setAuthState(prev => ({ ...prev, ...updates }));
  };

  const value: AuthContextType = {
    authState,
    login,
    logout,
    updateAuthState
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


