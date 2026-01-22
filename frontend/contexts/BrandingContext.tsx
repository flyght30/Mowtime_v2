/**
 * Branding Context
 *
 * Provides app branding configuration from the backend.
 * Allows dynamic theming based on deployment (MowTime, HVAC Pro, ServicePro).
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Constants from 'expo-constants';
import { api } from '../services/api';

// Types
export interface AppBranding {
  app_id: string;
  app_name: string;
  app_tagline: string;
  company_name: string;

  // Colors
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;

  // Assets
  logo_light: string;
  logo_dark: string;
  icon: string;
  splash_image: string;

  // App Store
  bundle_id_ios: string;
  bundle_id_android: string;
  app_store_url?: string;
  play_store_url?: string;

  // Contact
  support_email: string;
  support_phone?: string;
  website_url: string;
  privacy_url: string;
  terms_url: string;

  // Features
  show_vertical_switcher: boolean;
  show_other_verticals: boolean;
  default_vertical: string;
  enabled_verticals: string[];

  // Social
  social_links: Record<string, string>;

  // Text overrides
  text_overrides: Record<string, string>;
}

interface BrandingContextType {
  branding: AppBranding | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // Convenience methods
  isVerticalEnabled: (verticalId: string) => boolean;
  getText: (key: string, fallback: string) => string;
  getEnabledVerticals: () => string[];
}

// Default branding (ServicePro - used while loading)
const DEFAULT_BRANDING: AppBranding = {
  app_id: 'servicepro',
  app_name: Constants.expoConfig?.extra?.appName || 'ServicePro',
  app_tagline: 'The Complete Service Business Platform',
  company_name: 'ServicePro Inc',

  primary_color: Constants.expoConfig?.extra?.primaryColor || '#6366F1',
  secondary_color: Constants.expoConfig?.extra?.secondaryColor || '#8B5CF6',
  background_color: '#FFFFFF',
  text_color: '#1F2937',

  logo_light: 'servicepro-logo-light.png',
  logo_dark: 'servicepro-logo-dark.png',
  icon: 'servicepro-icon.png',
  splash_image: 'servicepro-splash.png',

  bundle_id_ios: 'com.servicepro.app',
  bundle_id_android: 'com.servicepro.app',

  support_email: 'support@servicepro.app',
  website_url: 'https://servicepro.app',
  privacy_url: 'https://servicepro.app/privacy',
  terms_url: 'https://servicepro.app/terms',

  show_vertical_switcher: true,
  show_other_verticals: true,
  default_vertical: Constants.expoConfig?.extra?.enabledVerticals?.[0] || 'lawn_care',
  enabled_verticals: Constants.expoConfig?.extra?.enabledVerticals || ['lawn_care', 'hvac'],

  social_links: {},
  text_overrides: {},
};

// Create context
const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

// Provider component
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranding = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.get('/branding/');
      setBranding(response.data);
    } catch (err: any) {
      console.warn('Failed to fetch branding, using defaults:', err.message);
      // Use defaults from app config if API fails
      setBranding(DEFAULT_BRANDING);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  // Check if a vertical is enabled
  const isVerticalEnabled = (verticalId: string): boolean => {
    const enabledList = branding?.enabled_verticals || DEFAULT_BRANDING.enabled_verticals;
    return enabledList.includes(verticalId);
  };

  // Get text with potential override
  const getText = (key: string, fallback: string): string => {
    const overrides = branding?.text_overrides || {};
    return overrides[key] || fallback;
  };

  // Get enabled verticals
  const getEnabledVerticals = (): string[] => {
    return branding?.enabled_verticals || DEFAULT_BRANDING.enabled_verticals;
  };

  const value: BrandingContextType = {
    branding: branding || DEFAULT_BRANDING,
    isLoading,
    error,
    refresh: fetchBranding,
    isVerticalEnabled,
    getText,
    getEnabledVerticals,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

// Hook to use branding
export function useBranding(): BrandingContextType {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}

// Hook to get themed colors based on branding
export function useBrandedColors() {
  const { branding } = useBranding();

  return {
    primary: branding?.primary_color || DEFAULT_BRANDING.primary_color,
    secondary: branding?.secondary_color || DEFAULT_BRANDING.secondary_color,
    background: branding?.background_color || DEFAULT_BRANDING.background_color,
    text: branding?.text_color || DEFAULT_BRANDING.text_color,
  };
}

// Hook for vertical-aware features
export function useVertical() {
  const { branding, isVerticalEnabled, getEnabledVerticals } = useBranding();

  return {
    defaultVertical: branding?.default_vertical || 'lawn_care',
    enabledVerticals: getEnabledVerticals(),
    isVerticalEnabled,
    showVerticalSwitcher: branding?.show_vertical_switcher ?? true,
    showOtherVerticals: branding?.show_other_verticals ?? true,
  };
}

export default BrandingContext;
