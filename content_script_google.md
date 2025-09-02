// AI Review Responder - Google.com iframe detection and reply form enhancement
console.log('🚀 AI Review Responder content script loaded on:', window.location.href);

// Constants for iframe detection - Updated with broader patterns
const REVIEW_REPLY_URL_PATTERNS = [
  '/customers/reviews/reply',
  '/customers/review/reply',
  'review/reply',
  'reply',
  '/local/business',
  '/maps/contrib',
  'contrib',
  'google.com/maps',
  'google.com/local',
  'business.google.com'
];

// Function to check if URL matches any reply pattern
function isReviewReplyIframe(url: string): boolean {
  if (!url) return false;
  
  const lowerUrl = url.toLowerCase();
  
  // Check for reply patterns
  const hasReplyPattern = REVIEW_REPLY_URL_PATTERNS.some(pattern => 
    lowerUrl.includes(pattern.toLowerCase())
  );
  
  // Additional checks for Google review context
  const hasReviewContext = lowerUrl.includes('customers') && 
                          (lowerUrl.includes('review') || lowerUrl.includes('reply'));
  
  // Check for Google Maps/Business context
  const hasGoogleContext = lowerUrl.includes('google.com') && 
                          (lowerUrl.includes('maps') || lowerUrl.includes('business') || 
                           lowerUrl.includes('local') || lowerUrl.includes('contrib'));
  
  return hasReplyPattern || hasReviewContext || hasGoogleContext;
}
const isInIframe = window.self !== window.top;

// State management to prevent infinite loops and multiple processing
let isProcessingForm = false;
let lastProcessedFormId = '';
let processingTimeout: NodeJS.Timeout | null = null;
let enhancementCount = 0;

// Global state for message listeners and button management
let messageListenerSetup = false;
let isAIGenerationInProgress = false;
let reviewContextCache: any = null;
let reviewContextCacheTime = 0;

console.log('🔍 Context:', isInIframe ? 'iframe' : 'main page');

// Main page logic - Monitor for review reply iframes
if (!isInIframe) {
  console.log('📡 Setting up iframe monitoring on main page');
  initializeIframeMonitoring();
}

// Iframe logic - Check if this is a review reply iframe
if (isInIframe) {
  console.log('🎯 Running in iframe context');
  console.log('🔍 Iframe URL:', window.location.href);
  
  if (isReviewReplyIframe(window.location.href)) {
    console.log('✅ Detected review reply iframe by URL!');
    initializeReplyFormEnhancement();
  } else {
    console.log('ℹ️ Iframe detected but not a review reply iframe');
    console.log('🔍 Looking for review form elements anyway...');
    
    // Sometimes the URL pattern might not match but it's still a review form
    // Let's try to detect review forms by content with multiple retries
    console.log('🔄 Setting up enhanced form detection with retries...');
    
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 2000; // 2 seconds
    
    const retryFormDetection = () => {
      retryCount++;
      console.log(`🔍 Form detection attempt ${retryCount}/${maxRetries}`);
      
      if (hasReviewFormElements()) {
        console.log('✅ Found review form elements, initializing enhancement!');
        initializeReplyFormEnhancement();
      } else if (retryCount < maxRetries) {
        console.log(`⏳ No form found, retrying in ${retryDelay}ms...`);
        setTimeout(retryFormDetection, retryDelay);
      } else {
        console.log('❌ Max retries reached, no review form found');
      }
    };
    
    // Start with immediate check, then retry with delays
    setTimeout(retryFormDetection, 500);
  }
}

/**
 * Check if the current page has review form elements
 */
function hasReviewFormElements(): boolean {
  // Look for typical review form indicators
  const indicators = [
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[placeholder*="reply"]',
    '[placeholder*="response"]',
    '[placeholder*="respuesta"]',
    '[placeholder*="responder"]',
    '[aria-label*="reply"]',
    '[aria-label*="response"]',
    '[aria-label*="respuesta"]',
    '[aria-label*="responder"]',
    '[jsname]', // Google's internal attribute
    '.VfPpkd-fmcmS-wGMbrd', // Google Material Design textarea class
    '[maxlength="4000"]', // Common maxlength for review replies
    'button[jsname]', // Google buttons
    '.FkJOzc' // Google button container class
  ];
  
  for (const selector of indicators) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log('🔍 Found potential review form element:', selector, elements.length);
      // Log element details for debugging
      elements.forEach((el, index) => {
        if (index < 3) { // Only log first 3 elements to avoid spam
          console.log(`   Element ${index}:`, {
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            placeholder: el.getAttribute('placeholder'),
            ariaLabel: el.getAttribute('aria-label'),
            jsname: el.getAttribute('jsname')
          });
        }
      });
      return true;
    }
  }
  
  // Also check for text content that suggests this is a reply form
  const bodyText = document.body.textContent?.toLowerCase() || '';
  const hasReplyText = bodyText.includes('reply') || 
                      bodyText.includes('response') || 
                      bodyText.includes('comment');
  
  if (hasReplyText) {
    console.log('🔍 Found reply-related text content');
    return true;
  }
  
  return false;
}

/**
 * Initialize iframe monitoring on main Google pages
 */
function initializeIframeMonitoring() {
  console.log('🔭 Starting iframe monitoring...');
  
  // Monitor existing iframes
  checkExistingIframes();
  
  // Monitor for new iframes using MutationObserver
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          // Check if the added node is an iframe
          if (element.tagName === 'IFRAME') {
            handleNewIframe(element as HTMLIFrameElement);
          }
          
          // Check if the added node contains iframes
          const iframes = element.querySelectorAll('iframe');
          iframes.forEach(iframe => handleNewIframe(iframe));
        }
      });
    });
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('👁️ Iframe monitoring active');
}

/**
 * Check existing iframes on page load
 */
function checkExistingIframes() {
  const existingIframes = document.querySelectorAll('iframe');
  console.log(`🔍 Found ${existingIframes.length} existing iframes`);
  
  existingIframes.forEach(iframe => handleNewIframe(iframe));
}

/**
 * Handle detection of a new iframe
 */
function handleNewIframe(iframe: HTMLIFrameElement) {
  const src = iframe.src;
  console.log('🆕 New iframe detected:', src);
  
  if (src && isReviewReplyIframe(src)) {
    console.log('🎯 Review reply iframe detected!', src);
    
    // Notify background script about the detected iframe
    notifyBackgroundScript('REVIEW_REPLY_IFRAME_DETECTED', {
      src,
      id: iframe.id,
      timestamp: Date.now()
    });
    
    // Set up communication with the iframe
    setupIframeCommunication(iframe);
  }
}

/**
 * Set up cross-frame communication with review reply iframe
 */
function setupIframeCommunication(iframe: HTMLIFrameElement) {
  console.log('📡 Setting up iframe communication...');
  
  // Wait for iframe to load
  iframe.addEventListener('load', () => {
    console.log('✅ Review reply iframe loaded');
    
    try {
      // Send a ping message to the iframe to establish communication
      iframe.contentWindow?.postMessage({
        type: 'AI_REVIEW_RESPONDER_PING',
        source: 'main_page'
      }, '*');
    } catch (error) {
      console.error('❌ Cross-frame communication error:', error);
    }
  });
  
  // Listen for messages from the iframe (only set up once)
  if (!messageListenerSetup) {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.type?.startsWith('AI_REVIEW_RESPONDER_')) {
        console.log('📨 Message from iframe:', event.data);
        handleIframeMessage(event.data);
      }
    });
    messageListenerSetup = true;
    console.log('✅ Main page message listener set up');
  } else {
    console.log('⚠️ Message listener already set up, skipping...');
  }
}

/**
 * Handle messages from review reply iframes
 */
function handleIframeMessage(message: any) {
  switch (message.type) {
    case 'AI_REVIEW_RESPONDER_PONG':
      console.log('🏓 Iframe communication established');
      break;
      
    case 'AI_REVIEW_RESPONDER_FORM_READY':
      console.log('📝 Review form ready in iframe');
      notifyBackgroundScript('REVIEW_FORM_READY', message.data);
      break;
      
    case 'AI_REVIEW_RESPONDER_GENERATE_REQUEST':
      console.log('🤖 AI generation requested from iframe');
      // Check if this is a forwarded request from iframe
      if (message.source === 'iframe_forward') {
        console.log('📡 Handling forwarded AI request from iframe');
        handleAIGenerationRequest(message.data);
      } else {
        console.log('⚠️ Ignoring direct iframe message to prevent double processing');
      }
      break;
      
    default:
      console.log('❓ Unknown message type:', message.type);
  }
}

/**
 * Initialize review form enhancement within iframe
 */
function initializeReplyFormEnhancement() {
  console.log('🎨 Initializing reply form enhancement...');
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupReplyFormEnhancement();
    });
  } else {
    setupReplyFormEnhancement();
  }
}

/**
 * Set up the actual form enhancement within the iframe
 */
function setupReplyFormEnhancement() {
  console.log('🔧 Setting up form enhancement...');
  
  // Set up message handling for iframe (only if not already set up)
  if (!messageListenerSetup) {
    window.addEventListener('message', (event) => {
      if (!event.data?.type?.startsWith('AI_REVIEW_RESPONDER_')) return;
      
      switch (event.data.type) {
        case 'AI_REVIEW_RESPONDER_PING':
          console.log('🏓 Received ping from main page');
          event.source?.postMessage({
            type: 'AI_REVIEW_RESPONDER_PONG',
            source: 'iframe'
          }, '*');
          
          // Start form detection
          detectAndEnhanceReplyForm();
          break;
          
        case 'AI_REVIEW_RESPONDER_AI_RESPONSE':
          console.log('✨ Received AI response in iframe:', event.data.data);
          console.log('🎯 About to handle AI response...');
          handleAIResponse(event.data.data);
          break;
          
        case 'AI_REVIEW_RESPONDER_AI_ERROR':
          console.error('❌ AI generation error:', event.data.data);
          handleAIError(event.data.data);
          break;
          
        default:
          console.log('❓ Unknown iframe message:', event.data.type);
      }
    });
    messageListenerSetup = true;
    console.log('✅ Iframe message listener set up');
  } else {
    console.log('⚠️ Message listener already set up, skipping...');
  }
  
  // Set up content change monitoring for dynamic iframe updates
  setupContentChangeMonitoring();
}

/**
 * Monitor for content changes in the iframe (when switching between reviews)
 */
function setupContentChangeMonitoring() {
  console.log('👁️ Setting up content change monitoring...');
  
  let enhancementTimeout: NodeJS.Timeout;
  let changeCount = 0;
  const maxChanges = 3;
  
  const observer = new MutationObserver((mutations) => {
    // Prevent excessive processing
    changeCount++;
    if (changeCount > maxChanges) {
      console.log('⚠️ Maximum content changes processed, disconnecting observer');
      observer.disconnect();
      return;
    }
    
    // Only process if we haven't already processed a form
    if (lastProcessedFormId) {
      console.log('⚠️ Form already processed, ignoring content changes');
      return;
    }
    
    let significantChange = false;
    
    mutations.forEach((mutation) => {
      // Check if significant DOM changes occurred
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Check if new content includes Google's button containers or form elements
            if (element.querySelector('textarea[aria-label*="respuesta"], button[jsname]') || 
                element.matches('textarea[aria-label*="respuesta"], button[jsname]')) {
              significantChange = true;
            }
          }
        });
      }
    });
    
    // If significant change detected, re-enhance after a brief delay
    if (significantChange) {
      console.log('🔄 Significant content change detected, re-enhancing form...');
      
      // Clear any existing timeout
      if (enhancementTimeout) {
        clearTimeout(enhancementTimeout);
      }
      
      // Re-enhance after content settles
      enhancementTimeout = setTimeout(() => {
        detectAndEnhanceReplyForm();
      }, 1000); // Longer delay to let content settle
    }
  });
  
  // Start observing the entire document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });
  
  // Disconnect after 10 seconds to prevent long-running observers
  setTimeout(() => {
    observer.disconnect();
    console.log('⏰ Content monitoring timeout reached, disconnecting');
  }, 10000);
  
  console.log('✅ Content change monitoring active');
}

/**
 * Detect and enhance the review reply form
 */
function detectAndEnhanceReplyForm() {
  // Prevent concurrent processing
  if (isProcessingForm) {
    console.log('⚠️ Form processing already in progress, skipping...');
    return;
  }

  // Limit enhancement attempts to prevent infinite loops
  enhancementCount++;
  if (enhancementCount > 5) {
    console.log('⚠️ Maximum enhancement attempts reached, stopping to prevent infinite loop');
    return;
  }

  // Clear any pending processing
  if (processingTimeout) {
    clearTimeout(processingTimeout);
    processingTimeout = null;
  }

  // Debounce rapid calls
  processingTimeout = setTimeout(() => {
    performFormDetection();
  }, 200);
}

/**
 * Perform the actual form detection with state management
 */
function performFormDetection() {
  console.log('🔍 Searching for review reply form...');
  
  isProcessingForm = true;
  
  try {
    // First, extract and log the current review context (with caching)
    const reviewContext = extractReviewContext();
    
    // Create a unique identifier for this form context (simplified)
    const formId = `${reviewContext.reviewerName}-${reviewContext.rating}`;
    
    // Check if we've already processed this exact form
    if (lastProcessedFormId === formId) {
      console.log('⚠️ Form already processed for this review, skipping...');
      return;
    }
    
    // Clear review context cache if we're processing a new review
    if (lastProcessedFormId && lastProcessedFormId !== formId) {
      reviewContextCache = null;
      reviewContextCacheTime = 0;
      console.log('🔄 New review detected, cleared context cache');
    }
    
    console.log('🎯 Processing review from:', reviewContext.reviewerName, `(${reviewContext.rating} stars)`);
    
    // Look for common textarea/input patterns in Google's reply forms
    const selectors = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '[role="textbox"]'
    ];
    
    let foundAndEnhanced = false;
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (isReplyTextarea(element as HTMLElement)) {
          console.log('✅ Found reply textarea:', element);
          enhanceReplyTextarea(element as HTMLElement);
          foundAndEnhanced = true;
          lastProcessedFormId = formId; // Mark this form as processed
        }
      });
    }
    
    // If form not found immediately and we haven't processed anything yet, observe for dynamic loading
    if (!foundAndEnhanced && !lastProcessedFormId) {
      console.log('❌ No reply form found, will observe for dynamic loading...');
      observeForReplyForm();
    }
    
  } finally {
    isProcessingForm = false;
  }
}

/**
 * Check if element is likely a reply textarea
 */
function isReplyTextarea(element: HTMLElement): boolean {
  const text = element.textContent?.toLowerCase() || '';
  const placeholder = element.getAttribute('placeholder')?.toLowerCase() || '';
  const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
  
  const indicators = [text, placeholder, ariaLabel].join(' ');
  
  return indicators.includes('reply') || 
         indicators.includes('response') || 
         indicators.includes('comment') ||
         element.tagName === 'TEXTAREA';
}

/**
 * Enhance the reply textarea with AI button
 */
function enhanceReplyTextarea(textarea: HTMLElement) {
  // Avoid duplicate enhancement
  if (textarea.classList.contains('ai-responder-enhanced')) {
    return;
  }
  
  console.log('🎨 Enhancing reply textarea with AI button');
  textarea.classList.add('ai-responder-enhanced');
  
  // Create AI response button
  const aiButton = createAIResponseButton();
  
  // Insert button near the textarea
  insertAIButton(textarea, aiButton);
  
  // Set up button functionality
  setupAIButtonHandler(aiButton, textarea);
  
  // Notify main page that form is ready
  window.parent.postMessage({
    type: 'AI_REVIEW_RESPONDER_FORM_READY',
    data: {
      formDetected: true,
      timestamp: Date.now()
    }
  }, '*');
}

/**
 * Create the AI response button (styled to match Google's Material Design)
 */
function createAIResponseButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ai-response-btn VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ VfPpkd-LgbsSe-OWXEXe-dgl2Hf nCP5yc AjY5Oe DuMIQc LQeN7 FwaX8';
  
  // Create button structure similar to Google's buttons
  button.innerHTML = `
    <div class="VfPpkd-Jh9lGc"></div>
    <div class="VfPpkd-J1Ukfc-LhBDec"></div>
    <div class="VfPpkd-RLmnJb"></div>
    <span class="VfPpkd-vQzf8d">🤖 Generar respuesta IA</span>
  `;
  
  // Add Google Material Design button styles
  button.style.cssText = `
    background: linear-gradient(135deg, #4285f4, #34a853) !important;
    color: white !important;
    border: none !important;
    border-radius: 4px !important;
    padding: 10px 16px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    margin: 0 8px 0 0 !important;
    transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
    box-shadow: 0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15) !important;
    min-height: 36px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    position: relative !important;
    overflow: hidden !important;
  `;
  
  // Add Material Design ripple effect and hover states
  button.addEventListener('mouseenter', () => {
    button.style.boxShadow = '0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15) !important';
    button.style.transform = 'translateY(-1px)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15) !important';
    button.style.transform = 'translateY(0)';
  });
  
  button.addEventListener('mousedown', () => {
    button.style.transform = 'translateY(0)';
  });
  
  button.addEventListener('mouseup', () => {
    button.style.transform = 'translateY(-1px)';
  });
  
  return button;
}

/**
 * Insert AI button in the Google button container
 */
function insertAIButton(textarea: HTMLElement, button: HTMLElement) {
  // First, try to find Google's specific button container
  const googleButtonContainer = document.querySelector('.FkJOzc.lgfhc.LW6Hp');
  
  if (googleButtonContainer) {
    console.log('✅ Found Google button container, inserting AI button');
    // Insert our button as the first child (before "Omitir" and "Responder" buttons)
    googleButtonContainer.insertBefore(button, googleButtonContainer.firstChild);
    return;
  }
  
  // Fallback: look for any button container with Google's button classes
  const buttonContainers = document.querySelectorAll('div[class*="VfPpkd"], div[jsaction*="click"], div[jscontroller]');
  for (const container of buttonContainers) {
    const hasResponderButton = container.textContent?.includes('Responder') || 
                              container.querySelector('button[jsname="hrGhad"]');
    if (hasResponderButton) {
      console.log('✅ Found button container with Responder button');
      container.insertBefore(button, container.firstChild);
      return;
    }
  }
  
  // Second fallback: try to find the best insertion point near textarea
  const parent = textarea.parentElement;
  if (parent) {
    // Look for button containers in parent hierarchy
    let currentElement = parent;
    for (let i = 0; i < 5; i++) { // Check up to 5 levels up
      const buttonContainer = currentElement.querySelector('div[class*="button"], div[class*="action"], div[jsaction]');
      if (buttonContainer) {
        console.log('✅ Found button container in parent hierarchy');
        buttonContainer.insertBefore(button, buttonContainer.firstChild);
        return;
      }
      if (currentElement.parentElement) {
        currentElement = currentElement.parentElement;
      } else {
        break;
      }
    }
    
    // Final fallback: insert after textarea
    if (textarea.nextSibling) {
      parent.insertBefore(button, textarea.nextSibling);
    } else {
      parent.appendChild(button);
    }
  }
}

/**
 * Set up AI button click handler
 */
function setupAIButtonHandler(button: HTMLElement, textarea: HTMLElement) {
  // Prevent multiple event listeners on the same button
  if (button.dataset.listenerAdded === 'true') {
    console.log('⚠️ Button already has event listener, skipping...');
    return;
  }
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Prevent double-clicks and global state check
    if (button.hasAttribute('disabled') || isAIGenerationInProgress) {
      console.log('⚠️ Button is disabled or AI generation in progress, ignoring click');
      return;
    }
    
    console.log('🤖 AI response generation requested');
    
    // Set global state to prevent multiple generations
    isAIGenerationInProgress = true;
    
    // Immediately disable button to prevent double clicks
    button.setAttribute('disabled', 'true');
    button.style.opacity = '0.6';
    
    // Extract review context
    const reviewContext = extractReviewContext();
    console.log('📋 Generating AI response for:');
    console.log(`   👤 Reviewer: ${reviewContext.reviewerName}`);
    console.log(`   ⭐ Rating: ${reviewContext.rating}/5 stars`);
    console.log(`   📝 Review: "${reviewContext.reviewText}"`);
    console.log(`   🏢 Business: ${reviewContext.businessName}`);
    
    // Send generation request to main page
    window.parent.postMessage({
      type: 'AI_REVIEW_RESPONDER_GENERATE_REQUEST',
      data: {
        reviewContext,
        textareaId: textarea.id || 'main-textarea',
        timestamp: Date.now()
      },
      source: 'iframe_forward'  // Add the required source field
    }, '*');
    
    // Update button state
    const buttonText = button.querySelector('.VfPpkd-vQzf8d');
    if (buttonText) {
      buttonText.textContent = '⏳ Generando...';
    }
  });
  
  // Mark button as having an event listener
  button.dataset.listenerAdded = 'true';
}

/**
 * Extract review context from the iframe with enhanced text analysis and caching
 */
function extractReviewContext() {
  // Check if we have a recent cached result (within 5 seconds)
  const now = Date.now();
  if (reviewContextCache && (now - reviewContextCacheTime < 5000)) {
    console.log('📋 Using cached review context to avoid re-extraction');
    return reviewContextCache;
  }
  
  console.log('📋 Extracting review context from iframe...');
  
  // Extract reviewer name
  let reviewerName = 'Unknown Reviewer';
  const nameElement = document.querySelector('#AH1dze > div > div > main > div > div > c-wiz > div > div > article > div.noyJyc > div > div > div.N0c6q.JhRJje');
  if (nameElement) {
    reviewerName = nameElement.textContent?.trim() || 'Unknown Reviewer';
    console.log('👤 Reviewer Name:', reviewerName);
  } else {
    console.log('❌ Could not find reviewer name element');
  }
  
  // Extract review content
  let reviewText = '';
  const reviewElement = document.querySelector('#TBiyHc > div.gyKkFe.JhRJje.Fv38Af');
  if (reviewElement) {
    reviewText = reviewElement.textContent?.trim() || '';
    console.log('📝 Review Content:', reviewText);
  } else {
    console.log('❌ Could not find review content element');
  }
  
  // Extract star rating
  let rating = 5; // Default to 5 stars
  const ratingElement = document.querySelector('span.DYizzd[aria-label]');
  if (ratingElement) {
    const ariaLabel = ratingElement.getAttribute('aria-label') || '';
    console.log('⭐ Rating aria-label:', ariaLabel);
    
    // Extract rating from aria-label (e.g., "5 de 5 estrellas" -> 5)
    const ratingMatch = ariaLabel.match(/(\d+)\s+de\s+(\d+)/);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1], 10);
      console.log('⭐ Extracted Rating:', rating);
    } else {
      console.log('❌ Could not parse rating from aria-label');
    }
  } else {
    console.log('❌ Could not find rating element');
  }
  
  // Try to extract business name from page context
  let businessName = 'Unknown Business';
  const businessElements = document.querySelectorAll('h1, h2, h3, [data-business-name], .business-name');
  for (const element of businessElements) {
    const text = element.textContent?.trim();
    if (text && text.length > 2 && text.length < 100) {
      businessName = text;
      break;
    }
  }
  console.log('🏢 Business Name:', businessName);
  
  // Analyze review text to determine if it has meaningful content
  const hasText = analyzeReviewText(reviewText);
  
  const reviewContext = {
    reviewerName,
    rating,
    reviewText,
    businessName,
    hasText
  };
  
  console.log('📊 Complete Review Context:', reviewContext);
  console.log(`🔍 Text Analysis: "${reviewText}" → hasText: ${hasText}`);
  
  // Cache the result to avoid repeated extractions
  reviewContextCache = reviewContext;
  reviewContextCacheTime = Date.now();
  
  return reviewContext;
}

/**
 * Analyze review text to determine if it has meaningful content
 */
function analyzeReviewText(reviewText: string): boolean {
  if (!reviewText || typeof reviewText !== 'string') {
    return false;
  }

  const cleanText = reviewText.trim();
  const textLength = cleanText.length;

  // Minimum length check
  if (textLength < 10) {
    return false;
  }

  // Generic patterns that don't count as meaningful
  const genericPatterns = [
    /^\.+$/,                    // Just dots
    /^[!@#$%^&*()_+\-=\[\]{}|;':"\\|,.<>\/?]+$/, // Just symbols
    /^(good|great|ok|fine|nice)\.?$/i,  // Single generic words
    /^(thanks?|thank you)\.?$/i, // Just thanks
    /^\d+$/, // Just numbers
    /^[a-z]\s*$/i, // Single character
  ];

  if (genericPatterns.some(pattern => pattern.test(cleanText.toLowerCase()))) {
    return false;
  }

  // Words that indicate meaningful content
  const meaningfulIndicators = [
    'service', 'staff', 'food', 'experience', 'recommend', 'quality', 'price',
    'location', 'atmosphere', 'friendly', 'helpful', 'clean', 'fast', 'slow',
    'delicious', 'terrible', 'excellent', 'good', 'bad', 'amazing', 'awful',
    'love', 'hate', 'disappointed', 'satisfied', 'impressed', 'surprised'
  ];

  const lowerText = cleanText.toLowerCase();
  const meaningfulWords = meaningfulIndicators.filter(indicator => 
    lowerText.includes(indicator)
  ).length;

  return meaningfulWords > 0 && textLength >= 10;
}

/**
 * Observe for dynamically loaded reply forms
 */
function observeForReplyForm() {
  console.log('👁️ Observing for dynamic reply form...');
  
  let observerCallCount = 0;
  const maxObserverCalls = 3;
  
  const observer = new MutationObserver(() => {
    observerCallCount++;
    
    if (observerCallCount > maxObserverCalls) {
      console.log('⚠️ Maximum observer calls reached, disconnecting to prevent infinite loop');
      observer.disconnect();
      return;
    }
    
    // Only call if we haven't already processed a form
    if (!lastProcessedFormId) {
      detectAndEnhanceReplyForm();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Stop observing after 5 seconds to avoid performance issues
  setTimeout(() => {
    observer.disconnect();
    console.log('⏰ Observer timeout reached, disconnecting');
  }, 5000);
}

/**
 * Handle AI generation request from iframe
 */
async function handleAIGenerationRequest(data: any) {
  console.log('🚀 Processing AI generation request:', data);
  
  try {
    // Check if we're in the main page context (not iframe)
    const isMainPage = window.self === window.top;
    
    if (isMainPage) {
      // We're in the main page, can use chrome.runtime directly
      const response = await new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'GENERATE_AI_RESPONSE',
            data,
            url: window.location.href,
            timestamp: Date.now()
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        } else {
          reject(new Error('Chrome runtime not available in main page'));
        }
      });
      
      console.log('📨 AI generation response:', response);
      
      // Send response back to iframe - try multiple selectors
      console.log('🔍 Looking for target iframe to send response...');
      
      // Try different iframe selectors
      let targetWindow = null;
      const selectors = [
        'iframe[src*="/customers/reviews/reply"]',
        'iframe[src*="/local/business/"]',
        'iframe[src*="google.com"]'
      ];
      
      for (const selector of selectors) {
        const iframe = document.querySelector(selector) as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          console.log(`✅ Found iframe with selector: ${selector}`);
          console.log(`📍 Iframe src: ${iframe.src}`);
          targetWindow = iframe.contentWindow;
          break;
        }
      }
      
      if (!targetWindow) {
        // Fallback: find any iframe that might be the review iframe
        const allIframes = document.querySelectorAll('iframe');
        console.log(`🔍 Found ${allIframes.length} iframes, checking each...`);
        
        for (const iframe of allIframes) {
          console.log(`📍 Iframe src: ${iframe.src}`);
          if (iframe.src.includes('google.com') && iframe.contentWindow) {
            console.log('✅ Using Google iframe as fallback');
            targetWindow = iframe.contentWindow;
            break;
          }
        }
      }
      
      if (targetWindow) {
        console.log('📤 Sending AI response to iframe...');
        targetWindow.postMessage({
          type: 'AI_REVIEW_RESPONDER_AI_RESPONSE',
          data: response
        }, '*');
      } else {
        console.error('❌ No target iframe found to send response to');
      }
    } else {
      // We're in an iframe, need to forward through the main page
      console.log('📡 Forwarding AI request through main page...');
      
      // Send request to main page to handle
      window.parent.postMessage({
        type: 'AI_REVIEW_RESPONDER_GENERATE_REQUEST',
        data,
        source: 'iframe_forward'
      }, '*');
    }
    
  } catch (error) {
    console.error('❌ AI generation failed:', error);
    
    // Send error back to iframe
    const targetWindow = document.querySelector('iframe[src*="/customers/reviews/reply"]')?.contentWindow;
    if (targetWindow) {
      targetWindow.postMessage({
        type: 'AI_REVIEW_RESPONDER_AI_ERROR',
        data: { error: error instanceof Error ? error.message : 'AI generation failed' }
      }, '*');
    }
  }
}

/**
 * Notify background script of events
 */
function notifyBackgroundScript(type: string, data: any = {}) {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type,
      data,
      url: window.location.href,
      timestamp: Date.now()
    }).catch((error) => {
      console.warn('Failed to notify background script:', error);
    });
  }
}

/**
 * Handle successful AI response
 */
function handleAIResponse(responseData: any) {
  console.log('📝 Inserting AI response into textarea...');
  console.log('📊 Response data:', responseData);
  
  if (responseData.status === 'success' && responseData.aiResponse) {
    console.log('✅ Response is successful, looking for textarea...');
    
    // Find the textarea that was enhanced
    const enhancedTextarea = document.querySelector('.ai-responder-enhanced') as HTMLTextAreaElement | HTMLInputElement;
    const aiButton = document.querySelector('.ai-response-btn') as HTMLButtonElement;
    
    console.log('🔍 Enhanced textarea found:', !!enhancedTextarea);
    console.log('🔍 AI button found:', !!aiButton);
    
    if (enhancedTextarea) {
      console.log('📍 Textarea details:', {
        tagName: enhancedTextarea.tagName,
        id: enhancedTextarea.id,
        className: enhancedTextarea.className,
        isContentEditable: enhancedTextarea.isContentEditable
      });
      
      console.log('💬 AI Response to insert:', responseData.aiResponse);
      
      // Insert the AI response
      if (enhancedTextarea.tagName === 'TEXTAREA' || enhancedTextarea.tagName === 'INPUT') {
        console.log('📝 Setting textarea value...');
        enhancedTextarea.value = responseData.aiResponse;
      } else if (enhancedTextarea.isContentEditable) {
        console.log('📝 Setting contentEditable textContent...');
        enhancedTextarea.textContent = responseData.aiResponse;
      }
      
      // Trigger input events to notify Google's form
      console.log('⚡ Triggering input events...');
      enhancedTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      enhancedTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('✅ AI response inserted successfully');
    } else {
      console.error('❌ Enhanced textarea not found!');
      
      // Try to find any textarea as fallback
      const anyTextarea = document.querySelector('textarea') as HTMLTextAreaElement;
      if (anyTextarea) {
        console.log('🔄 Found fallback textarea:', anyTextarea.id || anyTextarea.className);
        anyTextarea.value = responseData.aiResponse;
        anyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Used fallback textarea');
      } else {
        console.error('❌ No textarea found at all!');
      }
    }
    
    // Reset button state and global AI generation flag
    if (aiButton) {
      const buttonText = aiButton.querySelector('.VfPpkd-vQzf8d');
      if (buttonText) {
        buttonText.textContent = '✨ ¡Generado!';
      }
      aiButton.removeAttribute('disabled');
      aiButton.style.opacity = '1';
      
      // Reset to original text after a few seconds
      setTimeout(() => {
        if (buttonText) {
          buttonText.textContent = '🤖 Generar respuesta IA';
        }
        // Re-enable button after success
        aiButton.removeAttribute('disabled');
        aiButton.style.opacity = '1';
      }, 2000);
    }
    
    // Reset global AI generation state
    isAIGenerationInProgress = false;
    console.log('✅ AI generation completed, global state reset');
    
    // Show success notification
    showNotification('AI response generated successfully!', 'success');
    
  } else {
    handleAIError({ error: responseData.error || 'Unknown error' });
  }
}

/**
 * Handle AI generation error
 */
function handleAIError(errorData: any) {
  console.error('❌ AI generation failed:', errorData);
  
  const aiButton = document.querySelector('.ai-response-btn') as HTMLButtonElement;
  
  // Reset button state and global AI generation flag
  if (aiButton) {
    const buttonText = aiButton.querySelector('.VfPpkd-vQzf8d');
    if (buttonText) {
      buttonText.textContent = '❌ Error';
    }
    aiButton.removeAttribute('disabled');
    aiButton.style.opacity = '1';
    
    // Reset to original text after a few seconds
    setTimeout(() => {
      if (buttonText) {
        buttonText.textContent = '🤖 Generar respuesta IA';
      }
    }, 3000);
  }
  
  // Reset global AI generation state
  isAIGenerationInProgress = false;
  console.log('❌ AI generation failed, global state reset');
  
  // Show error notification
  const errorMessage = errorData.error || 'AI generation failed';
  showNotification(errorMessage, 'error');
}

/**
 * Show notification to user
 */
function showNotification(message: string, type: 'success' | 'error' = 'success') {
  // Remove existing notifications
  const existingNotification = document.querySelector('.ai-responder-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'ai-responder-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : '#f44336'};
    color: white;
    padding: 12px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  // Insert notification
  document.body.appendChild(notification);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

console.log('✅ AI Review Responder content script initialized');