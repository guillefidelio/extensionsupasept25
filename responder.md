# Chrome Extension AI Responder Implementation Guide

## Overview
This document provides precise instructions for implementing the "Respond with AI" functionality in your Chrome extension. The extension will integrate with the ReviewRepl.ai backend API to generate AI-powered responses to reviews.

## Base URL Configuration
```javascript
const API_BASE_URL = 'https://your-domain.com/api/v1'; // Production
// const API_BASE_URL = 'http://localhost:3000/api/v1'; // Development
```

## Authentication
All API calls require a JWT token stored in Chrome's local storage.

```javascript
// Get stored JWT token
const { auth_token } = await chrome.storage.local.get(['auth_token']);

if (!auth_token) {
  throw new Error('User not authenticated');
}

// Use in API calls
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${auth_token}`
};
```

## API Endpoints

### 1. Get User Session Data (Initial Load)
**Endpoint:** `GET /api/v1/me/session-data`

**Purpose:** Fetch all user data in a single request (business profile, preferences, prompts)

**Request:**
```javascript
const response = await fetch(`${API_BASE_URL}/me/session-data`, {
  method: 'GET',
  headers: headers
});
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "answering_mode_selected": "simple",
    "credits_available": 10
  },
  "business_profile": {
    "business_name": "Example Restaurant",
    "business_main_category": "Restaurant",
    "response_tone": "Professional",
    "language": "English",
    "greetings": "Thank you for your review",
    "signatures": "Best regards, Example Restaurant"
  },
  "prompts": [
    {
      "id": "prompt-uuid",
      "content": "For positive reviews, always include a call to action...",
      "rating": 5
    }
  ]
}
```

### 2. Create AI Generation Job
**Endpoint:** `POST /api/v1/jobs`

**Purpose:** Submit a review for AI processing

**Request Body:**
```javascript
const jobPayload = {
  job_type: "ai_generation",
  payload: {
    review_text: "The food was amazing and the service was excellent!",
    review_rating: 5,
    reviewer_name: "John Smith", // Optional
    platform: "google", // Optional: "google", "yelp", "facebook", etc.
    mode: "simple" // or "pro"
  }
};

const response = await fetch(`${API_BASE_URL}/jobs`, {
  method: 'POST',
  headers: headers,
  body: JSON.stringify(jobPayload)
});
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job-uuid-here",
    "status": "pending",
    "job_type": "ai_generation",
    "created_at": "2025-01-28T10:00:00Z"
  }
}
```

**Error Responses:**
```json
// Insufficient credits
{
  "error": "Insufficient credits",
  "credits_remaining": 0,
  "credits_required": 1
}

// No business profile
{
  "error": "Business profile not found",
  "code": "PROFILE_NOT_FOUND"
}
```

### 3. Get Job Status and Result
**Endpoint:** `GET /api/v1/jobs/{job_id}`

**Purpose:** Check job status and retrieve the generated response

**Request:**
```javascript
const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
  method: 'GET',
  headers: headers
});
```

**Response (Pending):**
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "pending",
    "created_at": "2025-01-28T10:00:00Z"
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "completed",
    "result": {
      "generated_response": "Thank you so much for your wonderful review! We're thrilled to hear that you enjoyed both our food and service. Your feedback means the world to us and motivates our team to continue delivering exceptional experiences. We hope to welcome you back soon for another amazing meal!",
      "confidence_score": 0.95,
      "processing_time_ms": 2500,
      "tokens_used": 150
    }
  }
}
```

**Response (Failed):**
```json
{
  "success": true,
  "job": {
    "id": "job-uuid",
    "status": "failed",
    "error": "OpenAI API rate limit exceeded"
  }
}
```

## Implementation Flow

### Step 1: Extract Review Data
```javascript
function extractReviewData() {
  // Extract review text from the current page
  const reviewText = document.querySelector('.review-text').textContent;
  
  // Extract rating (1-5 stars)
  const rating = parseInt(document.querySelector('.rating').getAttribute('data-rating'));
  
  // Extract reviewer name (if available)
  const reviewerName = document.querySelector('.reviewer-name')?.textContent;
  
  // Detect platform
  const platform = detectPlatform(); // "google", "yelp", "facebook", etc.
  
  return {
    review_text: reviewText,
    review_rating: rating,
    reviewer_name: reviewerName,
    platform: platform
  };
}
```

### Step 2: Create AI Job
```javascript
async function createAIJob(reviewData, mode = 'simple') {
  try {
    const jobPayload = {
      job_type: "ai_generation",
      payload: {
        ...reviewData,
        mode: mode
      }
    };

    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(jobPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      if (response.status === 402) {
        // Insufficient credits
        showError(`Insufficient credits. You have ${errorData.credits_remaining} credits, but ${errorData.credits_required} are required.`);
        return null;
      }
      
      throw new Error(errorData.error || 'Failed to create job');
    }

    const data = await response.json();
    return data.job.id;
  } catch (error) {
    console.error('Error creating AI job:', error);
    showError('Failed to create AI job. Please try again.');
    return null;
  }
}
```

### Step 3: Poll for Job Completion
```javascript
async function pollJobStatus(jobId, maxAttempts = 30) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error('Failed to fetch job status');
      }

      const data = await response.json();
      const job = data.job;

      switch (job.status) {
        case 'completed':
          return job.result.generated_response;
          
        case 'failed':
          throw new Error(job.error || 'Job failed');
          
        case 'pending':
        case 'processing':
          // Continue polling
          break;
      }

      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      console.error('Error polling job status:', error);
      throw error;
    }
  }
  
  throw new Error('Job timed out');
}
```

### Step 4: Complete Implementation
```javascript
async function respondWithAI() {
  try {
    // Show loading state
    showLoading('Generating AI response...');
    
    // Extract review data
    const reviewData = extractReviewData();
    
    // Get user mode preference (simple/pro)
    const mode = await getUserMode(); // Get from storage or UI
    
    // Create AI job
    const jobId = await createAIJob(reviewData, mode);
    if (!jobId) return;
    
    // Poll for completion
    const aiResponse = await pollJobStatus(jobId);
    
    // Insert response into the page
    insertResponse(aiResponse);
    
    // Hide loading
    hideLoading();
    
  } catch (error) {
    console.error('Error in respondWithAI:', error);
    showError('Failed to generate AI response. Please try again.');
    hideLoading();
  }
}
```

## Error Handling

### Common Error Scenarios
1. **Authentication Failed (401)**
   - Redirect user to login page
   - Clear stored tokens

2. **Insufficient Credits (402)**
   - Show credit purchase modal
   - Display remaining credits

3. **No Business Profile (404)**
   - Redirect to business profile setup
   - Show setup instructions

4. **Rate Limiting (429)**
   - Implement exponential backoff
   - Show "Please wait" message

5. **Network Errors**
   - Retry with exponential backoff
   - Show offline message

## UI Integration

### Loading States
```javascript
function showLoading(message) {
  // Show loading spinner with message
  document.body.insertAdjacentHTML('beforeend', `
    <div id="ai-loading" class="ai-loading-overlay">
      <div class="ai-loading-spinner"></div>
      <p>${message}</p>
    </div>
  `);
}

function hideLoading() {
  const loading = document.getElementById('ai-loading');
  if (loading) loading.remove();
}
```

### Response Insertion
```javascript
function insertResponse(response) {
  // Find the response textarea on the page
  const textarea = document.querySelector('textarea[name="response"], .response-textarea, #response');
  
  if (textarea) {
    textarea.value = response;
    textarea.focus();
    
    // Trigger change event for any listeners
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // Fallback: show in modal
    showResponseModal(response);
  }
}
```

## Testing Checklist

- [ ] Authentication flow works correctly
- [ ] Review data extraction works on different platforms
- [ ] Job creation succeeds with valid data
- [ ] Job polling completes successfully
- [ ] AI response is inserted correctly
- [ ] Error handling works for all scenarios
- [ ] Loading states display properly
- [ ] Credit management works correctly
- [ ] Rate limiting is handled gracefully

## Security Notes

1. **Never store JWT tokens in localStorage** - Use chrome.storage.local
2. **Validate all user inputs** before sending to API
3. **Sanitize review text** to prevent injection attacks
4. **Implement proper CORS handling** for cross-origin requests
5. **Use HTTPS only** in production

## Performance Considerations

1. **Implement request caching** for business profile data
2. **Use exponential backoff** for failed requests
3. **Limit polling frequency** to avoid API rate limits
4. **Cache job results** to avoid duplicate processing
5. **Implement request debouncing** for rapid button clicks
