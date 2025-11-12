## Relevant Files

- `src/utils/api.ts` - Main API utility file that handles all API calls (primary file to update for new endpoint)
- `src/background/service-worker.ts` - Background script that likely contains API calls and polling logic
- `src/content/content-script.ts` - Content script that may contain API calls
- `src/popup/popup.tsx` - Main popup component that handles UI and API integration
- `src/popup/popup.css` - Popup styles that may need updates for credit display
- `src/types/index.ts` - Type definitions that may need updates for new API response structure
- `src/utils/auth.ts` - Authentication utilities that handle tokens
- `src/config.ts` - Configuration file that may contain API endpoints

### Notes

- Unit tests should be created for each modified file to ensure the new API integration works correctly
- Use `npm run build` to compile TypeScript to JavaScript before testing
- Test in Chrome DevTools with the extension loaded to verify API calls and responses
- Monitor browser console for any errors during the migration

## Tasks

- [ ] 1.0 Update API calls to use new direct /api/v1/ai/generate endpoint instead of job creation
  - [ ] 1.1 Replace POST /api/v1/jobs with POST /api/v1/ai/generate in api.ts
  - [ ] 1.2 Update request payload structure to match new API (review_text, mode, review_rating, custom_prompt)
  - [ ] 1.3 Update response handling to work with immediate responses instead of job IDs
  - [ ] 1.4 Remove job ID generation and tracking code
  - [ ] 1.5 Update API call in service-worker.ts if it contains job-related logic
  - [ ] 1.6 Update API call in content-script.ts if it contains job-related logic

- [ ] 2.0 Remove all polling logic and job status checking code
  - [ ] 2.1 Remove pollJobStatus function from api.ts
  - [ ] 2.2 Remove job status checking intervals and timeouts
  - [ ] 2.3 Remove job status UI indicators from popup.tsx
  - [ ] 2.4 Remove job-related state management from components
  - [ ] 2.5 Clean up any job status checking in background scripts
  - [ ] 2.6 Remove job status display logic from popup components

- [ ] 3.0 Update error handling for new response structure and error types
  - [ ] 3.1 Add handling for 402 (insufficient credits) error responses
  - [ ] 3.2 Add handling for 400 (validation errors) with specific error messages
  - [ ] 3.3 Add handling for 401 (authentication errors) with login redirect
  - [ ] 3.4 Add handling for 500 (server errors) with retry logic
  - [ ] 3.5 Update generic error handling to work with new response structure
  - [ ] 3.6 Add credit balance checking and display logic

- [ ] 4.0 Update UI components to remove polling indicators and add credit display
  - [ ] 4.1 Remove polling progress bars and status messages from popup.tsx
  - [ ] 4.2 Update loading states to show "Generating response..." instead of polling messages
  - [ ] 4.3 Add credit balance display component to show credits_remaining
  - [ ] 4.4 Add processing time display (processing_time_ms) for user feedback
  - [ ] 4.5 Update success messages to include credit usage information
  - [ ] 4.6 Add insufficient credits warning UI with upgrade prompts

- [ ] 5.0 Test all scenarios and deploy the updated extension
  - [ ] 5.1 Test simple mode generation with review_text and review_rating
  - [ ] 5.2 Test pro mode generation with custom_prompt
  - [ ] 5.3 Test error handling for insufficient credits (402)
  - [ ] 5.4 Test error handling for validation errors (400)
  - [ ] 5.5 Test error handling for authentication errors (401)
  - [ ] 5.6 Test error handling for server errors (500)
  - [ ] 5.7 Test edge cases: very long reviews, special characters, network timeouts
  - [ ] 5.8 Build extension with `npm run build` and test in Chrome DevTools
  - [ ] 5.9 Deploy updated extension to Chrome Web Store
  - [ ] 5.10 Monitor API response times and success/failure rates post-deployment
