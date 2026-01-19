# Google OAuth Login Guide for Chrome Extension

This guide explains how to implement Google OAuth authentication in the BoltReply Chrome extension, ensuring users share the same account between the extension and the SaaS website.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Chrome     │    │  BoltReply   │    │   Supabase   │    │  Google   │ │
│  │  Extension   │    │   Website    │    │    Auth      │    │   OAuth   │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └─────┬─────┘ │
│         │                   │                   │                  │       │
│         │  1. Open popup    │                   │                  │       │
│         ├──────────────────>│                   │                  │       │
│         │                   │  2. OAuth request │                  │       │
│         │                   ├──────────────────>│                  │       │
│         │                   │                   │  3. Redirect     │       │
│         │                   │                   ├─────────────────>│       │
│         │                   │                   │                  │       │
│         │                   │                   │  4. Auth code    │       │
│         │                   │                   │<─────────────────┤       │
│         │                   │  5. Session       │                  │       │
│         │                   │<──────────────────┤                  │       │
│         │  6. JWT tokens    │                   │                  │       │
│         │<──────────────────┤                   │                  │       │
│         │                   │                   │                  │       │
│         │  7. API calls with Bearer token       │                  │       │
│         ├──────────────────────────────────────>│                  │       │
│         │                   │                   │                  │       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Why This Approach?

1. **Shared Authentication**: Users log in once via the website and the extension receives the same JWT tokens
2. **Same Database**: Both extension and website query the same Supabase `users` table
3. **No Duplicate Accounts**: Google OAuth through Supabase ensures one account per Google email
4. **Token-Based API Access**: Extension uses JWT Bearer tokens for API calls (not cookies)

### Authentication Methods

| Platform | Auth Method | Storage | Session Refresh |
|----------|-------------|---------|-----------------|
| Website | HTTP-only Cookies | Browser cookies | Middleware auto-refresh |
| Extension | JWT Bearer Token | `chrome.storage.local` | Manual refresh API |

---

## Implementation Guide

### Step 1: Extension Manifest Configuration

Update `manifest.json` to allow communication with the website:

```json
{
  "manifest_version": 3,
  "name": "BoltReply",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://boltreply.io/*",
    "https://www.boltreply.io/*"
  ],
  "externally_connectable": {
    "matches": [
      "https://boltreply.io/*",
      "https://www.boltreply.io/*",
      "http://localhost:3000/*"
    ]
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

**Important Fields:**
- `externally_connectable`: Allows the website to send messages to the extension
- `host_permissions`: Allows API calls to the backend

---

### Step 2: Auth Storage Module

Create `src/auth/storage.ts` to manage token storage:

```typescript
// Types for authentication tokens
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
}

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  credits_available: number;
  subscription_status?: string;
}

// Store tokens securely in chrome.storage.local
export async function storeTokens(tokens: AuthTokens): Promise<void> {
  await chrome.storage.local.set({ auth_tokens: tokens });
  console.log('🔐 Tokens stored successfully');
}

// Retrieve stored tokens
export async function getTokens(): Promise<AuthTokens | null> {
  const result = await chrome.storage.local.get('auth_tokens');
  return result.auth_tokens || null;
}

// Clear tokens (logout)
export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove(['auth_tokens', 'user_profile']);
  console.log('🔓 Tokens cleared');
}

// Store user profile
export async function storeUserProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ user_profile: profile });
}

// Get user profile
export async function getUserProfile(): Promise<UserProfile | null> {
  const result = await chrome.storage.local.get('user_profile');
  return result.user_profile || null;
}

// Check if token is expired (with 5 minute buffer)
export function isTokenExpired(expiresAt: number): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (expiresAt - bufferMs);
}
```

---

### Step 3: Auth Manager Module

Create `src/auth/manager.ts` to handle authentication logic:

```typescript
import { 
  AuthTokens, 
  storeTokens, 
  getTokens, 
  clearTokens, 
  isTokenExpired,
  storeUserProfile,
  getUserProfile,
  UserProfile
} from './storage';

const API_BASE = 'https://boltreply.io';

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  
  if (!tokens) {
    console.log('❌ No tokens found - user needs to login');
    return null;
  }

  // Check if token is expired
  if (isTokenExpired(tokens.expires_at)) {
    console.log('🔄 Token expired, attempting refresh...');
    return await refreshAccessToken();
  }

  return tokens.access_token;
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
  const tokens = await getTokens();
  
  if (!tokens?.refresh_token) {
    console.log('❌ No refresh token available');
    await clearTokens();
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (!response.ok) {
      console.error('❌ Token refresh failed:', response.status);
      await clearTokens();
      return null;
    }

    const data = await response.json();
    
    // Store new tokens
    await storeTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    });

    console.log('✅ Token refreshed successfully');
    return data.access_token;
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    await clearTokens();
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidAccessToken();
  return token !== null;
}

/**
 * Fetch and store user profile from API
 */
export async function fetchUserProfile(): Promise<UserProfile | null> {
  const token = await getValidAccessToken();
  
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await clearTokens();
      }
      return null;
    }

    const data = await response.json();
    const profile: UserProfile = {
      id: data.id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      credits_available: data.credits_available,
      subscription_status: data.subscription_status,
    };

    await storeUserProfile(profile);
    return profile;
  } catch (error) {
    console.error('❌ Failed to fetch user profile:', error);
    return null;
  }
}

/**
 * Logout - clear all tokens and profile
 */
export async function logout(): Promise<void> {
  await clearTokens();
  console.log('👋 User logged out');
}
```

---

### Step 4: Login Flow Handler

Create `src/auth/login.ts` to handle the login popup flow:

```typescript
import { storeTokens, AuthTokens } from './storage';
import { fetchUserProfile } from './manager';

const SITE_URL = 'https://boltreply.io';

/**
 * Open the login popup window
 */
export async function openLoginPopup(): Promise<void> {
  // Create login URL with extension callback
  const loginUrl = `${SITE_URL}/login?source=extension&redirect=/auth/extension-callback`;
  
  // Open popup window
  chrome.windows.create({
    url: loginUrl,
    type: 'popup',
    width: 500,
    height: 700,
    focused: true,
  });
}

/**
 * Handle tokens received from the website
 */
export async function handleAuthTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<boolean> {
  try {
    // Store the tokens
    await storeTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + (expiresIn * 1000),
    });

    // Fetch and store user profile
    const profile = await fetchUserProfile();
    
    if (profile) {
      console.log('✅ Login successful:', profile.email);
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Failed to handle auth tokens:', error);
    return false;
  }
}

/**
 * Setup listener for auth messages from the website
 * Call this once in your background script
 */
export function setupAuthMessageListener(): void {
  chrome.runtime.onMessageExternal.addListener(
    async (message, sender, sendResponse) => {
      // Verify the sender is from our website
      if (!sender.url?.startsWith(SITE_URL) && 
          !sender.url?.startsWith('http://localhost:3000')) {
        console.warn('⚠️ Received message from unknown origin:', sender.url);
        sendResponse({ success: false, error: 'Unknown origin' });
        return;
      }

      if (message.type === 'AUTH_TOKENS') {
        console.log('📨 Received auth tokens from website');
        
        const success = await handleAuthTokens(
          message.access_token,
          message.refresh_token,
          message.expires_in
        );

        sendResponse({ success });

        // Close the login popup window
        if (success && sender.tab?.windowId) {
          chrome.windows.remove(sender.tab.windowId);
        }

        // Notify popup to refresh (if open)
        chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED', isAuthenticated: success });
      }

      return true; // Keep the message channel open for async response
    }
  );
}
```

---

### Step 5: Background Service Worker

Create `src/background.ts`:

```typescript
import { setupAuthMessageListener } from './auth/login';
import { getValidAccessToken, isAuthenticated } from './auth/manager';

// Setup auth message listener on extension load
setupAuthMessageListener();

console.log('🚀 BoltReply extension loaded');

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AUTH_STATUS') {
    isAuthenticated().then(authenticated => {
      sendResponse({ isAuthenticated: authenticated });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_ACCESS_TOKEN') {
    getValidAccessToken().then(token => {
      sendResponse({ token });
    });
    return true;
  }
});
```

---

### Step 6: API Client Module

Create `src/api/client.ts` for making authenticated API calls:

```typescript
import { getValidAccessToken } from '../auth/manager';
import { clearTokens } from '../auth/storage';

const API_BASE = 'https://boltreply.io';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getValidAccessToken();

  if (!token) {
    return {
      success: false,
      error: 'Not authenticated. Please log in.',
    };
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        await clearTokens();
        return {
          success: false,
          error: 'Session expired. Please log in again.',
        };
      }

      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('API request error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Generate AI response for a review
 */
export async function generateAIResponse(params: {
  review_text: string;
  review_rating?: number;
  mode: 'simple' | 'pro';
  custom_prompt?: string;
}) {
  return apiRequest<{
    generated_response: string;
    credits_remaining: number;
    processing_time_ms: number;
  }>('/api/v1/ai/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Get user profile
 */
export async function getProfile() {
  return apiRequest<{
    id: string;
    email: string;
    credits_available: number;
    subscription_status: string;
  }>('/api/v1/me');
}
```

---

### Step 7: Popup UI Integration

Example popup script (`src/popup/index.ts`):

```typescript
import { isAuthenticated, logout, fetchUserProfile } from '../auth/manager';
import { openLoginPopup } from '../auth/login';
import { getUserProfile } from '../auth/storage';

// DOM Elements
const loginSection = document.getElementById('login-section')!;
const userSection = document.getElementById('user-section')!;
const loginButton = document.getElementById('login-btn')!;
const logoutButton = document.getElementById('logout-btn')!;
const userEmail = document.getElementById('user-email')!;
const userCredits = document.getElementById('user-credits')!;

// Initialize popup
async function initPopup() {
  const authenticated = await isAuthenticated();

  if (authenticated) {
    showUserSection();
    await loadUserData();
  } else {
    showLoginSection();
  }
}

function showLoginSection() {
  loginSection.style.display = 'block';
  userSection.style.display = 'none';
}

function showUserSection() {
  loginSection.style.display = 'none';
  userSection.style.display = 'block';
}

async function loadUserData() {
  // First try cached profile
  let profile = await getUserProfile();
  
  // Fetch fresh data
  profile = await fetchUserProfile();
  
  if (profile) {
    userEmail.textContent = profile.email;
    userCredits.textContent = `${profile.credits_available} credits`;
  }
}

// Event Listeners
loginButton.addEventListener('click', () => {
  openLoginPopup();
});

logoutButton.addEventListener('click', async () => {
  await logout();
  showLoginSection();
});

// Listen for auth state changes from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTH_STATE_CHANGED') {
    if (message.isAuthenticated) {
      showUserSection();
      loadUserData();
    } else {
      showLoginSection();
    }
  }
});

// Initialize
initPopup();
```

---

## Website-Side: Extension Callback Page

The website needs a callback page to send tokens to the extension.

**File:** `src/app/auth/extension-callback/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function sendTokensToExtension() {
      try {
        const supabase = createClient();
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          setStatus('error');
          setErrorMessage('No active session found. Please try logging in again.');
          return;
        }

        // Get extension ID from environment or use the known production ID
        const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;

        if (!extensionId) {
          setStatus('error');
          setErrorMessage('Extension ID not configured.');
          return;
        }

        // Send tokens to the extension
        chrome.runtime.sendMessage(
          extensionId,
          {
            type: 'AUTH_TOKENS',
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              setStatus('error');
              setErrorMessage('Failed to connect to extension. Is it installed?');
              return;
            }

            if (response?.success) {
              setStatus('success');
              // Window will be closed by the extension
            } else {
              setStatus('error');
              setErrorMessage('Failed to authenticate with extension.');
            }
          }
        );
      } catch (error) {
        setStatus('error');
        setErrorMessage('An unexpected error occurred.');
        console.error('Extension callback error:', error);
      }
    }

    sendTokensToExtension();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8 max-w-md">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <h1 className="text-xl font-medium text-foreground">
              Connecting to Extension...
            </h1>
            <p className="text-muted-foreground mt-2">
              This window will close automatically.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h1 className="text-xl font-medium text-foreground">
              Successfully Connected!
            </h1>
            <p className="text-muted-foreground mt-2">
              You can close this window.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-red-500 text-5xl mb-4">✗</div>
            <h1 className="text-xl font-medium text-foreground">
              Connection Failed
            </h1>
            <p className="text-muted-foreground mt-2">{errorMessage}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Environment Variables

Add to your `.env.local`:

```bash
# Chrome Extension ID (get from chrome://extensions after loading unpacked)
NEXT_PUBLIC_EXTENSION_ID=your-extension-id-here
```

For production, add this to your Vercel/hosting environment variables.

---

## Security Considerations

1. **Token Storage**: Tokens are stored in `chrome.storage.local`, which is encrypted and isolated per extension
2. **Origin Validation**: The extension validates message origins before accepting tokens
3. **HTTPS Only**: All API calls use HTTPS
4. **Token Refresh**: Tokens are refreshed before expiry to prevent session interruption
5. **CORS**: Backend validates extension origin via `ALLOWED_EXTENSION_IDS` environment variable

---

## Testing Checklist

- [ ] Login popup opens when clicking login button
- [ ] Google OAuth flow completes successfully
- [ ] Tokens are stored in extension after login
- [ ] API calls work with stored token
- [ ] Token refresh works when token expires
- [ ] Logout clears all stored data
- [ ] Re-login works after logout
- [ ] Same account accessible from both website and extension

---

## Troubleshooting

### "Extension not found" error
- Verify the extension ID in `NEXT_PUBLIC_EXTENSION_ID` matches your installed extension
- Check that `externally_connectable` in manifest includes the website URL

### "Token refresh failed" error
- Ensure the `/api/auth/refresh` endpoint is deployed
- Check that refresh tokens are being stored correctly

### CORS errors
- Add your extension ID to `ALLOWED_EXTENSION_IDS` environment variable on the backend
- Verify `host_permissions` in manifest includes the API URL

### Login popup doesn't close
- Check browser console for errors
- Verify the extension is receiving the `AUTH_TOKENS` message
