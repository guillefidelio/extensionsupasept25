// Google OAuth authentication module for Chrome Extension
// Handles communication with the BoltReply website for Google OAuth login

import { CONFIG } from '../config';
import { AuthTokens, GoogleAuthMessage, User, AuthStateChangedMessage } from '../types';

// Storage keys for Google OAuth tokens
const STORAGE_KEYS = {
  AUTH_TOKENS: 'auth_tokens',
  USER_PROFILE: 'user_profile'
};

/**
 * Store OAuth tokens securely in chrome.storage.local
 */
export async function storeAuthTokens(tokens: AuthTokens): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKENS]: tokens });
  console.log('Google OAuth: Tokens stored successfully');
}

/**
 * Retrieve stored OAuth tokens
 */
export async function getAuthTokens(): Promise<AuthTokens | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKENS);
  return result[STORAGE_KEYS.AUTH_TOKENS] || null;
}

/**
 * Clear OAuth tokens (logout)
 */
export async function clearAuthTokens(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.AUTH_TOKENS,
    STORAGE_KEYS.USER_PROFILE,
    CONFIG.STORAGE_KEYS.AUTH_TOKEN,
    CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
    CONFIG.STORAGE_KEYS.TOKEN_EXPIRES_AT,
    CONFIG.STORAGE_KEYS.USER_DATA
  ]);
  console.log('Google OAuth: Tokens cleared');
}

/**
 * Store user profile from Google OAuth
 */
export async function storeUserProfile(profile: User): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.USER_PROFILE]: profile });
}

/**
 * Get stored user profile
 */
export async function getUserProfile(): Promise<User | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
  return result[STORAGE_KEYS.USER_PROFILE] || null;
}

/**
 * Check if token is expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: number): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (expiresAt - bufferMs);
}

/**
 * Get a valid access token, checking expiry
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getAuthTokens();
  
  if (!tokens) {
    console.log('Google OAuth: No tokens found - user needs to login');
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(tokens.expires_at)) {
    console.log('Google OAuth: Token expired, attempting refresh...');
    return await refreshAccessToken();
  }

  return tokens.access_token;
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const tokens = await getAuthTokens();
  
  if (!tokens?.refresh_token) {
    console.log('Google OAuth: No refresh token available');
    await clearAuthTokens();
    return null;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (!response.ok) {
      console.error('Google OAuth: Token refresh failed:', response.status);
      await clearAuthTokens();
      return null;
    }

    const data = await response.json();
    
    // Store new tokens
    await storeAuthTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    });

    // Also store in legacy format for compatibility
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: data.access_token,
      [CONFIG.STORAGE_KEYS.TOKEN_EXPIRES_AT]: Date.now() + (data.expires_in * 1000)
    });

    console.log('Google OAuth: Token refreshed successfully');
    return data.access_token;
  } catch (error) {
    console.error('Google OAuth: Token refresh error:', error);
    await clearAuthTokens();
    return null;
  }
}

/**
 * Check if user is authenticated via Google OAuth
 */
export async function isGoogleAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken();
  return token !== null;
}

/**
 * Fetch user profile from API after Google OAuth login
 */
export async function fetchUserProfileFromAPI(): Promise<User | null> {
  const token = await getValidAccessToken();
  
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await clearAuthTokens();
      }
      return null;
    }

    const data = await response.json();
    
    if (data.success && data.user) {
      const profile: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name || data.user.first_name || data.user.email,
        credits_available: data.user.credits_available,
        credits_total: data.user.credits_total,
      };

      await storeUserProfile(profile);
      
      // Also store in legacy format for compatibility
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.USER_DATA]: profile
      });
      
      return profile;
    }

    return null;
  } catch (error) {
    console.error('Google OAuth: Failed to fetch user profile:', error);
    return null;
  }
}

/**
 * Open the Google login popup window via the website
 */
export function openGoogleLoginPopup(): void {
  // Create login URL with extension callback
  const loginUrl = `${CONFIG.WEBSITE_URL}/login?source=extension&redirect=${CONFIG.EXTENSION_CALLBACK_PATH}`;
  
  // Open popup window
  chrome.windows.create({
    url: loginUrl,
    type: 'popup',
    width: 500,
    height: 700,
    focused: true,
  });

  console.log('Google OAuth: Login popup opened');
}

/**
 * Handle tokens received from the website after Google OAuth
 */
export async function handleAuthTokensFromWebsite(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<boolean> {
  console.log('Google OAuth: handleAuthTokensFromWebsite called');
  console.log('Google OAuth: Token length:', accessToken?.length, 'Refresh length:', refreshToken?.length, 'Expires in:', expiresIn);
  
  try {
    // Store the tokens in new format
    console.log('Google OAuth: Storing tokens in new format...');
    await storeAuthTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + (expiresIn * 1000),
    });
    console.log('Google OAuth: New format tokens stored');

    // Also store in legacy format for compatibility with existing code
    console.log('Google OAuth: Storing tokens in legacy format...');
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.AUTH_TOKEN]: accessToken,
      [CONFIG.STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
      [CONFIG.STORAGE_KEYS.TOKEN_EXPIRES_AT]: Date.now() + (expiresIn * 1000)
    });
    console.log('Google OAuth: Legacy format tokens stored');

    // Fetch and store user profile
    let profile: User | null = null;
    try {
      console.log('Google OAuth: Fetching user profile...');
      profile = await fetchUserProfileFromAPI();
      if (profile) {
        console.log('Google OAuth: Profile fetched successfully:', profile.email);
      } else {
        console.warn('Google OAuth: Profile API returned null');
      }
    } catch (profileError) {
      console.warn('Google OAuth: Profile fetch failed:', profileError);
    }

    // If profile fetch failed, create a minimal profile from the JWT token
    // This ensures the existing auth system recognizes us as logged in
    if (!profile) {
      console.log('Google OAuth: Creating minimal user profile from token...');
      try {
        // Decode JWT to get basic user info (JWT is base64 encoded)
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          profile = {
            id: payload.sub || 'google-user',
            email: payload.email || 'user@google.com',
            name: payload.user_metadata?.name || payload.email || 'Google User',
          };
          console.log('Google OAuth: Created profile from JWT:', profile.email);
        } else {
          throw new Error('Invalid JWT format');
        }
      } catch (decodeError) {
        console.warn('Google OAuth: Could not decode JWT, using fallback profile');
        profile = {
          id: 'google-user',
          email: 'user@google.com',
          name: 'Google User',
        };
      }
      
      // Store the minimal profile (profile is guaranteed to be non-null here)
      const userProfile: User = profile;
      await storeUserProfile(userProfile);
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.USER_DATA]: userProfile
      });
      console.log('Google OAuth: Minimal profile stored');
    }

    console.log('Google OAuth: Returning success=true');
    return true;
  } catch (error) {
    console.error('Google OAuth: Failed to handle auth tokens:', error);
    return false;
  }
}

/**
 * Validate that a message sender is from an allowed origin
 */
function isAllowedOrigin(senderUrl: string | undefined): boolean {
  if (!senderUrl) {
    return false;
  }

  return CONFIG.ALLOWED_ORIGINS.some(origin => senderUrl.startsWith(origin));
}

/**
 * Setup listener for auth messages from the website
 * This should be called once in your background script
 */
export function setupExternalAuthListener(): void {
  chrome.runtime.onMessageExternal.addListener(
    (message: GoogleAuthMessage, sender, sendResponse) => {
      console.log('Google OAuth: Received external message:', message.type, 'from:', sender.url);
      
      // Verify the sender is from our website
      if (!isAllowedOrigin(sender.url)) {
        console.warn('Google OAuth: Received message from unknown origin:', sender.url);
        sendResponse({ success: false, error: 'Unknown origin' });
        return true;
      }

      if (message.type === 'AUTH_TOKENS') {
        console.log('Google OAuth: Processing auth tokens from website');
        
        // Handle the auth tokens and respond
        (async () => {
          try {
            const success = await handleAuthTokensFromWebsite(
              message.access_token,
              message.refresh_token,
              message.expires_in
            );
            
            console.log('Google OAuth: handleAuthTokensFromWebsite returned:', success);
            
            // Send response IMMEDIATELY
            sendResponse({ success });
            console.log('Google OAuth: Response sent to website:', { success });

            // After responding, do cleanup tasks
            if (success) {
              // Close the login popup window
              if (sender.tab?.windowId) {
                try {
                  await chrome.windows.remove(sender.tab.windowId);
                  console.log('Google OAuth: Closed login popup window');
                } catch (error) {
                  console.log('Google OAuth: Could not close popup window (may already be closed)');
                }
              }

              // Notify extension popup to refresh (if open)
              try {
                const profile = await getUserProfile();
                const authStateMessage: AuthStateChangedMessage = {
                  type: 'AUTH_STATE_CHANGED',
                  isAuthenticated: true,
                  user: profile || undefined
                };
                await chrome.runtime.sendMessage(authStateMessage);
                console.log('Google OAuth: Notified extension popup of auth state change');
              } catch (error) {
                console.log('Google OAuth: Could not notify popup (may not be open)');
              }
            }
          } catch (error) {
            console.error('Google OAuth: Error handling auth tokens:', error);
            sendResponse({ success: false, error: 'Internal error' });
          }
        })();

        return true; // Keep the message channel open for async response
      }

      return false;
    }
  );

  console.log('Google OAuth: External auth listener setup complete');
}

/**
 * Google OAuth logout - clear all tokens and profile
 */
export async function googleLogout(): Promise<void> {
  await clearAuthTokens();
  console.log('Google OAuth: User logged out');
}
