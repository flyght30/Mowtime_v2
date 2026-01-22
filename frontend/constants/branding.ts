/**
 * Branding Constants
 *
 * Build-time configuration for app branding.
 * These values come from the Expo app.config.js extra section.
 *
 * For runtime branding (fetched from API), use the BrandingContext.
 */

import Constants from 'expo-constants';

// App branding from build config
export const APP_BRANDING = Constants.expoConfig?.extra?.appBranding || 'servicepro';
export const APP_NAME = Constants.expoConfig?.extra?.appName || 'ServicePro';
export const PRIMARY_COLOR = Constants.expoConfig?.extra?.primaryColor || '#6366F1';
export const SECONDARY_COLOR = Constants.expoConfig?.extra?.secondaryColor || '#8B5CF6';

// Enabled verticals (build-time)
export const ENABLED_VERTICALS: string[] =
  Constants.expoConfig?.extra?.enabledVerticals || ['lawn_care', 'hvac'];

export const DEFAULT_VERTICAL: string =
  Constants.expoConfig?.extra?.enabledVerticals?.[0] || 'lawn_care';

export const SHOW_VERTICAL_SWITCHER: boolean =
  Constants.expoConfig?.extra?.showVerticalSwitcher ?? true;

// Vertical display configuration
export const VERTICAL_CONFIG: Record<string, {
  name: string;
  icon: string;
  color: string;
  description: string;
}> = {
  lawn_care: {
    name: 'Lawn Care',
    icon: 'grass',
    color: '#4CAF50',
    description: 'Mowing, fertilization, and lawn maintenance',
  },
  hvac: {
    name: 'HVAC',
    icon: 'thermometer',
    color: '#2196F3',
    description: 'Heating, cooling, and ventilation services',
  },
  plumbing: {
    name: 'Plumbing',
    icon: 'water',
    color: '#00BCD4',
    description: 'Plumbing repairs and installations',
  },
  electrical: {
    name: 'Electrical',
    icon: 'flash',
    color: '#FFC107',
    description: 'Electrical repairs and installations',
  },
  cleaning: {
    name: 'Cleaning',
    icon: 'sparkles',
    color: '#9C27B0',
    description: 'Residential and commercial cleaning',
  },
  pest_control: {
    name: 'Pest Control',
    icon: 'bug',
    color: '#795548',
    description: 'Pest extermination and prevention',
  },
  pool_service: {
    name: 'Pool Service',
    icon: 'water',
    color: '#03A9F4',
    description: 'Pool cleaning and maintenance',
  },
  painting: {
    name: 'Painting',
    icon: 'color-palette',
    color: '#E91E63',
    description: 'Interior and exterior painting',
  },
  roofing: {
    name: 'Roofing',
    icon: 'home',
    color: '#607D8B',
    description: 'Roof repairs and replacements',
  },
  landscaping: {
    name: 'Landscaping',
    icon: 'leaf',
    color: '#8BC34A',
    description: 'Landscape design and installation',
  },
};

// Get vertical config with fallback
export function getVerticalConfig(verticalId: string) {
  return VERTICAL_CONFIG[verticalId] || {
    name: verticalId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: 'briefcase',
    color: '#6366F1',
    description: 'Service business',
  };
}

// Check if vertical is enabled at build time
export function isVerticalEnabled(verticalId: string): boolean {
  return ENABLED_VERTICALS.includes(verticalId);
}

// Text overrides per branding
export const TEXT_LABELS: Record<string, Record<string, string>> = {
  mowtime: {
    appointments: 'Jobs',
    clients: 'Customers',
    services: 'Services',
  },
  hvac_pro: {
    appointments: 'Service Calls',
    clients: 'Customers',
    services: 'Service Types',
  },
  servicepro: {
    appointments: 'Appointments',
    clients: 'Clients',
    services: 'Services',
  },
};

// Get label with branding override
export function getLabel(key: string, fallback?: string): string {
  const labels = TEXT_LABELS[APP_BRANDING] || TEXT_LABELS.servicepro;
  return labels[key] || fallback || key;
}
