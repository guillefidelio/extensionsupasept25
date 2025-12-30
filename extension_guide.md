# Chrome Extension Technical Guide

## Overview
This document serves as the single source of truth for building a Chrome Extension that integrates with our BoltReply.io backend. The extension will handle user authentication, data synchronization, and AI job management.

## 1. Authentication Flow

### Required Supabase Keys


### Step-by-Step Login Process
1. **Initialize Supabase Client**
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   ```

2. **Handle User Login**
   ```typescript
   const { data, error } = await supabase.auth.signInWithPassword({
     email: userEmail,
     password: userPassword
   });
   
   if (error) {
     throw new Error(`Login failed: ${error.message}`);
   }
   ```

3. **Capture JWT Token**
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   const jwt = session?.access_token;
   
   if (!jwt) {
     throw new Error('No authentication token received');
   }
   ```

4. **Store JWT Securely**
   ```typescript
   await chrome.storage.local.set({
     'auth_token': jwt,
     'user_id': session?.user?.id,
     'token_expires_at': session?.expires_at
   });
   ```

### Login Form Implementation
The extension should provide a simple login form with:
- **Email Input**: User's registered email address
- **Password Input**: User's password
- **Login Button**: Submit credentials to Supabase
- **Error Display**: Show login errors clearly
- **Loading State**: Indicate when authentication is in progress

### JWT Storage and Refresh
- **Storage**: Use `chrome.storage.local` for JWT storage
- **Refresh**: Supabase automatically handles token refresh
- **Security**: Never store JWT in plain text or localStorage
- **Expiration**: Check token expiration before API calls
- **Credentials**: Never store username/password locally

## 2. API Interaction Rules

### Base URL
```
Production: https://your-domain.com/api/v1
Development: http://localhost:3000/api/v1
```

### Communication Rules
- **Extension → API Only**: The extension communicates exclusively with our API endpoints
- **No Direct Database Access**: Never connect directly to Supabase database
- **JWT Required**: All API calls must include valid JWT in Authorization header
- **Rate Limiting**: Respect API rate limits and implement exponential backoff

### Authenticated Request Example
```typescript
async function makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}) {
  const { auth_token } = await chrome.storage.local.get(['auth_token']);
  
  if (!auth_token) {
    throw new Error('No authentication token found');
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth_token}`,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  return response.json();
}
```

## 3. Core API Endpoints

### Authentication & User Data
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/me/session-data` | **Primary endpoint** - Fetch all initial user data (business profile, preferences, prompts) |
| GET | `/api/v1/me/business-profile` | Get user's business profile |
| GET | `/api/v1/me/prompts` | Get user's custom prompts |
| PUT | `/api/v1/me/business-profile` | Update business profile |

**Note**: `/api/v1/me/session-data` is the primary endpoint for the extension's initial data load, as it efficiently bundles everything together in a single request.

### AI Job Management
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/jobs` | Create a new AI generation job |
| GET | `/api/v1/jobs/:id` | Poll for job status and results |
| GET | `/api/v1/jobs` | Get user's job history |

### Job Status Values
- `pending`: Job is queued for processing
- `processing`: Job is currently being processed
- `completed`: Job finished successfully
- `failed`: Job encountered an error

## 3.5. Extension Core Functionality

### Content Script: Reading Review Websites
The extension uses a content script to automatically detect and extract review information:

```typescript
// content-script.ts
function extractReviewData(): ReviewData | null {
  // Detect common review site patterns
  const reviewText = document.querySelector('.review-text, .review-content, [data-review]')?.textContent;
  const rating = document.querySelector('.rating, .stars, [data-rating]')?.getAttribute('data-rating');
  const reviewerName = document.querySelector('.reviewer-name, .author, [data-author]')?.textContent;
  
  if (reviewText && rating) {
    return {
      review_text: reviewText.trim(),
      review_rating: parseInt(rating),
      reviewer_name: reviewerName?.trim() || 'Anonymous',
      website_url: window.location.href
    };
  }
  
  return null;
}

// Listen for page changes (SPA support)
const observer = new MutationObserver(() => {
  const reviewData = extractReviewData();
  if (reviewData) {
    chrome.runtime.sendMessage({ type: 'REVIEW_DETECTED', data: reviewData });
  }
});
```

### Popup Interface: Complete User Flow
The extension popup provides a seamless experience:

1. **Login State**: Show login form if not authenticated
2. **Data Collection**: Display extracted review data for user verification
3. **Mode Selection**: Simple/Pro mode toggle
4. **Generate Button**: Send job to backend
5. **Progress Display**: Show job status and progress
6. **Result Display**: Present AI-generated response with insert button

### Background Script: Orchestrating the Process
The background script coordinates all operations:

```typescript
// background.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REVIEW_DETECTED') {
    // Store review data for popup access
    chrome.storage.local.set({ 'current_review': message.data });
    
    // Update extension icon to show review is available
    chrome.action.setBadgeText({ text: '1' });
  }
  
  if (message.type === 'GENERATE_RESPONSE') {
    // Create job and start polling
    createAndPollJob(message.data);
  }
  
  if (message.type === 'INSERT_RESPONSE') {
    // Send message to content script to insert response
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'INSERT_AI_RESPONSE',
      response: message.response
    });
  }
});
```

### Content Script: Auto-Insertion into Review Textarea
The content script automatically inserts the AI-generated response:

```typescript
// content-script.ts - Response insertion
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INSERT_AI_RESPONSE') {
    // Find the review response textarea
    const responseTextarea = document.querySelector(
      'textarea[name="response"], textarea[placeholder*="response"], .response-textarea, [data-response-field]'
    );
    
    if (responseTextarea) {
      // Insert the AI response
      responseTextarea.value = message.response;
      
      // Trigger change event for form validation
      responseTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      responseTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Show success feedback
      showInsertionSuccess();
    } else {
      // Fallback: show response in popup for manual insertion
      showResponseInPopup(message.response);
    }
  }
});

function showInsertionSuccess() {
  // Create temporary success notification
  const notification = document.createElement('div');
  notification.textContent = '✅ AI response inserted successfully!';
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; 
    background: #10b981; color: white; padding: 12px 20px;
    border-radius: 8px; z-index: 10000; font-family: Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => notification.remove(), 3000);
}
```

## 4. Data Payloads

### Complete User Experience Flow
The extension provides a seamless end-to-end experience:

1. **User visits review website** → Content script automatically detects review
2. **Extension icon shows badge** → Indicates review is available
3. **User clicks extension** → Popup opens with extracted review data
4. **User verifies data** → Can edit reviewer name, rating, or review text
5. **User selects mode** → Simple or Pro mode
6. **User clicks generate** → Extension sends job to backend
7. **Extension shows progress** → Real-time status updates
8. **Result displayed** → AI-generated response with insert button
9. **Response auto-inserted** → AI response automatically appears in the website's review response textarea

This flow ensures the user never has to manually type, copy, or paste review information, making the process completely automated and error-free.

### Architecture Decision: Server-Side Business Profile Fetching
The extension is designed to be **simple and lightweight**. When creating a job, the extension only sends the review-specific information. The API server automatically:

1. **Extracts the user ID** from the JWT token
2. **Fetches the business profile** from the database
3. **Combines the data** for AI processing
4. **Returns the complete job** with all necessary context

This approach ensures:
- **Extension simplicity**: No need to cache or manage business profile data
- **Data consistency**: Always uses the latest business profile from the database
- **Security**: Business profile access is controlled server-side
- **Performance**: Extension payloads are minimal and fast

### POST /api/v1/jobs - Create AI Generation Job
```json
{
  "job_type": "ai_generation",
  "payload": {
    "review_text": "The food was amazing and the service was excellent!",
    "review_rating": 5,
    "reviewer_name": "John Smith",
    "mode": "simple" // or "pro"
  }
}
```

**Important**: The extension does NOT send the business profile. The API server automatically fetches the user's business profile using the JWT token, making the extension simpler and more reliable.

### Response Structure
```json
{
  "id": "job-uuid-here",
  "status": "pending",
  "created_at": "2025-01-28T10:00:00Z",
  "job_type": "ai_generation",
  "payload": { /* original payload */ }
}
```

## 5. Job Polling Strategy

### Polling Implementation
1. **Create Job**: POST to `/api/v1/jobs`
2. **Start Polling**: Check job status every 2-3 seconds
3. **Handle Results**: Process completed jobs, retry failed ones
4. **Stop Polling**: When status is `completed` or `failed`

### Example Polling Logic
```typescript
async function pollJobStatus(jobId: string): Promise<any> {
  const maxAttempts = 30; // 90 seconds max
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const job = await makeAuthenticatedRequest(`/jobs/${jobId}`);
    
    if (job.status === 'completed') {
      return job.result;
    }
    
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 3000));
    attempts++;
  }
  
  throw new Error('Job polling timeout');
}
```

**Future Optimization**: Consider implementing exponential backoff (waiting longer between each polling attempt) for production use, but the current linear approach is perfect for initial development and testing.

## 6. Error Handling

### Common Error Scenarios
- **401 Unauthorized**: JWT expired or invalid
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server-side issue
- **Network Errors**: Connection issues

### Error Recovery
- **JWT Expired**: Refresh token and retry request
- **Rate Limited**: Implement exponential backoff
- **Server Error**: Retry with increasing delays
- **Network Issues**: Show offline message and retry when connected

## 7. Data Synchronization

### Simplified Architecture: Server-Side Data Management
The extension follows a **minimal storage approach** since the API server handles all business logic and data fetching. The extension's main responsibility is managing authentication and user input.

### Initial Data Load
1. **On Extension Install**: No initial data fetch needed
2. **On Login**: Store JWT token only
3. **On Popup Open**: No data sync required

### No Background Sync Required
- **Business Profile**: Server fetches fresh data for every job
- **User Preferences**: Stored server-side, no local caching needed
- **Prompts**: Retrieved from server when needed
- **Offline Support**: Extension works with cached JWT for basic functionality

### Minimal Storage Structure
```typescript
interface ExtensionStorage {
  auth_token: string;
  user_id: string;
  token_expires_at: number;
}
```

**Note**: The extension only stores authentication data. All business data is fetched fresh from the server for each job, ensuring data consistency and eliminating sync complexity.

## 8. Security Considerations

### Data Protection
- **JWT Storage**: Use chrome.storage.local (encrypted)
- **API Communication**: Always use HTTPS
- **Input Validation**: Validate all user inputs
- **Rate Limiting**: Respect API limits

### Privacy
- **Data Minimization**: Only store necessary data
- **User Consent**: Clear privacy policy
- **Data Deletion**: Allow users to clear extension data
- **Audit Logging**: Log security-relevant events

## 9. Testing Strategy

### Development Testing
- **Local API**: Test against localhost development server
- **Mock Data**: Use sample business profiles and reviews
- **Error Simulation**: Test various error scenarios
- **Performance Testing**: Verify polling and sync performance

### Production Testing
- **Staging Environment**: Test against staging API
- **User Acceptance**: Beta testing with real users
- **Performance Monitoring**: Track API response times
- **Error Tracking**: Monitor and log production errors

## 10. Deployment Checklist

### Extension Build
- [ ] Manifest v3 configuration
- [ ] Content security policy
- [ ] Permissions properly configured
- [ ] Icons and assets included

### API Integration
- [ ] Production API endpoints configured
- [ ] JWT handling tested
- [ ] Error handling implemented
- [ ] Rate limiting respected

### User Experience
- [ ] Offline functionality working
- [ ] Data sync working properly
- [ ] Error messages user-friendly
- [ ] Performance optimized

---

This guide provides the foundation for building a robust Chrome Extension that seamlessly integrates with your BoltReply.io backend. Follow these patterns to ensure consistency, security, and maintainability.
