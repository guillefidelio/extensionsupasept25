// AI Review Responder - Main Page Content Script
// This script runs ONLY on the main Google page (not in iframes)
// The iframe injection is handled automatically by manifest.json

(() => {
  console.log('🚀 AI Review Responder loaded on main page');
  console.log('📍 Main page URL:', window.location.href);

  // Verify we're on the main page (not in an iframe)
  if (window === window.top) {
    console.log('✅ Confirmed: Running on main page');

    // Listen for messages from iframe scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Message from iframe:', message);

      switch (message.type) {
        case 'IFRAME_READY':
          console.log('🎯 Iframe script ready:', message.data);
          break;

        case 'REPLY_GENERATED':
          console.log('🤖 AI reply generated:', message.data);
          // Handle reply generation (update usage counters, etc.)
          break;

        default:
          console.log('Unknown message type:', message.type);
      }

      sendResponse({ success: true });
    });

  } else {
    console.error('❌ Error: Main content script should not run in iframes');
  }
})();

// Main content script ends here - iframe injection is handled by manifest.json
