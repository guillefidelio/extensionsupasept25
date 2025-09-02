import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthState, User, LoginFormData, LoginResponse, FormErrors, LoginAttempts, STORAGE_KEYS } from '../types';
import { CONFIG } from '../config';

let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
function initializeSupabase(): SupabaseClient {
  if (!supabaseClient) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
    }
    
    supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * Get stored authentication token
 */
async function getStoredToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
    return result[CONFIG.STORAGE_KEYS.AUTH_TOKEN] || null;
  } catch (error) {
    console.error('Error retrieving stored token:', error);
    return null;
  }
}

/**
 * Store authentication token
 */
async function storeToken(token: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: token });
  } catch (error) {
    console.error('Error storing token:', error);
    throw error;
  }
}

/**
 * Remove stored authentication token
 */
async function removeStoredToken(): Promise<void> {
  try {
    await chrome.storage.local.remove(CONFIG.STORAGE_KEYS.AUTH_TOKEN);
  } catch (error) {
    console.error('Error removing token:', error);
    throw error;
  }
}

/**
 * Get stored user data
 */
async function getStoredUserData(): Promise<User | null> {
  try {
    const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.USER_DATA);
    return result[CONFIG.STORAGE_KEYS.USER_DATA] || null;
  } catch (error) {
    console.error('Error retrieving user data:', error);
    return null;
  }
}

/**
 * Store user data
 */
async function storeUserData(userData: User): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.USER_DATA]: userData });
  } catch (error) {
    console.error('Error storing user data:', error);
    throw error;
  }
}

/**
 * Get login attempts from storage
 */
async function getLoginAttempts(): Promise<LoginAttempts> {
  try {
    const result = await chrome.storage.local.get('login_attempts');
    return result.login_attempts || { count: 0, lastAttempt: 0 };
  } catch (error) {
    console.error('Error retrieving login attempts:', error);
    return { count: 0, lastAttempt: 0 };
  }
}

/**
 * Store login attempts
 */
async function storeLoginAttempts(attempts: LoginAttempts): Promise<void> {
  try {
    await chrome.storage.local.set({ login_attempts: attempts });
  } catch (error) {
    console.error('Error storing login attempts:', error);
  }
}

/**
 * Check if account is locked due to too many failed attempts
 */
async function isAccountLocked(): Promise<boolean> {
  const attempts = await getLoginAttempts();
  
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    return true;
  }
  
  // Reset lockout if time has passed
  if (attempts.lockedUntil && attempts.lockedUntil <= Date.now()) {
    await storeLoginAttempts({ count: 0, lastAttempt: 0 });
    return false;
  }
  
  return false;
}

/**
 * Record failed login attempt
 */
async function recordFailedLogin(): Promise<void> {
  const attempts = await getLoginAttempts();
  const now = Date.now();
  
  attempts.count += 1;
  attempts.lastAttempt = now;
  
  // Lock account if max attempts exceeded
  if (attempts.count >= CONFIG.AUTH.MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = now + CONFIG.AUTH.LOCKOUT_DURATION;
  }
  
  await storeLoginAttempts(attempts);
}

/**
 * Reset login attempts on successful login
 */
async function resetLoginAttempts(): Promise<void> {
  await storeLoginAttempts({ count: 0, lastAttempt: 0 });
}

/**
 * Validate login form data
 */
function validateLoginForm(data: LoginFormData): FormErrors {
  const errors: FormErrors = {};
  
  if (!data.email) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Please enter a valid email address';
  }
  
  if (!data.password) {
    errors.password = 'Password is required';
  } else if (data.password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }
  
  return errors;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<LoginResponse> {
  try {
    // Check if account is locked
    if (await isAccountLocked()) {
      const attempts = await getLoginAttempts();
      const remainingTime = Math.ceil((attempts.lockedUntil! - Date.now()) / 1000 / 60);
      return {
        success: false,
        error: `Account temporarily locked. Please try again in ${remainingTime} minutes.`
      };
    }
    
    // Validate form data
    const formData: LoginFormData = { email, password };
    const validationErrors = validateLoginForm(formData);
    
    if (Object.keys(validationErrors).length > 0) {
      return {
        success: false,
        error: 'Please fix the form errors above.',
        details: validationErrors
      };
    }
    
    const supabase = initializeSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // Record failed attempt
      await recordFailedLogin();
      
      // Provide user-friendly error messages
      let errorMessage = 'Login failed. Please check your credentials.';
      
      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Please check your email and confirm your account before logging in.';
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please wait a moment before trying again.';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }

    if (data.user && data.session) {
      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        name: data.user.user_metadata?.name || data.user.email || '',
        created_at: data.user.created_at,
        updated_at: data.user.updated_at
      };

      // Store token and user data
      await storeToken(data.session.access_token);
      await storeUserData(user);
      
      // Reset failed login attempts
      await resetLoginAttempts();

      return {
        success: true,
        user,
        token: data.session.access_token
      };
    }

    return {
      success: false,
      error: 'Authentication failed. Please try again.'
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    };
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, name?: string): Promise<LoginResponse> {
  try {
    // Validate form data
    const formData: LoginFormData = { email, password };
    const validationErrors = validateLoginForm(formData);
    
    if (Object.keys(validationErrors).length > 0) {
      return {
        success: false,
        error: 'Please fix the form errors above.',
        details: validationErrors
      };
    }
    
    const supabase = initializeSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email
        }
      }
    });

    if (error) {
      let errorMessage = 'Registration failed. Please try again.';
      
      if (error.message.includes('User already registered')) {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.message.includes('Password should be at least')) {
        errorMessage = 'Password must be at least 6 characters long.';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }

    if (data.user && data.session) {
      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        name: name || data.user.email || '',
        created_at: data.user.created_at,
        updated_at: data.user.updated_at
      };

      // Store token and user data
      await storeToken(data.session.access_token);
      await storeUserData(user);

      return {
        success: true,
        user,
        token: data.session.access_token
      };
    }

    return {
      success: false,
      error: 'Registration failed. Please try again.'
    };
  } catch (error) {
    console.error('Sign up error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    };
  }
}

/**
 * Sign out user
 */
export async function signOut(): Promise<void> {
  try {
    const supabase = initializeSupabase();
    await supabase.auth.signOut();
    
    // Remove stored data
    await removeStoredToken();
    await chrome.storage.local.remove(CONFIG.STORAGE_KEYS.USER_DATA);
    await chrome.storage.local.remove('login_attempts');
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Get current authentication state
 */
export async function getAuthState(): Promise<AuthState> {
  try {
    const token = await getStoredToken();
    const userData = await getStoredUserData();

    if (!token || !userData) {
      return { isAuthenticated: false };
    }

    // Check if token is expired
    const supabase = initializeSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Token is invalid, clear stored data
      await removeStoredToken();
      await chrome.storage.local.remove(CONFIG.STORAGE_KEYS.USER_DATA);
      return { isAuthenticated: false };
    }

    return {
      isAuthenticated: true,
      user: userData,
      token
    };
  } catch (error) {
    console.error('Error getting auth state:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Refresh authentication token
 */
export async function refreshToken(): Promise<string | null> {
  try {
    const supabase = initializeSupabase();
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      throw error;
    }

    if (data.session) {
      await storeToken(data.session.access_token);
      return data.session.access_token;
    }

    return null;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const authState = await getAuthState();
  return authState.isAuthenticated;
}

/**
 * Get current user token
 */
export async function getCurrentToken(): Promise<string | null> {
  const authState = await getAuthState();
  return authState.token || null;
}

/**
 * Get remaining lockout time in minutes
 */
export async function getRemainingLockoutTime(): Promise<number> {
  const attempts = await getLoginAttempts();
  
  if (!attempts.lockedUntil || attempts.lockedUntil <= Date.now()) {
    return 0;
  }
  
  return Math.ceil((attempts.lockedUntil - Date.now()) / 1000 / 60);
}
