// Configuration file for the Chrome Extension
// For Chrome extensions, we need to handle configuration differently than Node.js apps

// You can create a config.example.js file with your actual values
// and copy it to config.js (which should be gitignored)
const getConfigValue = (key: string, defaultValue: string): string => {
  // Try to get from chrome.storage first (for runtime configuration)
  // Fall back to hardcoded defaults
  return defaultValue;
};

export const CONFIG = {
  // Supabase configuration - using actual values from .env
  SUPABASE_URL: getConfigValue('SUPABASE_URL', 'https://aailoyciqgopysfowtso.supabase.co'),
  SUPABASE_ANON_KEY: getConfigValue('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhaWxveWNpcWdvcHlzZm93dHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyNTYwNDgsImV4cCI6MjA3MTgzMjA0OH0.pZkFqzyH06P5nxlkHAyM5w4Nf93u0hv0usXfU2Ckw2o'),
  
  // API configuration
  API_BASE_URL: getConfigValue('API_BASE_URL', 'https://www.boltreply.io/api/v1'),
  
  // Website configuration for Google OAuth
  WEBSITE_URL: 'https://www.boltreply.io',
  EXTENSION_CALLBACK_PATH: '/auth/extension-callback',
  ALLOWED_ORIGINS: [
    'https://boltreply.io',
    'https://www.boltreply.io'
  ],
  
  // Extension configuration
  EXTENSION_NAME: 'AI Review Replier',
  VERSION: '1.0.0',
  
  // Storage keys
  STORAGE_KEYS: {
    AUTH_TOKEN: 'auth_token',
    REFRESH_TOKEN: 'refresh_token',
    USER_ID: 'user_id',
    TOKEN_EXPIRES_AT: 'token_expires_at',
    USER_DATA: 'user_data'
  },
  
  // Authentication settings
  AUTH: {
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
    MAX_LOGIN_ATTEMPTS: 3,
    LOCKOUT_DURATION: 15 * 60 * 1000 // 15 minutes
  }
} as const;

// Type for the configuration
export type Config = typeof CONFIG;

// Helper function to update configuration at runtime
export const updateConfig = async (key: keyof Config, value: string): Promise<void> => {
  try {
    await chrome.storage.local.set({ [`config_${key}`]: value });
  } catch (error) {
    console.error('Failed to update config:', error);
  }
};

// Helper function to get runtime configuration
export const getRuntimeConfig = async (key: keyof Config): Promise<string | null> => {
  try {
    const result = await chrome.storage.local.get(`config_${key}`);
    return result[`config_${key}`] || null;
  } catch (error) {
    console.error('Failed to get runtime config:', error);
    return null;
  }
};
