# Chrome Extension Migration: From Polling Jobs to Direct AI API

## 🎯 Migration Overview

We've completely redesigned our backend architecture to eliminate the inefficient polling system. The Chrome extension needs to be updated to use the new direct AI processing API instead of the old job creation + polling system.

## 🔄 Architecture Change

### **OLD SYSTEM (Remove This):**
```
Extension → POST /api/v1/jobs → Poll job status → Get result
```

### **NEW SYSTEM (Implement This):**
```
Extension → POST /api/v1/ai/generate → Immediate response
```

## 📋 Required Changes

### **1. API Endpoint Change**

#### **OLD Endpoint (Remove):**
```javascript
// OLD - Don't use this anymore
const response = await fetch(`${API_BASE}/api/v1/jobs`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    job_type: 'ai_generation',
    payload: {
      review_text: reviewText,
      review_rating: rating,
      mode: mode,
      custom_prompt: customPrompt
    }
  })
});
```

#### **NEW Endpoint (Use This):**
```javascript
// NEW - Use this direct API
const response = await fetch(`${API_BASE}/api/v1/ai/generate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    review_text: reviewText,        // Required: string
    review_rating: rating,          // Optional: number (1-5)
    mode: mode,                     // Required: 'simple' | 'pro'
    custom_prompt: customPrompt     // Optional: string (required for pro mode)
  })
});
```

### **2. Request Payload Structure**

#### **Required Fields:**
- `review_text` (string): The customer review text to respond to
- `mode` (string): Either "simple" or "pro"

#### **Optional Fields:**
- `review_rating` (number): Star rating from 1-5
- `custom_prompt` (string): Required if mode is "pro"

#### **Example Payloads:**

**Simple Mode:**
```json
{
  "review_text": "Great service, loved the food!",
  "review_rating": 5,
  "mode": "simple"
}
```

**Pro Mode:**
```json
{
  "review_text": "Food was cold and service was slow",
  "review_rating": 2,
  "mode": "pro",
  "custom_prompt": "Respond professionally, acknowledge the issue, and offer a solution..."
}
```

### **3. Response Structure**

#### **Success Response:**
```json
{
  "success": true,
  "generated_response": "Thank you for your feedback! We're delighted to hear...",
  "confidence_score": 0.95,
  "tokens_used": 150,
  "prompt_tokens": 75,
  "completion_tokens": 75,
  "processing_time_ms": 2500,
  "model_used": "gpt-4o-mini",
  "credits_used": 1,
  "credits_remaining": 49
}
```

#### **Error Responses:**

**Insufficient Credits (402):**
```json
{
  "success": false,
  "error": "Insufficient credits",
  "credits_available": 0,
  "credits_required": 1
}
```

**Validation Error (400):**
```json
{
  "success": false,
  "error": "review_text is required and must be a string"
}
```

**Authentication Error (401):**
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

**Server Error (500):**
```json
{
  "success": false,
  "error": "AI processing failed",
  "processing_time_ms": 1200
}
```

### **4. Remove Polling Logic**

#### **OLD Polling Code (Remove All This):**
```javascript
// Remove all polling-related code like this:
const pollJobStatus = async (jobId) => {
  const maxAttempts = 60;
  const pollInterval = 2000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${API_BASE}/api/v1/jobs/${jobId}`);
    const data = await response.json();
    
    if (data.status === 'completed') {
      return data.result;
    } else if (data.status === 'failed') {
      throw new Error(data.error);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error('Job timeout');
};
```

#### **NEW Direct Processing (Use This):**
```javascript
// Simple direct API call - no polling needed
const generateAIResponse = async (reviewData) => {
  try {
    const response = await fetch(`${API_BASE}/api/v1/ai/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reviewData)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    if (!data.success) {
      throw new Error(data.error || 'AI generation failed');
    }

    return data.generated_response;
  } catch (error) {
    console.error('AI generation error:', error);
    throw error;
  }
};
```

### **5. Error Handling Updates**

#### **Handle New Error Types:**
```javascript
const handleAPIError = (error, data) => {
  if (error.status === 402) {
    // Insufficient credits
    showError(`Insufficient credits. You have ${data.credits_available} credits remaining.`);
    // Maybe redirect to upgrade page
  } else if (error.status === 400) {
    // Validation error
    showError(`Invalid request: ${data.error}`);
  } else if (error.status === 401) {
    // Authentication error
    showError('Please log in again');
    // Redirect to login
  } else {
    // Generic error
    showError(data.error || 'Something went wrong');
  }
};
```

### **6. UI Updates**

#### **Loading States:**
- **OLD:** "Processing... (checking job status)"
- **NEW:** "Generating response..." (much faster)

#### **Progress Indicators:**
- **Remove:** Job status polling progress bars
- **Add:** Simple loading spinner (response comes in 2-10 seconds)

#### **Success Messages:**
- **Add:** Show credits remaining after successful generation
- **Add:** Show processing time for user feedback

### **7. Files to Modify**

#### **Likely Files (adjust based on your structure):**

**manifest.json:**
- No changes needed (same permissions)

**background.js or service-worker.js:**
- Update API endpoint URLs
- Remove polling logic
- Update error handling

**content-script.js:**
- Update API calls if any
- Remove job status checking

**popup.js or popup.html:**
- Update UI for immediate responses
- Remove polling progress indicators
- Add credit balance display

**api.js or similar:**
- Replace job creation + polling with direct API call
- Update error handling for new response structure

### **8. Testing Checklist**

#### **Test Cases:**
1. **Simple Mode Generation:**
   - Send review with rating
   - Verify immediate response
   - Check credits are deducted

2. **Pro Mode Generation:**
   - Send review with custom prompt
   - Verify custom prompt is used
   - Check response quality

3. **Error Handling:**
   - Test with insufficient credits
   - Test with invalid review text
   - Test with expired token

4. **Edge Cases:**
   - Very long review text
   - Special characters in review
   - Network timeout scenarios

### **9. Performance Improvements**

#### **Expected Improvements:**
- **Response Time:** 2-10 seconds (vs 10-30 seconds with polling)
- **Reliability:** Direct response (no polling failures)
- **User Experience:** Immediate feedback, no waiting

#### **Metrics to Track:**
- API response times
- Success/failure rates
- Credit consumption
- User satisfaction

### **10. Migration Strategy**

#### **Phase 1: Update API Calls**
1. Replace job creation with direct API calls
2. Remove all polling logic
3. Update error handling

#### **Phase 2: Update UI**
1. Remove job status indicators
2. Add credit balance display
3. Update loading messages

#### **Phase 3: Test & Deploy**
1. Test all scenarios thoroughly
2. Deploy to Chrome Web Store
3. Monitor for issues

## 🚨 Critical Notes

### **Authentication:**
- Same JWT token authentication
- Same Authorization header format
- Token still expires and needs refresh

### **Rate Limiting:**
- API has built-in rate limiting
- Handle 429 responses gracefully
- Show appropriate user messages

### **Credits System:**
- Each AI generation costs 1 credit
- Longer reviews might cost 2 credits
- Check credits_remaining in response
- Handle insufficient credits gracefully

### **CORS:**
- API is configured for Chrome extension requests
- No changes needed to extension permissions

## 🎯 Success Criteria

After migration, the extension should:
1. ✅ Generate AI responses in 2-10 seconds (vs 10-30 seconds)
2. ✅ Show immediate feedback to users
3. ✅ Handle all error cases gracefully
4. ✅ Display credit balance and usage
5. ✅ Work with both Simple and Pro modes
6. ✅ Have no polling or job status checking code

## 📞 Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Verify the API endpoint is responding correctly
3. Test authentication token validity
4. Check network requests in DevTools

The new API is much simpler and more reliable than the old polling system!