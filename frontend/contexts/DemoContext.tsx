/**
 * Demo Context
 * Provides demo mode functionality for testing multi-vertical features
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useVerticalContext } from './VerticalContext';
import { useBranding } from './BrandingContext';

// Demo business configurations
export const DEMO_BUSINESSES = {
  lawn_care: {
    id: 'demo-lawn-care',
    name: 'Green Meadows Lawn Care',
    vertical: 'lawn_care',
    enabledVerticals: ['lawn_care'],
    branding: {
      primary_color: '#4CAF50',
      secondary_color: '#81C784',
      logo_url: null,
      company_name: 'Green Meadows Lawn Care',
      tagline: 'Your lawn, our passion',
      text_overrides: {
        appointments: 'Jobs',
        clients: 'Customers',
      },
    },
  },
  hvac: {
    id: 'demo-hvac',
    name: 'Arctic Comfort HVAC',
    vertical: 'hvac',
    enabledVerticals: ['hvac'],
    branding: {
      primary_color: '#2196F3',
      secondary_color: '#64B5F6',
      logo_url: null,
      company_name: 'Arctic Comfort HVAC',
      tagline: 'Cool comfort, warm service',
      text_overrides: {
        appointments: 'Service Calls',
        clients: 'Customers',
      },
    },
  },
  multi_vertical: {
    id: 'demo-multi',
    name: 'ServicePro Solutions',
    vertical: 'lawn_care',
    enabledVerticals: ['lawn_care', 'hvac'],
    branding: {
      primary_color: '#6C63FF',
      secondary_color: '#9D97FF',
      logo_url: null,
      company_name: 'ServicePro Solutions',
      tagline: 'All your service needs, one platform',
      show_vertical_switcher: true,
      text_overrides: {
        appointments: 'Appointments',
        clients: 'Clients',
      },
    },
  },
};

export type DemoBusinessType = keyof typeof DEMO_BUSINESSES;

interface DemoContextType {
  isDemoMode: boolean;
  currentDemoBusiness: DemoBusinessType | null;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  switchDemoBusiness: (businessType: DemoBusinessType) => Promise<void>;
  getDemoBusinessInfo: (businessType: DemoBusinessType) => typeof DEMO_BUSINESSES.lawn_care;
  availableDemoBusinesses: DemoBusinessType[];
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [currentDemoBusiness, setCurrentDemoBusiness] = useState<DemoBusinessType | null>(null);
  const { setActiveVertical, enableVertical, disableVertical } = useVerticalContext();
  const { refresh } = useBranding();

  const availableDemoBusinesses: DemoBusinessType[] = ['lawn_care', 'hvac', 'multi_vertical'];

  const enableDemoMode = useCallback(() => {
    setIsDemoMode(true);
    console.log('[Demo] Demo mode enabled');
  }, []);

  const disableDemoMode = useCallback(() => {
    setIsDemoMode(false);
    setCurrentDemoBusiness(null);
    console.log('[Demo] Demo mode disabled');
  }, []);

  const getDemoBusinessInfo = useCallback((businessType: DemoBusinessType) => {
    return DEMO_BUSINESSES[businessType];
  }, []);

  const switchDemoBusiness = useCallback(async (businessType: DemoBusinessType) => {
    const business = DEMO_BUSINESSES[businessType];
    if (!business) {
      console.error('[Demo] Unknown business type:', businessType);
      return;
    }

    console.log('[Demo] Switching to business:', business.name);
    setCurrentDemoBusiness(businessType);

    // Enable appropriate verticals
    const allVerticals = ['lawn_care', 'hvac'];
    for (const vertical of allVerticals) {
      if (business.enabledVerticals.includes(vertical)) {
        await enableVertical(vertical);
      } else {
        await disableVertical(vertical);
      }
    }

    // Set active vertical
    await setActiveVertical(business.vertical);

    // Refresh branding (in real app, API would return demo business branding)
    await refresh();

    console.log('[Demo] Switched to:', business.name, 'with verticals:', business.enabledVerticals);
  }, [setActiveVertical, enableVertical, disableVertical, refresh]);

  return (
    <DemoContext.Provider
      value={{
        isDemoMode,
        currentDemoBusiness,
        enableDemoMode,
        disableDemoMode,
        switchDemoBusiness,
        getDemoBusinessInfo,
        availableDemoBusinesses,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}
