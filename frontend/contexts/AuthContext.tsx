/**
 * Authentication Context
 * Manages user authentication state throughout the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setTokens, clearTokens, getAccessToken, TokenResponse } from '../services/api';
import { USER_DATA_KEY } from '../constants/config';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Types
export interface User {
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'staff' | 'customer';
  business_id?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  is_verified: boolean;
  timezone: string;
  notification_preferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  timezone?: string;
  // Business registration (optional)
  business_name?: string;
  business_phone?: string;
  business_address?: string;
  business_city?: string;
  business_state?: string;
  business_zip?: string;
  vertical?: string; // Service vertical: hvac, lawn_care, plumbing, etc.
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

// Storage helpers
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Initialize auth state from storage
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const token = await getAccessToken();

      if (!token) {
        setState({ user: null, isLoading: false, isAuthenticated: false });
        return;
      }

      // Try to get cached user data
      const cachedUser = await storage.getItem(USER_DATA_KEY);
      if (cachedUser) {
        const user = JSON.parse(cachedUser);
        setState({ user, isLoading: false, isAuthenticated: true });
      }

      // Fetch fresh user data
      const response = await api.get<User>('/auth/me');

      if (response.success && response.data) {
        await storage.setItem(USER_DATA_KEY, JSON.stringify(response.data));
        setState({
          user: response.data,
          isLoading: false,
          isAuthenticated: true,
        });
      } else {
        // Token invalid, clear auth
        await clearTokens();
        await storage.removeItem(USER_DATA_KEY);
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  };

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      const response = await api.post<TokenResponse>('/auth/login', credentials);

      if (response.success && response.data) {
        const { access_token, refresh_token, ...userData } = response.data;

        await setTokens(access_token, refresh_token);

        const user: User = {
          user_id: userData.user_id,
          email: userData.email,
          role: userData.role as User['role'],
          business_id: userData.business_id,
          first_name: userData.first_name,
          last_name: userData.last_name,
          is_verified: true,
          timezone: 'America/Chicago',
          notification_preferences: { email: true, sms: true, push: true },
        };

        await storage.setItem(USER_DATA_KEY, JSON.stringify(user));
        setState({ user, isLoading: false, isAuthenticated: true });

        return { success: true };
      }

      return {
        success: false,
        error: response.error?.message || 'Login failed',
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const response = await api.post<TokenResponse>('/auth/register', data);

      if (response.success && response.data) {
        const { access_token, refresh_token, ...userData } = response.data;

        await setTokens(access_token, refresh_token);

        const user: User = {
          user_id: userData.user_id,
          email: userData.email,
          role: userData.role as User['role'],
          business_id: userData.business_id,
          first_name: userData.first_name,
          last_name: userData.last_name,
          is_verified: false,
          timezone: data.timezone || 'America/Chicago',
          notification_preferences: { email: true, sms: true, push: true },
        };

        await storage.setItem(USER_DATA_KEY, JSON.stringify(user));
        setState({ user, isLoading: false, isAuthenticated: true });

        return { success: true };
      }

      return {
        success: false,
        error: response.error?.message || 'Registration failed',
      };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint (optional, for server-side cleanup)
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore errors on logout
    }

    await clearTokens();
    await storage.removeItem(USER_DATA_KEY);
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await api.get<User>('/auth/me');

    if (response.success && response.data) {
      await storage.setItem(USER_DATA_KEY, JSON.stringify(response.data));
      setState(prev => ({ ...prev, user: response.data! }));
    }
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...updates };
      storage.setItem(USER_DATA_KEY, JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
