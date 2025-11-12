 // Background service worker for Chrome Extension
// This handles authentication and API communication according to responder.md

console.log('AI Review Responder Background Service Worker loaded');

// API Configuration - Update these with your actual API endpoints
const API_BASE_URL = 'https://paddle-billing-subscription-starter-mauve.vercel.app/api/v1'; // Production

// Constants for API endpoints - using your actual API endpoints
const API_ENDPOINTS = {
  BUSINESS_PROFILE: '/me/business-profile',
  PROMPTS: '/me/prompts',
  AI_GENERATE: '/ai/generate'
};

// API Configuration object for the new client
const API_CONFIG = {
  baseUrl: API_BASE_URL,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

// Import the new API functions
import {
  generateAIResponse,
  handleAPIErrorGuide,
  getBusinessProfileGuide,
  getUserPrompts
} from '../utils/api';
import type {
  AIResponseErrorPayload,
  AIResponsePayload,
  AIResponseRequestMessage,
  AIResponseResultMessage,
  AIResponseSuccessPayload,
  AuthStatusResponse,
  DirectAIGenerateResponse,
  ChromeMessage
} from '../types';

type BackgroundMessage = AIResponseRequestMessage | ChromeMessage;

function isAIResponseRequestMessage(message: BackgroundMessage): message is AIResponseRequestMessage {
  if (message.type !== 'GENERATE_AI_RESPONSE') {
    return false;
  }

  const candidate = message as AIResponseRequestMessage;
  return typeof candidate.data === 'object' && candidate.data !== null && 'reviewData' in candidate.data;
}

function extractErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Review Responder Extension installed');
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  console.log('Background message received:', message);

  switch (message.type) {
    case 'GENERATE_AI_RESPONSE': {
      if (!isAIResponseRequestMessage(message)) {
        sendResponse({ success: false, error: 'Invalid AI response request' });
        return false;
      }

      handleAIGenerationRequest(message, sender)
        .then(result => sendResponse(result))
        .catch((error: unknown) => {
          sendResponse({
            success: false,
            error: extractErrorMessage(error) ?? 'Unexpected error occurred'
          });
        });
      return true;
    }

    case 'AUTH_STATUS':
      checkAuthStatus()
        .then(result => sendResponse(result))
        .catch((error: unknown) => {
          sendResponse({
            success: false,
            error: extractErrorMessage(error) ?? 'Failed to check authentication status'
          });
        });
      return true;

    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

/**
 * Handle AI generation request from content script
 */
async function handleAIGenerationRequest(
  message: AIResponseRequestMessage,
  sender: chrome.runtime.MessageSender
): Promise<AIResponsePayload> {
  try {
    console.log('Processing AI generation request:', message);

    // Validate message data
    const { reviewData } = message.data;

    console.log('Processing request:', {
      reviewer: reviewData.reviewer_name,
      rating: reviewData.review_rating,
      reviewTextLength: reviewData.review_text?.length
    });

    // Step 1: Generate AI response directly using new API
    console.log('🚀 Generating AI response directly...');
    const result = await generateAIResponse(reviewData, API_CONFIG) as DirectAIGenerateResponse;

    if (!result.success) {
      throw new Error(result.error || 'AI generation failed');
    }

    console.log('✅ AI response generated successfully:', {
      responseLength: result.generated_response?.length || 0,
      confidence: result.confidence_score,
      processingTime: result.processing_time_ms,
      tokensUsed: result.tokens_used,
      creditsUsed: result.credits_used,
      creditsRemaining: result.credits_remaining
    });

    // Step 2: Send final result back to content script
    const successPayload: AIResponseSuccessPayload = {
      success: true,
      aiResponse: result.generated_response || '',
      requestId: result.request_id ?? `direct_${Date.now()}`,
      confidence: result.confidence_score,
      processingTime: result.processing_time_ms,
      tokensUsed: result.tokens_used,
      modelUsed: result.model_used,
      creditsUsed: result.credits_used,
      creditsRemaining: result.credits_remaining
    };

    await sendResponseToContentScript(sender, successPayload);

    return successPayload;

  } catch (error: unknown) {
    console.error('❌ Error in AI generation request:', error);

    // Handle error using the guide's error handler
    const apiError = handleAPIErrorGuide(error);

    const errorPayload: AIResponseErrorPayload = {
      success: false,
      error: apiError.message,
      errorCode: apiError.code
    };

    const errorMessage = extractErrorMessage(error) ?? '';
    const errorRecord = asRecord(error);

    // Handle specific error types from the new API
    if (errorMessage.includes('402') || apiError.code === 'INSUFFICIENT_CREDITS') {
      // Insufficient credits error
      const creditsAvailable = typeof errorRecord?.['credits_available'] === 'number'
        ? errorRecord['credits_available'] as number
        : undefined;
      const creditsRequired = typeof errorRecord?.['credits_required'] === 'number'
        ? errorRecord['credits_required'] as number
        : undefined;

      Object.assign(errorPayload, {
        errorType: 'INSUFFICIENT_CREDITS' as const,
        creditsAvailable,
        creditsRequired,
        suggestion: 'Please upgrade your plan or purchase more credits.'
      });
    } else if (errorMessage.includes('400') || apiError.code === 'VALIDATION_ERROR') {
      // Validation error
      Object.assign(errorPayload, {
        errorType: 'VALIDATION_ERROR' as const,
        suggestion: 'Please check your input and try again.'
      });
    } else if (errorMessage.includes('401') || apiError.code === 'AUTH_FAILED') {
      // Authentication error
      Object.assign(errorPayload, {
        errorType: 'AUTH_FAILED' as const,
        suggestion: 'Please log in again.'
      });
    } else if (errorMessage.includes('500') || apiError.code === 'SERVER_ERROR') {
      // Server error
      Object.assign(errorPayload, {
        errorType: 'SERVER_ERROR' as const,
        suggestion: 'Please try again later.'
      });
    }

    // Send error back to content script
    await sendResponseToContentScript(sender, errorPayload);

    throw error;
  }
}

/**
 * Get stored authentication token
 */
async function getStoredAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['auth_token']);
    return result.auth_token || null;
  } catch (error) {
    console.error('Error retrieving auth token:', error);
    return null;
  }
}



/**
 * Send response back to content script
 */
async function sendResponseToContentScript(
  sender: chrome.runtime.MessageSender,
  responseData: AIResponsePayload
): Promise<void> {
  try {
    // Try to send message back through the same tab
    if (sender.tab?.id) {
      const message: AIResponseResultMessage = {
        type: 'AI_RESPONSE_RESULT',
        data: responseData,
        timestamp: Date.now()
      };

      console.log('📤 Sending message to content script:', message);
      await chrome.tabs.sendMessage(sender.tab.id, message);
    }
  } catch (error) {
    console.error('❌ Error sending response to content script:', error);
  }
}

/**
 * Check authentication status using the new API functions
 */
async function checkAuthStatus(): Promise<AuthStatusResponse> {
  try {
    const token = await getStoredAuthToken();

    if (!token) {
      console.log('❌ No authentication token found');
      return { isAuthenticated: false };
    }

    console.log('🔐 Token found, validating with API...');

    // Try to fetch business profile and prompts using new API functions
    try {
      const [businessProfileResponse, promptsResponse] = await Promise.all([
        getBusinessProfileGuide(API_CONFIG),
        getUserPrompts(API_CONFIG)
      ]);

      console.log('✅ API validation successful');

      // Format data to match extension's expected structure
      const businessProfile = businessProfileResponse.business_profile;

      return {
        isAuthenticated: true,
        user: {
          id: promptsResponse.prompts?.[0]?.id || 'user', // Use first prompt ID as fallback
          email: 'user@example.com', // We don't have email from your API
          answering_mode_selected: 'simple', // Default
          credits_available: 100 // Default - could be updated from API in future
        },
        businessProfile: {
          business_name: businessProfile.business_name,
          business_main_category: businessProfile.business_main_category,
          response_tone: businessProfile.response_tone,
          language: businessProfile.language,
          greetings: businessProfile.greetings,
          signatures: businessProfile.signatures
        },
        prompts: promptsResponse.prompts || []
      };

    } catch (error: unknown) {
      console.error('❌ Error validating token with API:', error);

      const errorMessage = extractErrorMessage(error) ?? '';

      if (errorMessage.includes('401') || errorMessage.includes('Authentication')) {
        // Token is invalid, clear it
        console.log('🗑️ Clearing invalid token');
        await chrome.storage.local.remove(['auth_token']);
        return { isAuthenticated: false, error: 'Token expired' };
      }

      // For other errors, assume token is still valid but API is down
      console.log('⚠️ API error but keeping token (may be temporary):', errorMessage);
      return {
        isAuthenticated: true, // Assume still authenticated
        user: {
          id: 'user',
          email: 'user@example.com',
          answering_mode_selected: 'simple',
          credits_available: 100
        },
        businessProfile: {
          business_name: '',
          business_main_category: '',
          response_tone: 'professional',
          language: 'en',
          greetings: '',
          signatures: ''
        },
        prompts: [],
        warning: 'Unable to fetch latest data from server'
      };
    }

  } catch (error: unknown) {
    console.error('❌ Error checking auth status:', error);
    return {
      isAuthenticated: false,
      error: extractErrorMessage(error) ?? 'Unknown error'
    };
  }
}

// Export for potential use in other modules
export { API_BASE_URL, API_ENDPOINTS };
