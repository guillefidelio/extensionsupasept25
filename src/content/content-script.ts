// AI Review Responder - Main Page Content Script
// This script runs ONLY on the main Google page (not in iframes)
// The iframe injection is handled automatically by manifest.json

(() => {
  // Verify we're on the main page (not in an iframe)
  if (window === window.top) {

    // Listen for messages from iframe scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

      switch (message.type) {
        case 'IFRAME_READY':
          break;

        case 'REPLY_GENERATED':
          // Handle reply generation (update usage counters, etc.)
          break;
      }

      sendResponse({ success: true });
    });

  } else {
    console.error('❌ Error: Main content script should not run in iframes');
  }
})();

// Main content script ends here - iframe injection is handled by manifest.json
