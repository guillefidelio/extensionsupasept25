import {
  GenerateResponseRequest,
  GenerateResponseResponse,
  GenerationStatus,
  APIConfig,
  BusinessProfile,
  CustomPromptsResponse,
  CreateJobRequest,
  CreateJobResponse,
  JobStatusResponse,
  JobsHistoryResponse,
  CreateJobPayload,
  CreateJobResponse as CreateJobResponseNew,
  JobStatusResponse as JobStatusResponseGuide,
  JobStatusResponse as JobStatusResponseNew,
  BusinessProfileResponse,
  PromptsResponse,
  ReviewData,
  APIError
} from '../types';
import { getCurrentToken, refreshToken } from './auth';

// Default API configuration
const DEFAULT_API_CONFIG: APIConfig = {
  baseUrl: 'http://localhost:3000/api/v1',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

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
 * Generate AI response for a review (legacy function - now uses job-based API)
 */
export async function generateResponse(
  request: GenerateResponseRequest,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<GenerateResponseResponse> {
  // Create a job using the new API
  const jobRequest: CreateJobRequest = {
    reviewData: request.reviewData,
    mode: request.responseMode,
    customPrompt: request.businessContext
  };

  const jobResponse = await createJob(jobRequest, config);

  // Poll for completion
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getJobStatus(jobResponse.jobId, config);

        if (status.status === 'completed' && status.result) {
          resolve({
            success: true,
            response: status.result,
            requestId: jobResponse.jobId,
            status: 'completed'
          });
        } else if (status.status === 'failed') {
          resolve({
            success: false,
            error: status.error || 'Generation failed',
            requestId: jobResponse.jobId,
            status: 'failed'
          });
        } else {
          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * Check the status of a response generation request (legacy function - now uses job status API)
 */
export async function checkGenerationStatus(
  requestId: string,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<GenerationStatus> {
  const jobStatus = await getJobStatus(requestId, config);

  return {
    requestId: jobStatus.jobId,
    status: jobStatus.status,
    progress: jobStatus.progress,
    estimatedTime: jobStatus.estimatedTime,
    result: jobStatus.result,
    error: jobStatus.error
  };
}

/**
 * Poll for generation status with configurable interval
 */
export async function pollGenerationStatus(
  requestId: string,
  onStatusUpdate: (status: GenerationStatus) => void,
  config: APIConfig = DEFAULT_API_CONFIG,
  pollInterval: number = 2000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await checkGenerationStatus(requestId, config);
        onStatusUpdate(status);
        
        if (status.status === 'completed' && status.result) {
          resolve(status.result);
        } else if (status.status === 'failed') {
          reject(new Error(status.error || 'Generation failed'));
        } else {
          // Continue polling
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
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
export function validateReviewData(reviewData: any): boolean {
  if (!reviewData || typeof reviewData !== 'object') {
    return false;
  }

  // Use correct field names from our API
  const requiredFields = ['reviewer_name', 'review_rating', 'review_text'];

  // Check that we have at least review_text (can be empty string for empty reviews)
  const hasReviewText = reviewData.review_text !== undefined && reviewData.review_text !== null;

  // Check that we have at least one identifying field
  const hasIdentifier = reviewData.reviewer_name || reviewData.review_rating;

  return hasReviewText && hasIdentifier;
}

/**
 * Create a properly formatted API request
 */
export function createAPIRequest(
  reviewData: any,
  responseMode: 'simple' | 'pro',
  businessContext?: string,
  tone?: string
): GenerateResponseRequest {
  if (!validateReviewData(reviewData)) {
    throw new Error('Invalid review data provided');
  }
  
  return {
    reviewData,
    responseMode,
    businessContext,
    tone: tone as any
  };
}

/**
 * Handle API errors and provide user-friendly messages
 */
export function handleAPIError(error: any): string {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (error.message.includes('401') || error.message.includes('Authentication')) {
      return 'Authentication failed. Please log in again.';
    }
    if (error.message.includes('429')) {
      return 'Too many requests. Please wait a moment before trying again.';
    }
    if (error.message.includes('500')) {
      return 'Server error. Please try again later.';
    }
    return error.message;
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
  } catch (error: any) {
    // If we get a 401, it means the API is working but user is not authenticated
    if (error.message?.includes('401') || error.message?.includes('Authentication')) {
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
 * Create a new AI generation job
 */
export async function createJob(
  request: CreateJobRequest,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<CreateJobResponse> {
  // Format request according to API expectations
  const apiRequest = {
    job_type: 'review_response',
    payload: request
  };

  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<CreateJobResponse>('/jobs', {
      method: 'POST',
      body: JSON.stringify(apiRequest)
    }, config);
  }, config);
}

/**
 * Get job status and results
 * Note: This endpoint may not exist in your API yet
 */
export async function getJobStatus(
  jobId: string,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<JobStatusResponseGuide> {
  try {
    return await makeRequestWithRetry(async () => {
      return makeAuthenticatedRequest<JobStatusResponseGuide>(`/jobs/${jobId}`, {
        method: 'GET'
      }, config);
    }, config);
  } catch (error: any) {
    // If 404, the endpoint doesn't exist - return a simulated response
    if (error.message?.includes('404') || error.message?.includes('NotFound')) {
      console.warn(`Job status endpoint not implemented. Job ID: ${jobId}`);
      // Return a mock response in the old format to maintain compatibility
      return {
        jobId: jobId,
        status: 'pending', // Assume pending since we can't check
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any; // Type assertion for compatibility
    }
    throw error;
  }
}

/**
 * Get user's job history
 */
export async function getJobsHistory(
  page: number = 1,
  pageSize: number = 20,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<JobsHistoryResponse> {
  return makeRequestWithRetry(async () => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString()
    });

    return makeAuthenticatedRequest<JobsHistoryResponse>(`/me/jobs?${params}`, {
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
 * Create AI generation job according to the integration guide
 */
export async function createAIGenerationJob(
  reviewData: ReviewData,
  mode: 'simple' | 'pro',
  customPrompt?: string,
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<CreateJobResponseNew> {
  // Validate required fields
  if (!reviewData.review_text) {
    throw new Error('Review text is required');
  }

  // Allow empty reviews with our placeholder text
  if (reviewData.review_text.trim().length === 0) {
    reviewData.review_text = "[Review with no text content]";
    console.log('🔄 API: Empty review text replaced with placeholder');
    console.log('📊 Review data:', {
      reviewer_name: reviewData.reviewer_name,
      review_rating: reviewData.review_rating,
      original_text_length: reviewData.review_text.length,
      is_placeholder: true
    });
  }

  if (!mode || !['simple', 'pro'].includes(mode)) {
    throw new Error('Valid mode (simple or pro) is required');
  }

  if (mode === 'pro' && !customPrompt) {
    throw new Error('Custom prompt is required for Pro mode');
  }

  const payload: CreateJobPayload = {
    job_type: 'ai_generation',
    payload: {
      review_text: reviewData.review_text,
      review_rating: reviewData.review_rating,
      reviewer_name: reviewData.reviewer_name,
      mode,
      custom_prompt: customPrompt,
      website_url: reviewData.website_url || window.location.href,
      user_preferences: {
        reviewerName: reviewData.reviewer_name,
        responseStyle: mode === 'simple' ? 'professional' : 'custom'
      }
    }
  };

  console.log('Creating AI generation job:', {
    mode,
    hasCustomPrompt: !!customPrompt,
    reviewTextLength: reviewData.review_text.length,
    reviewer: reviewData.reviewer_name,
    isEmptyReview: reviewData.review_text === "[Review with no text content]"
  });

  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<CreateJobResponseNew>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }, config);
  }, config);
}

/**
 * Poll job status according to the integration guide
 */
export async function pollJobStatus(
  jobId: string,
  config: APIConfig = DEFAULT_API_CONFIG,
  onProgress?: (status: string, progress?: number) => void
): Promise<JobStatusResponseNew['job']['result']> {
  const pollInterval = 2000; // 2 seconds base interval
  const maxAttempts = 150; // 5 minutes max
  let attempts = 0;

  console.log(`Starting to poll job status for job: ${jobId}`);

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`Polling attempt ${attempts}/${maxAttempts} for job: ${jobId}`);

      const response = await makeRequestWithRetry(async () => {
        return makeAuthenticatedRequest<JobStatusResponseNew>(`/jobs/${jobId}`, {
          method: 'GET'
        }, config);
      }, config);

      if (!response.success || !response.job) {
        throw new Error('Invalid response format from job status API');
      }

      const job = response.job;
      console.log(`Job status: ${job.status} (attempt ${attempts}/${maxAttempts})`);

      // Call progress callback if provided
      if (onProgress) {
        let progress = 0;
        switch (job.status) {
          case 'pending':
            progress = 10;
            break;
          case 'processing':
            progress = 50;
            break;
          case 'completed':
            progress = 100;
            break;
          case 'failed':
            progress = 0;
            break;
        }
        onProgress(job.status, progress);
      }

      switch (job.status) {
        case 'completed':
          if (!job.result) {
            throw new Error('Job completed but no result provided');
          }
          console.log('✅ Job completed successfully!');
          return job.result;

        case 'failed':
          const errorMsg = job.error || 'AI generation failed';
          console.error('❌ Job failed:', errorMsg);
          throw new Error(`AI generation failed: ${errorMsg}`);

        case 'pending':
        case 'processing':
          // Continue polling with exponential backoff
          const delay = Math.min(pollInterval * Math.pow(1.2, attempts - 1), 10000); // Max 10 seconds
          console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next poll...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          break;

        default:
          throw new Error(`Unknown job status: ${job.status}`);
      }

    } catch (error: any) {
      if (error.message?.includes('404')) {
        throw new Error(`Job not found: ${jobId}. The job may have been deleted or you may not have permission to access it.`);
      }
      if (error.message?.includes('401')) {
        throw new Error('Authentication failed. Please log in again.');
      }
      if (error.message?.includes('403')) {
        throw new Error('Access denied. You do not have permission to access this job.');
      }
      throw error;
    }
  }

  throw new Error(`Job timed out after ${maxAttempts} attempts (${Math.round(maxAttempts * pollInterval / 1000)}s). The AI generation may be taking longer than expected.`);
}

/**
 * Get business profile according to the integration guide
 */
export async function getBusinessProfileGuide(
  config: APIConfig = DEFAULT_API_CONFIG
): Promise<BusinessProfileResponse> {
  console.log('Fetching business profile from API');
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
  console.log('Fetching user prompts from API');
  return makeRequestWithRetry(async () => {
    return makeAuthenticatedRequest<PromptsResponse>('/me/prompts', {
      method: 'GET'
    }, config);
  }, config);
}

/**
 * Handle API errors according to the integration guide
 */
export function handleAPIErrorGuide(error: any): APIError {
  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Authentication')) {
      return {
        code: 'AUTH_FAILED',
        message: 'Authentication failed. Please log in again.',
        details: error
      };
    }
    if (error.message.includes('402') || error.message.includes('credits')) {
      return {
        code: 'INSUFFICIENT_CREDITS',
        message: 'Insufficient credits. Please upgrade your plan or purchase more credits.',
        details: error
      };
    }
    if (error.message.includes('404') || error.message.includes('NotFound')) {
      return {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        details: error
      };
    }
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment before trying again.',
        details: error
      };
    }
    if (error.message.includes('500') || error.message.includes('Internal Server Error')) {
      return {
        code: 'SERVER_ERROR',
        message: 'Server error. Please try again later.',
        details: error
      };
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your internet connection and try again.',
        details: error
      };
    }
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      details: error
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
    details: error
  };
}

/**
 * Extract review data from Google reviews using the provided selectors
 */
export function extractReviewDataFromSelectors(): ReviewData | null {
  try {
    console.log('🔍 Extracting review data using provided selectors');

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
      console.warn('⚠️ No review text found');
      return null;
    }

    const reviewData: ReviewData = {
      reviewer_name,
      review_rating,
      review_text,
      website_url: window.location.href,
      source_platform: 'Google'
    };

    console.log('✅ Successfully extracted review data:', {
      hasReviewer: !!reviewer_name,
      rating: review_rating,
      textLength: review_text.length,
      url: reviewData.website_url
    });

    return reviewData;

  } catch (error) {
    console.error('❌ Error extracting review data:', error);
    return null;
  }
}
