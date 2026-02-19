export const BACKEND_URL = 'ws://localhost:8080';
export const BACKEND_URL_PROD = ''; // Set after Cloud Run deployment

export const COLORS = {
  primary: '#1A73E8',
  accent: '#FBBC04',
  success: '#34A853',
  error: '#EA4335',
  bgLight: '#FFFFFF',
  bgDark: '#1E1E1E',
  textLight: '#202124',
  textDark: '#E8EAED',
} as const;

export const SCREENSHOT_CONFIG = {
  format: 'jpeg' as const,
  quality: 80,
  maxWidth: 1280,
};

export const STORAGE_KEYS = {
  onboardingComplete: 'voxsight_onboarding_complete',
  settings: 'voxsight_settings',
} as const;
