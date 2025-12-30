# Chrome Extension Audit Report

## 1. Manifest & Permissions Review

### 🔴 Critical Issues
- **Unused Permissions**: The following permissions are listed in `manifest.json` but not used in the codebase:
  - `scripting`: No usage of `chrome.scripting` found.
  - `identity`: No usage of `chrome.identity` found (Auth is handled via Supabase/Fetch).
  *Recommendation*: Remove these to minimize the permission warning shown to users and improve security score.

- **Overly Broad Web Accessible Resources**:
  ```json
  "web_accessible_resources": [
    {
      "matches": ["<all_urls>"]
    }
  ]
  ```
  *Risk*: This allows any website to detect your extension and potentially load its assets.
  *Recommendation*: Change `["<all_urls>"]` to `["https://www.google.com/*"]` to match your target host permissions.

### ⚠️ Warnings
- **Host Permissions**: `https://www.google.com/*` is very broad.
  *Observation*: While necessary for Google My Business, the Web Store review team might ask for justification. Ensure your description explains why you need access to all of Google.com, or restrict it to `https://www.google.com/maps/*`, `https://www.google.com/search/*`, and `https://www.google.com/local/*` if possible.

## 2. Security Audit

### 🔴 Critical Issues
- **Hardcoded Secrets**: `src/config.ts` contains what appear to be real Supabase keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) as default values.
  *Risk*: While Supabase Anon keys are technically "public safe" if Row Level Security (RLS) is correctly configured on the backend, hardcoding them as defaults in source code is bad practice.
  *Recommendation*: Ensure your backend RLS policies are strict. Consider using build-time environment variables to inject these values rather than hardcoding defaults.

- **innerHTML Usage**: `src/content/iframe-script.ts` uses `innerHTML` to create the button UI (lines ~645).
  *Risk*: While currently injecting static strings, `innerHTML` is often flagged by automated security scanners (CWS warnings).
  *Recommendation*: Refactor to use `document.createElement()`, `element.classList.add()`, and `element.appendChild()` for absolute safety and compliance.

## 3. Code Quality & Performance

### ⚠️ Warnings
- **Excessive Console Logging**: The codebase is full of `console.log` statements (e.g., "🚀 Generating AI response directly...", "📍 Iframe URL:", etc.).
  *Impact*: This pollutes the user's console and can impact performance.
  *Recommendation*: Remove console logs or wrap them in a debug flag/conditional for the production build.

- **Brittle DOM Selectors**: The content script (`src/content/iframe-script.ts`) relies heavily on specific Google class names and IDs (e.g., `jsname="YPqjbf"`, `#AH1dze`).
  *Risk*: Google frequently changes these obfuscated class names. Your extension will likely break when Google updates their UI.
  *Recommendation*: There is no easy fix for this without an official API, but be prepared to update the extension frequently. Consider adding more robust fallback selectors or checking for ARIA labels where possible.

- **Deprecated Code**: `src/utils/api.ts` contains several deprecated functions (`pollJobStatus`, `createJob`, etc.) that just throw errors.
  *Recommendation*: Clean up this file by removing unused/deprecated code to reduce bundle size and confusion.

## 4. Build Configuration
- **Chunking**: `webpack.config.js` is correctly configured with `splitChunks: false` and `runtimeChunk: false`. This complies with the single-file output requirement.

## 5. Summary of Recommended Actions

1.  **Edit `src/manifest.json`**:
    - Remove `"scripting"` and `"identity"` from `permissions`.
    - Update `web_accessible_resources` matches to `["https://www.google.com/*"]`.
2.  **Cleanup Code**:
    - Remove `console.log` statements.
    - Remove deprecated functions in `src/utils/api.ts`.
3.  **Security Hardening**:
    - Verify Supabase RLS.
    - Refactor `innerHTML` in `src/content/iframe-script.ts`.

**Ready to Publish?**
**No.** You should address the Critical Issues in the Manifest and Security sections before submitting to the Chrome Web Store to avoid rejection.


