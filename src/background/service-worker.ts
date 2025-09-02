 // Background service worker for Chrome Extension
// This handles authentication and API communication according to responder.md

console.log('AI Review Responder Background Service Worker loaded');

// API Configuration - Update these with your actual API endpoints
const API_BASE_URL = 'http://localhost:3000/api/v1'; // Development
const API_BASE_URL_PROD = 'https://your-production-domain.com/api/v1'; // Production

// Update this to point to your production API when ready
const CURRENT_API_BASE_URL = API_BASE_URL; // Change to API_BASE_URL_PROD for production

// Constants for API endpoints - using your actual API endpoints
const API_ENDPOINTS = {
  BUSINESS_PROFILE: '/me/business-profile',
  PROMPTS: '/me/prompts',
  JOBS: '/jobs'
};

// API Configuration object for the new client
const API_CONFIG = {
  baseUrl: CURRENT_API_BASE_URL,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

// Import the new API functions
import {
  createAIGenerationJob,
  pollJobStatus,
  handleAPIErrorGuide,
  getBusinessProfileGuide,
  getUserPrompts
} from '../utils/api';

// Types for API responses
interface APIJobResponse {
  success: boolean;
  job: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    result?: {
      generated_response: string;
      confidence_score: number;
      processing_time_ms: number;
      tokens_used: number;
    };
    error?: string;
  };
  error?: string; // Add error property at response level for API errors
}

interface APISessionData {
  success: boolean;
  user: {
    id: string;
    email: string;
    answering_mode_selected: string;
    credits_available: number;
  };
  business_profile: {
    business_name: string;
    business_main_category: string;
    response_tone: string;
    language: string;
    greetings: string;
    signatures: string;
  };
  prompts: Array<{
    id: string;
    content: string;
    rating: number;
  }>;
}

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Review Responder Extension installed');
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background message received:', message);

  // Handle different message types
  switch (message.type) {
    case 'GENERATE_AI_RESPONSE':
      handleAIGenerationRequest(message, sender)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep the message channel open for async response

    case 'AUTH_STATUS':
      checkAuthStatus()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
      return;
  }
});

/**
 * Handle AI generation request from content script
 */
async function handleAIGenerationRequest(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    console.log('Processing AI generation request:', message);

    // Validate message data
    if (!message.data?.reviewData) {
      throw new Error('No review data provided');
    }

    const reviewData = message.data.reviewData;
    const mode = message.data.mode || 'simple';
    const customPrompt = message.data.customPrompt;

    console.log('Processing request:', {
      mode,
      hasCustomPrompt: !!customPrompt,
      reviewer: reviewData.reviewer_name,
      rating: reviewData.review_rating,
      reviewTextLength: reviewData.review_text?.length
    });

    // Step 1: Create AI generation job using new API
    console.log('🚀 Creating AI generation job...');
    const jobResponse = await createAIGenerationJob(reviewData, mode, customPrompt, API_CONFIG);

    if (!jobResponse.success || !jobResponse.job) {
      throw new Error('Failed to create AI job');
    }

    const jobId = jobResponse.job.id;
    console.log('✅ AI job created successfully:', jobId);

    // Step 2: Poll for job completion with progress updates
    console.log('⏳ Starting to poll for job completion...');

    const progressCallback = (status: string, progress?: number) => {
      console.log(`📊 Job progress: ${status} (${progress || 0}%)`);

      // Send progress update to content script
      sendResponseToContentScript(sender, {
        type: 'PROGRESS_UPDATE',
        status,
        progress,
        jobId
      });
    };

    const result = await pollJobStatus(jobId, API_CONFIG, progressCallback);

    if (!result) {
      throw new Error('Job completed but no result was provided');
    }

    console.log('✅ Job completed successfully:', {
      responseLength: result.generated_response?.length || 0,
      confidence: result.confidence_score,
      processingTime: result.processing_time_ms,
      tokensUsed: result.tokens_used
    });

    // Step 3: Send final result back to content script
    await sendResponseToContentScript(sender, {
      success: true,
      aiResponse: result.generated_response || '',
      jobId: jobId,
      confidence: result.confidence_score,
      processingTime: result.processing_time_ms,
      tokensUsed: result.tokens_used,
      modelUsed: result.model_used,
      toneUsed: result.tone_used
    });

    return { success: true, jobId };

  } catch (error) {
    console.error('❌ Error in AI generation request:', error);

    // Handle error using the guide's error handler
    const apiError = handleAPIErrorGuide(error);

    // Send error back to content script
    await sendResponseToContentScript(sender, {
      success: false,
      error: apiError.message,
      errorCode: apiError.code
    });

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
async function sendResponseToContentScript(sender: chrome.runtime.MessageSender, responseData: any): Promise<void> {
  try {
    // Try to send message back through the same tab
    if (sender.tab?.id) {
      const message = {
        type: responseData.type || 'AI_RESPONSE_RESULT',
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
async function checkAuthStatus(): Promise<any> {
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
          credits_available: 100 // Default - you may want to fetch this from your API
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

    } catch (error: any) {
      console.error('❌ Error validating token with API:', error);

      if (error.message?.includes('401') || error.message?.includes('Authentication')) {
        // Token is invalid, clear it
        console.log('🗑️ Clearing invalid token');
        await chrome.storage.local.remove(['auth_token']);
        return { isAuthenticated: false, error: 'Token expired' };
      }

      // For other errors, assume token is still valid but API is down
      console.log('⚠️ API error but keeping token (may be temporary):', error.message);
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

  } catch (error) {
    console.error('❌ Error checking auth status:', error);
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Export for potential use in other modules
export { API_BASE_URL, API_ENDPOINTS };
