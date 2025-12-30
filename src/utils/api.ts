// Default API configuration
const DEFAULT_API_CONFIG: APIConfig = {
  baseUrl: 'https://www.boltreply.io/api/v1',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

import {
  GenerateResponseRequest,
  GenerateResponseResponse,
  APIConfig,
  BusinessProfile,
  CustomPromptsResponse,
  BusinessProfileResponse,
  PromptsResponse,
  ReviewData,
  APIError,
  DirectAIGenerateResponse,
  AnsweringModeResponse
} from '../types';
import { getCurrentToken, refreshToken } from './auth';

function extractErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return undefined;
}

function errorIncludes(error: unknown, text: string): boolean {
  const message = extractErrorMessage(error);
  return message ? message.includes(text) : false;
}

/**
 * Make an authenticated API request with automatic token refresh
 */
async function makeAuthenticatedRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<T> {
  let token = await getCurrentToken();
  
  if (!token) {
    throw new Error('No authentication token available');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      // Token expired, try to refresh
      const newToken = await refreshToken();
      if (newToken) {
        // Retry with new token
        const retryResponse = await fetch(`${config.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newToken}`,
            ...options.headers
          }
        });
        
        if (!retryResponse.ok) {
          throw new Error(`API request failed: ${retryResponse.status} ${retryResponse.statusText}`);
        }
        
        return await retryResponse.json();
      } else {
        throw new Error('Authentication failed and token refresh unsuccessful');
      }
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
    
    throw new Error('Unknown error occurred');
  }
}

/**
 * Make an API request with retry logic
 */
async function makeRequestWithRetry<T>(
  requestFn: () => Promise<T>,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === config.retryAttempts) {
        break;
      }
      
      // Exponential backoff
      const delay = config.retryDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Generate AI response for a review using the new direct API
 */
export async function generateResponse(
  request: GenerateResponseRequest,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<GenerateResponseResponse> {
  try {
    // Format the request according to the new API structure
    const apiRequest = {
      review_text: request.reviewData.review_text,
      reviewer_name: request.reviewData.reviewer_name,
      review_rating: request.reviewData.review_rating
    };

    const response = await makeAuthenticatedRequest<DirectAIGenerateResponse>('/ai/generate', {
      method: 'POST',
      body: JSON.stringify(apiRequest)
    }, config);

    return {
      success: true,
      response: response.generated_response,
      requestId: response.request_id || `direct_${Date.now()}`,
      status: 'completed'
    };

  } catch (error: unknown) {
    console.error('❌ AI generation failed:', error);
    const errorMessage = extractErrorMessage(error) ?? 'AI generation failed';

    return {
      success: false,
      error: errorMessage,
      requestId: `failed_${Date.now()}`,
      status: 'failed'
    };
  }
}

/**
 * Get business context information (legacy function - now uses business profile API)
 */
export async function getBusinessContext(
  businessId: string,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<BusinessProfile> {
  return getBusinessProfile(config);
}

/**
 * Validate review data before sending to API
 */
export function validateReviewData(reviewData: Partial<ReviewData>): boolean {
  if (!reviewData || typeof reviewData !== 'object') {
    return false;
  }

  // Use correct field names from our API
  const requiredFields = ['reviewer_name', 'review_rating', 'review_text'];

  // Check that we have at least review_text (can be empty string for empty reviews)
  const hasReviewText = reviewData.review_text !== undefined && reviewData.review_text !== null;

  // Check that we have at least one identifying field
  const hasIdentifier = Boolean(reviewData.reviewer_name || reviewData.review_rating);

  return hasReviewText && hasIdentifier;
}

/**
 * Create a properly formatted API request
 */
export function createAPIRequest(
  reviewData: ReviewData,
  responseMode: GenerateResponseRequest['responseMode'],
  businessContext?: string,
  tone?: GenerateResponseRequest['tone']
): GenerateResponseRequest {
  if (!validateReviewData(reviewData)) {
    throw new Error('Invalid review data provided');
  }
  
  return {
    reviewData,
    responseMode,
    businessContext,
    tone
  };
}

/**
 * Handle API errors and provide user-friendly messages
 */
export function handleAPIError(error: unknown): string {
  const message = extractErrorMessage(error);

  if (typeof message === 'string') {
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (message.includes('401') || message.includes('Authentication')) {
      return 'Authentication failed. Please log in again.';
    }
    if (message.includes('429')) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    if (message.includes('500')) {
      return 'Server error. Please try again later.';
    }
    return message;
  }
  
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Test API connectivity
 */
export async function testAPIConnectivity(config: APIConfig = DEFAULT_API_CONFIG): Promise<boolean> {
  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Test authenticated API connectivity with the new endpoints
 */
export async function testAuthenticatedConnectivity(config: APIConfig = DEFAULT_API_CONFIG): Promise<boolean> {
  try {
    // Test business profile endpoint (this will fail with 401 if not authenticated)
    await getBusinessProfile(config);
    return true;
  } catch (error: unknown) {
    // If we get a 401, it means the API is working but user is not authenticated
    if (errorIncludes(error, '401') || errorIncludes(error, 'Authentication')) {
      return false; // API is working, but authentication failed
    }
    // If we get a different error, the API might not be reachable
    console.error('API connectivity test failed:', error);
    return false;
  }
}

/**
 * Get user's business profile
 */
export async function getBusinessProfile(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<BusinessProfile> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<BusinessProfile>('/me/business-profile', {
      method: 'GET'
    }, config);
  }, config);
}

/**
 * Get user's custom prompts for Pro mode
 */
export async function getCustomPrompts(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<CustomPromptsResponse> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<CustomPromptsResponse>('/me/prompts', {
      method: 'GET'
    }, config);
  }, config);
}

/**
 * Update business profile
 */
export async function updateBusinessProfile(
  profile: Partial<BusinessProfile>,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<BusinessProfile> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<BusinessProfile>('/me/business-profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    }, config);
  }, config);
}

// ============================================================================
// NEW API CLIENT FUNCTIONS FOLLOWING INTEGRATION GUIDE
// ============================================================================

/**
 * Generate AI response directly (replaces createAIGenerationJob)
 */
export async function generateAIResponse(
  reviewData: ReviewData,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<DirectAIGenerateResponse> {
  // Validate required fields
  if (!reviewData.review_text) {
    throw new Error('Review text is required');
  }

  // Allow empty reviews with our placeholder text
  if (reviewData.review_text.trim().length === 0) {
    reviewData.review_text = "[Review with no text content]";
  }

  const payload = {
    review_text: reviewData.review_text,
    reviewer_name: reviewData.reviewer_name,
    review_rating: reviewData.review_rating
  };

  return makeRequestWithRetry<DirectAIGenerateResponse>(async () => {
    return makeAuthenticatedRequest<DirectAIGenerateResponse>('/ai/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    }, config);
  }, config);
}

/**
 * Get business profile according to the integration guide
 */
export async function getBusinessProfileGuide(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<BusinessProfileResponse> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<BusinessProfileResponse>('/me/business-profile', {
      method: 'GET'
    }, config);
  }, config);
}

/**
 * Get user prompts according to the integration guide
 */
export async function getUserPrompts(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<PromptsResponse> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<PromptsResponse>('/me/prompts', {
      method: 'GET'
    }, config);
  }, config);
}

/**
 * Handle API errors according to the integration guide
 */
export function handleAPIErrorGuide(error: unknown): APIError {
  if (errorIncludes(error, '401') || errorIncludes(error, 'Authentication')) {
    return {
      code: 'AUTH_FAILED',
      message: 'Authentication failed. Please log in again.',
      details: error
    };
  }
  if (errorIncludes(error, '402') || errorIncludes(error, 'credits')) {
    return {
      code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits. Please upgrade your plan or purchase more credits.',
      details: error
    };
  }
  if (errorIncludes(error, '404') || errorIncludes(error, 'NotFound')) {
    return {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      details: error
    };
  }
  if (errorIncludes(error, '429') || errorIncludes(error, 'rate limit')) {
    return {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment before trying again.',
      details: error
    };
  }
  if (errorIncludes(error, '500') || errorIncludes(error, 'Internal Server Error')) {
    return {
      code: 'SERVER_ERROR',
      message: 'Server error. Please try again later.',
      details: error
    };
  }
  if (errorIncludes(error, 'network') || errorIncludes(error, 'fetch')) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error. Please check your internet connection and try again.',
      details: error
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: extractErrorMessage(error) ?? 'An unexpected error occurred. Please try again.',
    details: error
  };
}

/**
 * Extract review data from Google reviews using the provided selectors
 */
export function extractReviewDataFromSelectors(): ReviewData | null {
  try {
    // Extract reviewer name using the provided selector
    const reviewerNameElement = document.querySelector('#AH1dze > div > div > main > div > div > c-wiz > div > div > article > div.noyJyc > div > div > div.N0c6q.JhRJje') as HTMLElement;
    const reviewer_name = reviewerNameElement?.textContent?.trim();

    // Extract rating from the star rating span
    const ratingElement = document.querySelector('span[aria-label*="de 5 estrellas"], span[aria-label*="out of 5 stars"]') as HTMLElement;
    let review_rating: number | undefined;

    if (ratingElement) {
      const ariaLabel = ratingElement.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/(\d+)\s*(?:de|out of)\s*5/);
      if (match) {
        review_rating = parseInt(match[1], 10);
      }
    }

    // Extract review text using the provided selector
    const reviewTextElement = document.querySelector('div.gyKkFe.JhRJje.Fv38Af') as HTMLElement;
    const review_text = reviewTextElement?.textContent?.trim();

    // Validate that we have the minimum required data
    if (!review_text || review_text.length === 0) {
      return null;
    }

    const reviewData: ReviewData = {
      reviewer_name,
      review_rating,
      review_text,
      website_url: window.location.href,
      source_platform: 'Google'
    };

    return reviewData;

  } catch (error) {
    console.error('❌ Error extracting review data:', error);
    return null;
  }
}

/**
 * Fetch answering mode from API
 */
export async function getAnsweringMode(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<AnsweringModeResponse> {
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<AnsweringModeResponse>('/me/answering-mode', {
      method: 'GET'
    }, config);
  }, config);
}
