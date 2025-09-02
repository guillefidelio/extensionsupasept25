// Review data structure extracted from Google My Business pages
export interface ReviewData {
  reviewer_name?: string;
  review_rating?: number;
  review_text: string;
  reviewerName?: string; // For backward compatibility
  rating?: number; // For backward compatibility
  reviewText?: string; // For backward compatibility
  reviewDate?: string;
  businessName?: string;
  reviewId?: string;
  website_url?: string;
  source_platform?: string;
}

// Response generation modes
export type ResponseMode = 'simple' | 'pro';

// API request structure for response generation
export interface GenerateResponseRequest {
  reviewData: ReviewData;
  responseMode: ResponseMode;
  businessContext?: string;
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
}

// API response structure
export interface GenerateResponseResponse {
  success: boolean;
  response?: string;
  error?: string;
  requestId?: string;
  status: 'pending' | 'completed' | 'failed';
}

// User data structure
export interface User {
  id: string;
  email: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
}

// Authentication state
export interface AuthState {
  isAuthenticated: boolean;
  user?: User;
  token?: string;
  tokenExpiry?: number;
  isLoading?: boolean;
  error?: string;
}

// Login form data
export interface LoginFormData {
  email: string;
  password: string;
}

// Login response
export interface LoginResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  details?: FormErrors;
}

// Extension state
export interface ExtensionState {
  auth: AuthState;
  currentReview?: ReviewData;
  responseMode: ResponseMode;
  isLoading: boolean;
  error?: string;
  lastGeneratedResponse?: string;
}

// Chrome message types for communication between components
export interface ChromeMessage {
  type: 'EXTRACT_REVIEW' | 'GENERATE_RESPONSE' | 'INSERT_RESPONSE' | 'AUTH_STATUS' | 'ERROR' | 'LOGIN_REQUEST' | 'LOGOUT_REQUEST';
  payload?: any;
  error?: string;
}

// DOM element selectors for Google My Business pages
export interface DOMSelectors {
  reviewerName: string;
  rating: string;
  reviewText: string;
  replyForm: string;
  replyTextarea: string;
  submitButton: string;
}

// API configuration
export interface APIConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// Error types
export interface ExtensionError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

// Storage keys for Chrome extension storage
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_ID: 'user_id',
  TOKEN_EXPIRES_AT: 'token_expires_at',
  USER_DATA: 'user_data',
  SETTINGS: 'settings',
  REVIEW_CACHE: 'review_cache'
} as const;

// Response generation status
export interface GenerationStatus {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedTime?: number;
  result?: string;
  error?: string;
}

// Business Profile types
export interface BusinessProfile {
  businessName: string;
  category: string;
  tone: 'professional' | 'friendly' | 'formal' | 'casual';
  language: 'en' | 'es' | 'auto';
  greeting?: string;
  signature?: string;
  customInstructions?: string;
}

// Custom Prompt types
export interface CustomPrompt {
  id: string;
  content: string;
  rating: number;
  category?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomPromptsResponse {
  prompts: CustomPrompt[];
  totalCount: number;
}

// Job types for AI processing
export interface CreateJobRequest {
  reviewData: ReviewData;
  mode: 'simple' | 'pro';
  promptId?: string;
  customPrompt?: string;
}

export interface CreateJobResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedTime?: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  estimatedTime?: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Jobs history
export interface JobHistoryItem {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reviewData: ReviewData;
  mode: 'simple' | 'pro';
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobsHistoryResponse {
  jobs: JobHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// Form validation errors
export interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

// Login attempt tracking
export interface LoginAttempts {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

// API types matching the integration guide
export interface CreateJobPayload {
  job_type: 'ai_generation';
  payload: {
    review_text: string;
    review_rating?: number;
    reviewer_name?: string;
    mode: 'simple' | 'pro';
    custom_prompt?: string;
    website_url?: string;
    user_preferences?: {
      reviewerName?: string;
      responseStyle?: string;
    };
  };
}

export interface CreateJobResponse {
  success: boolean;
  job: {
    id: string;
    user_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    job_type: 'ai_generation';
    payload: Record<string, unknown>;
    result: null;
    error: null;
    retry_count: number;
    created_at: string;
    updated_at: string;
  };
}

export interface JobStatusResponse {
  success: boolean;
  job: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: {
      generated_response: string;
      confidence_score: number;
      processing_time_ms: number;
      tokens_used: number;
      model_used: string;
      tone_used: string;
      max_length_requested: string;
      system_prompt_used: string;
    };
    error?: string;
    updated_at: string;
  };
}

export interface BusinessProfileResponse {
  success: boolean;
  business_profile: {
    business_name: string;
    business_main_category: string;
    business_secondary_category?: string;
    main_products_services: string;
    brief_description: string;
    country: string;
    state_province: string;
    language: string;
    response_tone: string;
    response_length: string;
    greetings: string;
    signatures: string;
    positive_review_cta: string;
    negative_review_escalation: string;
    brand_voice_notes: string;
    other_considerations: string;
  };
}

export interface PromptsResponse {
  success: boolean;
  prompts: Array<{
    id: string;
    content: string;
    rating: number;
    created_at: string;
  }>;
}

// API error types
export interface APIError {
  code?: string;
  message: string;
  details?: any;
}


