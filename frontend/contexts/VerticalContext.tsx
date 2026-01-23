/**
 * Vertical Context
 * Manages the active vertical (lawn_care, hvac, etc.) for the current business
 * Handles vertical switching and stores enabled verticals per business
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useBranding } from './BrandingContext';
import { VERTICAL_CONFIG, getVerticalConfig } from '../constants/branding';

// Storage key for persisting active vertical
const ACTIVE_VERTICAL_KEY = 'active_vertical';
const BUSINESS_VERTICALS_KEY = 'business_verticals';

// Vertical info type
export interface VerticalInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  enabled: boolean;
}

// Business vertical settings from API
export interface BusinessVerticalSettings {
  verticalId: string;
  enabled: boolean;
  customConfig?: Record<string, any>;
}

interface VerticalContextType {
  // Current active vertical
  activeVertical: string;
  activeVerticalInfo: VerticalInfo;

  // Available verticals for this business
  businessVerticals: VerticalInfo[];
  enabledVerticals: string[];

  // State
  isLoading: boolean;

  // Actions
  setActiveVertical: (verticalId: string) => Promise<void>;
  enableVertical: (verticalId: string) => Promise<boolean>;
  disableVertical: (verticalId: string) => Promise<boolean>;
  refreshVerticals: () => Promise<void>;

  // Helpers
  isVerticalEnabled: (verticalId: string) => boolean;
  isVerticalActive: (verticalId: string) => boolean;
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

const VerticalContext = createContext<VerticalContextType | undefined>(undefined);

export function VerticalProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { branding, getEnabledVerticals } = useBranding();

  const [activeVertical, setActiveVerticalState] = useState<string>('lawn_care');
  const [businessVerticals, setBusinessVerticals] = useState<VerticalInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get enabled vertical IDs
  const enabledVerticals = businessVerticals
    .filter(v => v.enabled)
    .map(v => v.id);

  // Get active vertical info
  const activeVerticalInfo: VerticalInfo = {
    id: activeVertical,
    ...getVerticalConfig(activeVertical),
    enabled: enabledVerticals.includes(activeVertical),
  };

  // Initialize verticals from storage and API
  const initializeVerticals = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get cached active vertical
      const cachedActive = await storage.getItem(ACTIVE_VERTICAL_KEY);

      // Get app-level enabled verticals from branding
      const appEnabledVerticals = getEnabledVerticals();

      // Build initial verticals list from app config
      let verticals: VerticalInfo[] = appEnabledVerticals.map(id => ({
        id,
        ...getVerticalConfig(id),
        enabled: true,
      }));

      // If authenticated, fetch business-specific settings
      if (isAuthenticated && user?.business_id) {
        try {
          const response = await api.get(`/businesses/${user.business_id}/verticals`);
          if (response.success && response.data?.verticals) {
            // Merge business settings with app config
            const businessSettings = response.data.verticals as BusinessVerticalSettings[];
            verticals = appEnabledVerticals.map(id => {
              const businessSetting = businessSettings.find(s => s.verticalId === id);
              return {
                id,
                ...getVerticalConfig(id),
                enabled: businessSetting?.enabled ?? true,
              };
            });
          }
        } catch (error) {
          console.warn('Failed to fetch business verticals:', error);
        }
      }

      setBusinessVerticals(verticals);

      // Set active vertical
      const enabledIds = verticals.filter(v => v.enabled).map(v => v.id);

      if (cachedActive && enabledIds.includes(cachedActive)) {
        setActiveVerticalState(cachedActive);
      } else if (branding?.default_vertical && enabledIds.includes(branding.default_vertical)) {
        setActiveVerticalState(branding.default_vertical);
      } else if (enabledIds.length > 0) {
        setActiveVerticalState(enabledIds[0]);
      }
    } catch (error) {
      console.error('Failed to initialize verticals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.business_id, branding?.default_vertical, getEnabledVerticals]);

  useEffect(() => {
    initializeVerticals();
  }, [initializeVerticals]);

  // Set active vertical
  const setActiveVertical = useCallback(async (verticalId: string) => {
    if (!enabledVerticals.includes(verticalId)) {
      console.warn(`Cannot switch to disabled vertical: ${verticalId}`);
      return;
    }

    setActiveVerticalState(verticalId);
    await storage.setItem(ACTIVE_VERTICAL_KEY, verticalId);
  }, [enabledVerticals]);

  // Enable a vertical for the business
  const enableVertical = useCallback(async (verticalId: string): Promise<boolean> => {
    if (!isAuthenticated || !user?.business_id) return false;

    try {
      const response = await api.post(`/businesses/${user.business_id}/verticals/${verticalId}/enable`);
      if (response.success) {
        setBusinessVerticals(prev =>
          prev.map(v => v.id === verticalId ? { ...v, enabled: true } : v)
        );
        return true;
      }
    } catch (error) {
      console.error('Failed to enable vertical:', error);
    }
    return false;
  }, [isAuthenticated, user?.business_id]);

  // Disable a vertical for the business
  const disableVertical = useCallback(async (verticalId: string): Promise<boolean> => {
    if (!isAuthenticated || !user?.business_id) return false;

    // Can't disable if it's the only enabled vertical
    if (enabledVerticals.length <= 1) {
      console.warn('Cannot disable the only enabled vertical');
      return false;
    }

    // If disabling active vertical, switch to another
    if (activeVertical === verticalId) {
      const otherVertical = enabledVerticals.find(id => id !== verticalId);
      if (otherVertical) {
        await setActiveVertical(otherVertical);
      }
    }

    try {
      const response = await api.post(`/businesses/${user.business_id}/verticals/${verticalId}/disable`);
      if (response.success) {
        setBusinessVerticals(prev =>
          prev.map(v => v.id === verticalId ? { ...v, enabled: false } : v)
        );
        return true;
      }
    } catch (error) {
      console.error('Failed to disable vertical:', error);
    }
    return false;
  }, [isAuthenticated, user?.business_id, enabledVerticals, activeVertical, setActiveVertical]);

  // Refresh verticals from API
  const refreshVerticals = useCallback(async () => {
    await initializeVerticals();
  }, [initializeVerticals]);

  // Check if vertical is enabled
  const isVerticalEnabled = useCallback((verticalId: string): boolean => {
    return enabledVerticals.includes(verticalId);
  }, [enabledVerticals]);

  // Check if vertical is active
  const isVerticalActive = useCallback((verticalId: string): boolean => {
    return activeVertical === verticalId;
  }, [activeVertical]);

  return (
    <VerticalContext.Provider
      value={{
        activeVertical,
        activeVerticalInfo,
        businessVerticals,
        enabledVerticals,
        isLoading,
        setActiveVertical,
        enableVertical,
        disableVertical,
        refreshVerticals,
        isVerticalEnabled,
        isVerticalActive,
      }}
    >
      {children}
    </VerticalContext.Provider>
  );
}

export function useVerticalContext(): VerticalContextType {
  const context = useContext(VerticalContext);
  if (context === undefined) {
    throw new Error('useVerticalContext must be used within a VerticalProvider');
  }
  return context;
}

// Convenience hook for checking if HVAC is enabled
export function useHVAC() {
  const { isVerticalEnabled, isVerticalActive, setActiveVertical } = useVerticalContext();

  return {
    isEnabled: isVerticalEnabled('hvac'),
    isActive: isVerticalActive('hvac'),
    activate: () => setActiveVertical('hvac'),
  };
}

// Convenience hook for checking if Lawn Care is enabled
export function useLawnCare() {
  const { isVerticalEnabled, isVerticalActive, setActiveVertical } = useVerticalContext();

  return {
    isEnabled: isVerticalEnabled('lawn_care'),
    isActive: isVerticalActive('lawn_care'),
    activate: () => setActiveVertical('lawn_care'),
  };
}

export default VerticalContext;
