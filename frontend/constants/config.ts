/**
 * Application configuration constants
 */

// API Configuration
// Use empty string for base URL to utilize the Kubernetes ingress proxy
// The ingress redirects /api/* requests to the backend service on port 8001
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
export const API_VERSION = 'v1';
export const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

// Auth Configuration
export const ACCESS_TOKEN_KEY = 'servicepro_access_token';
export const REFRESH_TOKEN_KEY = 'servicepro_refresh_token';
export const USER_DATA_KEY = 'servicepro_user_data';

// App Configuration
export const APP_NAME = 'ServicePro';
export const APP_VERSION = '1.0.0';

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Time formats
export const TIME_FORMAT = 'HH:mm';
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DISPLAY_DATE_FORMAT = 'MMM D, YYYY';
export const DISPLAY_TIME_FORMAT = 'h:mm A';

// Validation
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 50;
export const PHONE_REGEX = /^\+?[\d\s-()]{10,20}$/;
