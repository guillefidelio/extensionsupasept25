// AI Review Responder - Dynamic Iframe Script
// This script runs ONLY in Google Business review iframes (automatically injected by manifest.json)
// URL pattern: https://www.google.com/local/business/*/customers/reviews*

(() => {
  console.log('🎯 AI Review Responder iframe script loaded');
  console.log('📍 Iframe URL:', window.location.href);

  // Global state for dynamic injection system
  let lastKnownUrl = window.location.href;
  let mutationObserver: MutationObserver | null = null;
  let urlCheckInterval: number | null = null;
  let injectedButtons: Set<HTMLElement> = new Set();
  let buttonObserver: MutationObserver | null = null; // Track button removal
  let debounceTimer: number | null = null;
  let lastInjectionTime = 0;
  let isInjecting = false; // Prevent concurrent injections
  const INJECTION_DEBOUNCE_MS = 1000; // Prevent rapid re-injection
  const URL_CHECK_INTERVAL_MS = 500;

  // Notify parent frame that iframe script is ready
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'IFRAME_READY',
      data: {
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    }, '*');
  }

  // Listen for messages from background script (for progress updates, etc.)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Message from background script:', message);

    switch (message.type) {
      case 'AI_RESPONSE_RESULT':
        handleAIResponseResult(message.data);
        break;

      case 'PROGRESS_UPDATE':
        handleProgressUpdate(message.data);
        break;

      default:
        console.log('Unknown message type from background:', message.type);
    }

    sendResponse({ success: true });
  });

  // Determine if this is a single review reply iframe or multi-review iframe
  const currentUrl = window.location.href;
  const hasCustomersReviews = currentUrl.includes('/customers/reviews');
  const isSingleReviewReply = currentUrl.includes('/customers/reviews/reply');

  console.log('🔍 URL Analysis:', {
    fullUrl: currentUrl,
    hasCustomersReviews: hasCustomersReviews,
    isSingleReviewReply: isSingleReviewReply,
    pattern: hasCustomersReviews ? (isSingleReviewReply ? 'SINGLE_REVIEW_REPLY' : 'MULTI_REVIEW_VIEW') : 'UNKNOWN'
  });

  if (hasCustomersReviews) {
    console.log('🚀 Initializing Dynamic AI Button Injection System');
    initializeDynamicInjectionSystem();
  } else {
    console.log('🚫 This iframe does not match Google Business review patterns');
    console.log('🔍 Iframe URL:', currentUrl);
  }

  // ==================== DYNAMIC INJECTION SYSTEM ====================

  function initializeDynamicInjectionSystem() {
    console.log('🚀 Initializing Dynamic AI Button Injection System');

    // Set up content change detection
    setupContentChangeDetection();

    // Set up DOM mutation monitoring
    setupMutationObserver();

    // Initial scan for existing textareas
    console.log('🔍 Performing initial textarea scan');
    debouncedInjectAIButtons();

    // Set up button removal observer
    setupButtonObserver();

    console.log('✅ Dynamic injection system initialized');
    console.log('📊 System Status:', {
      urlMonitoring: 'ACTIVE',
      mutationObserver: 'ACTIVE',
      buttonObserver: 'ACTIVE',
      injectedButtons: injectedButtons.size,
      lastInjectionTime: new Date(lastInjectionTime).toISOString()
    });
  }

  function setupContentChangeDetection() {
    console.log('🔄 Setting up iframe content change detection');

    urlCheckInterval = window.setInterval(() => {
      const currentUrl = window.location.href;

      if (currentUrl !== lastKnownUrl) {
        console.log('🔄 Iframe URL changed:', {
          from: lastKnownUrl,
          to: currentUrl,
          timestamp: new Date().toISOString()
        });

        lastKnownUrl = currentUrl;
        handleContentChange();
      }
    }, URL_CHECK_INTERVAL_MS);

    console.log('✅ URL change detection active');
  }

  function setupMutationObserver() {
    console.log('👁️ Setting up MutationObserver for DOM changes');

    mutationObserver = new MutationObserver((mutations) => {
      let shouldTriggerScan = false;
      let relevantChanges: string[] = [];

      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check for our specific textarea (jsname="YPqjbf") being added or removed
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.matches('[jsname="YPqjbf"]') ||
                  element.querySelector('[jsname="YPqjbf"]')) {
                shouldTriggerScan = true;
                relevantChanges.push('textarea_added');
                console.log('📝 Specific textarea (YPqjbf) added to DOM');
              }
            }
          });

          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.matches('[jsname="YPqjbf"]') ||
                  element.querySelector('[jsname="YPqjbf"]')) {
                shouldTriggerScan = true;
                relevantChanges.push('textarea_removed');
                console.log('🗑️ Specific textarea (YPqjbf) removed from DOM');
              }
            }
          });

          // Also check for significant structural changes that might affect our textarea
          if (!shouldTriggerScan && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            // Look for changes in form containers or review-related elements
            const hasStructuralChanges = Array.from(mutation.addedNodes).some(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                return element.matches('form, .modal, .dialog, .review-reply-container, .reply-form') ||
                       element.querySelector('form, .modal, .dialog, .review-reply-container, .reply-form');
              }
              return false;
            });

            if (hasStructuralChanges) {
              shouldTriggerScan = true;
              relevantChanges.push('structural_change');
              console.log('🏗️ Structural changes detected that may affect textarea');
            }
          }
        } else if (mutation.type === 'attributes') {
          // Check if our specific textarea's attributes changed
          if (mutation.target.nodeType === Node.ELEMENT_NODE) {
            const element = mutation.target as Element;
            if (element.matches('[jsname="YPqjbf"]') &&
                ['id', 'class', 'placeholder', 'jsname'].includes(mutation.attributeName || '')) {
              shouldTriggerScan = true;
              relevantChanges.push('textarea_attribute_changed');
              console.log('🔄 Specific textarea attributes changed');
            }
          }
        }
      });

      if (shouldTriggerScan) {
        console.log('🔄 Relevant DOM changes detected:', {
          changes: relevantChanges,
          timestamp: new Date().toISOString()
        });
        handleTextareaChanges();
      }
    });

    // Start observing with more targeted configuration
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'class', 'placeholder', 'jsname']
    });

    console.log('✅ MutationObserver active - monitoring for specific textarea changes');
  }

  function setupButtonObserver() {
    console.log('👁️ Setting up Button Observer for removal tracking');

    buttonObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.classList.contains('ai-review-button')) {
                console.log('🗑️ Button removed from DOM, updating tracking');
                injectedButtons.delete(element as HTMLElement);
              }
              // Also check for buttons inside removed containers
              const removedButtons = element.querySelectorAll('.ai-review-button');
              removedButtons.forEach(button => {
                console.log('🗑️ Button in removed container, updating tracking');
                injectedButtons.delete(button as HTMLElement);
              });
            }
          });
        }
      });
    });

    // Observe the entire document for button removal
    buttonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('✅ Button Observer active - tracking button removal');
  }

  function handleContentChange() {
    console.log('🔄 Handling iframe content change');
    console.log('🧹 Cleaning up existing buttons due to content change');

    cleanupOrphanedButtons();

    // Don't trigger injection immediately - let the MutationObserver handle it
    // when the new textarea appears in the DOM
    console.log('👁️ Waiting for MutationObserver to detect new textarea...');
  }

  function handleTextareaChanges() {
    console.log('🔄 Handling textarea DOM changes');
    debouncedInjectAIButtons();
  }

  function debouncedInjectAIButtons() {
    const now = Date.now();
    const timeSinceLastInjection = now - lastInjectionTime;

    // Clear any existing timer first
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      console.log('🔄 Cleared existing debounce timer');
    }

    if (timeSinceLastInjection < INJECTION_DEBOUNCE_MS) {
      const remainingTime = INJECTION_DEBOUNCE_MS - timeSinceLastInjection;

      debounceTimer = window.setTimeout(() => {
        console.log('⏳ Debounce timer expired, performing injection');
        performInjection();
        debounceTimer = null;
      }, remainingTime);

      console.log(`⏳ Debouncing injection (will execute in ${remainingTime}ms)`);
    } else {
      console.log('⚡ Performing immediate injection (debounce period passed)');
      performInjection();
    }
  }

  function performInjection() {
    // Prevent concurrent injections
    if (isInjecting) {
      console.log('⏳ Injection already in progress, skipping duplicate attempt');
      return;
    }

    isInjecting = true;
    console.log('🎯 Performing AI button injection');
    lastInjectionTime = Date.now();

    try {
      // Clean up orphaned buttons first
      cleanupOrphanedButtons();

      // Find all textareas that need enhancement
      const textareas = findAllReplyTextareas();

      if (textareas.length > 0) {
        console.log(`✅ Found ${textareas.length} textarea(s) for enhancement`);

        let successfulInjections = 0;
        let skippedInjections = 0;

        textareas.forEach((textarea, index) => {
          const existingButton = findExistingButtonForTextarea(textarea);
          if (existingButton) {
            console.log(`⏭️ Skipping injection for textarea ${index + 1} - button already exists`);
            skippedInjections++;
          } else {
            const success = injectAIButtonForTextarea(textarea, index);
            if (success) {
              successfulInjections++;
            }
          }
        });

        console.log('📊 Injection summary:', {
          found: textareas.length,
          successful: successfulInjections,
          skipped: skippedInjections,
          totalButtons: injectedButtons.size
        });
      } else {
        console.log('⚠️ No eligible textareas found for enhancement');
      }

      console.log('📊 Injection complete - Current status:', {
        injectedButtons: injectedButtons.size,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Always reset the flag
      isInjecting = false;
    }
  }

  function findAllReplyTextareas(): HTMLTextAreaElement[] {
    console.log('🔍 Scanning for reply textareas using specific selector');

    // Use only the specific Google selector provided by the user
    const specificSelector = '[jsname="YPqjbf"]';
    const foundTextareas: HTMLTextAreaElement[] = [];

    try {
      const element = document.querySelector(specificSelector) as HTMLTextAreaElement;

      if (element && (element.tagName === 'TEXTAREA' || element.hasAttribute('contenteditable'))) {
        // Verify this is actually a reply textarea and not already processed
        if (isLikelyReplyTextarea(element) && !hasAssociatedButton(element)) {
          foundTextareas.push(element);
          console.log(`✅ Found reply textarea: ${specificSelector}`, {
            id: element.id,
            className: element.className,
            jsname: element.getAttribute('jsname'),
            placeholder: (element as HTMLTextAreaElement | HTMLInputElement).placeholder || element.getAttribute('data-placeholder'),
            isContentEditable: element.hasAttribute('contenteditable')
          });
        } else if (hasAssociatedButton(element)) {
          console.log(`⏭️ Textarea already has associated button, skipping:`, {
            id: element.id,
            jsname: element.getAttribute('jsname')
          });
        }
      } else {
        console.log('⚠️ No textarea found with jsname="YPqjbf"');
      }
    } catch (error) {
      console.warn(`⚠️ Error with selector ${specificSelector}:`, error);
    }

    console.log(`📊 Found ${foundTextareas.length} eligible textarea(s) for enhancement`);
    return foundTextareas;
  }

  function isLikelyReplyTextarea(element: HTMLElement): boolean {
    // Since we're using the specific jsname="YPqjbf" selector, we can be more lenient
    // but still verify it's actually a reply-related textarea

    // Check if it's a textarea or contenteditable
    if (element.tagName !== 'TEXTAREA' && !element.hasAttribute('contenteditable')) {
      return false;
    }

    // Check if it has the specific jsname attribute we expect
    if (element.getAttribute('jsname') !== 'YPqjbf') {
      return false;
    }

    // Additional validation for reply-related context
    const placeholder = (element as HTMLTextAreaElement | HTMLInputElement).placeholder || element.getAttribute('data-placeholder') || '';
    const keywords = ['reply', 'respond', 'comment', 'response'];

    const hasReplyKeyword = keywords.some(keyword =>
      placeholder.toLowerCase().includes(keyword)
    );

    // Check if element is in a form context (Google Business reviews are typically in forms)
    const isInForm = element.closest('form') !== null;

    // Since we found it with the specific selector, it's likely valid, but let's be thorough
    return hasReplyKeyword || isInForm || element.getAttribute('jsname') === 'YPqjbf';
  }

  function hasAssociatedButton(textarea: HTMLElement): boolean {
    // Check if there's already a button for this specific textarea (by jsname)
    const jsname = textarea.getAttribute('jsname');
    const textareaId = textarea.id;

    if (jsname) {
      // Check all buttons associated with this jsname
      const allButtons = document.querySelectorAll('.ai-review-button');
      for (const button of allButtons) {
        const buttonJsname = button.getAttribute('data-associated-jsname');
        if (buttonJsname === jsname) {
          console.log(`🔗 Found existing button for jsname:`, jsname);
          return true;
        }
      }
    }

    // Also check if there's a button in the same container
    const container = textarea.closest('form, .modal, .dialog, .review-reply-container') || textarea.parentElement;
    if (container) {
      const nearbyButton = container.querySelector('.ai-review-button');
      if (nearbyButton) {
        console.log(`🔗 Found nearby button in container for textarea:`, textareaId || jsname);
        return true;
      }
    }

    return false;
  }

  function cleanupOrphanedButtons() {
    console.log('🧹 Cleaning up orphaned AI buttons');

    const existingButtons = document.querySelectorAll('.ai-review-button');
    let cleanedCount = 0;

    existingButtons.forEach(button => {
      const associatedJsname = button.getAttribute('data-associated-jsname');
      const injectionTimestamp = button.getAttribute('data-injection-timestamp');

      // Check if the associated textarea still exists
      let textareaExists = false;
      if (associatedJsname) {
        const textarea = document.querySelector(`[jsname="${associatedJsname}"]`);
        textareaExists = textarea !== null && document.contains(textarea);
      }

      // If textarea doesn't exist, always remove the button
      if (!textareaExists) {
        console.log(`🗑️ Removing orphaned button for jsname:`, associatedJsname);
        if (button.parentNode) {
          button.remove();
        }
        injectedButtons.delete(button as HTMLElement);
        cleanedCount++;
      }
      // Only remove old buttons if they're really old (>10 minutes) to avoid removing active buttons
      else if (injectionTimestamp) {
        const buttonAge = Date.now() - parseInt(injectionTimestamp);
        const isVeryOldButton = buttonAge > 10 * 60 * 1000; // 10 minutes

        if (isVeryOldButton) {
          console.log(`🗑️ Removing very old button (${Math.round(buttonAge / 1000 / 60)}min old) for jsname:`, associatedJsname);
          button.remove();
          injectedButtons.delete(button as HTMLElement);
          cleanedCount++;
        }
      }
    });

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} orphaned/old button(s)`);
    } else {
      console.log('✅ No orphaned buttons found');
    }
  }

  function findAssociatedTextarea(button: Element): HTMLElement | null {
    console.log('🔍 Looking for associated textarea...');

    // First, try to find the specific textarea with jsname="YPqjbf" (Google's reply textarea)
    const googleReplyTextarea = document.querySelector('textarea[jsname="YPqjbf"]') ||
                               document.querySelector('[jsname="YPqjbf"]');
    if (googleReplyTextarea) {
      console.log('✅ Found Google reply textarea with jsname="YPqjbf":', googleReplyTextarea);
      return googleReplyTextarea as HTMLElement;
    }

    // Fallback: Try to find textarea in the same container or nearby
    const container = button.parentElement;
    if (container) {
      const textarea = container.querySelector('textarea') ||
                      container.querySelector('[contenteditable="true"]');
      if (textarea) {
        console.log('✅ Found textarea in same container:', textarea);
        return textarea as HTMLElement;
      }
    }

    // Look for textarea before the button's container
    const previousTextarea = button.parentElement?.previousElementSibling?.querySelector('textarea') ||
                           button.parentElement?.previousElementSibling?.querySelector('[contenteditable="true"]');
    if (previousTextarea) {
      console.log('✅ Found textarea in previous sibling:', previousTextarea);
      return previousTextarea as HTMLElement;
    }

    // Last resort: look for any textarea on the page
    const anyTextarea = document.querySelector('textarea');
    if (anyTextarea) {
      console.log('⚠️ Found any textarea as fallback:', anyTextarea);
      return anyTextarea as HTMLElement;
    }

    console.log('❌ No textarea found');
    return null;
  }

  function injectAIButtonForTextarea(textarea: HTMLElement, index: number): boolean {
    // Check if we already have a button for this textarea
    const existingButton = findExistingButtonForTextarea(textarea);

    if (existingButton) {
      console.log(`⏭️ Button already exists for textarea ${index + 1}, skipping injection`);
      return false;
    }

    console.log(`🎯 Injecting AI button for textarea ${index + 1}:`, {
      jsname: textarea.getAttribute('jsname'),
      id: textarea.id,
      className: textarea.className
    });

    try {
      const button = createAIButton(textarea);
      const injectionPoint = findBestInjectionPoint(textarea);

      if (injectionPoint) {
        injectButtonAtPoint(button, injectionPoint, textarea);
        injectedButtons.add(button);
        console.log(`✅ AI button successfully injected for textarea ${index + 1}`);
        return true;
      } else {
        console.warn(`⚠️ No suitable injection point found for textarea ${index + 1}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to inject button for textarea ${index + 1}:`, error);
      return false;
    }
  }

  function findExistingButtonForTextarea(textarea: HTMLElement): HTMLElement | null {
    // Comprehensive search for existing buttons associated with this textarea

    // Method 1: Check by associated textarea ID in button attributes
    const textareaId = textarea.id || textarea.getAttribute('jsname') || 'anonymous-textarea';
    const allButtons = document.querySelectorAll('.ai-review-button');

    for (const button of allButtons) {
      const buttonTextareaId = button.getAttribute('data-associated-textarea');
      if (buttonTextareaId === textareaId && injectedButtons.has(button as HTMLElement)) {
        console.log(`🔍 Found existing button by ID association:`, textareaId);
        return button as HTMLElement;
      }
    }

    // Method 2: Check in the same container hierarchy
    const containerSelectors = [
      '.review-reply-container',
      '.reply-form',
      'form',
      '.modal',
      '.dialog',
      '.review-item',
      '.comment-form'
    ];

    for (const selector of containerSelectors) {
      const container = textarea.closest(selector);
      if (container) {
        const button = container.querySelector('.ai-review-button') as HTMLElement;
        if (button && injectedButtons.has(button)) {
          console.log(`🔍 Found existing button in container:`, selector);
          return button;
        }
      }
    }

    // Method 3: Check parent elements (up to 3 levels)
    let currentElement: HTMLElement | null = textarea;
    for (let i = 0; i < 3 && currentElement; i++) {
      const button = currentElement.querySelector('.ai-review-button') as HTMLElement;
      if (button && injectedButtons.has(button)) {
        console.log(`🔍 Found existing button in parent element (level ${i + 1})`);
        return button;
      }
      currentElement = currentElement.parentElement;
    }

    console.log(`🔍 No existing button found for textarea:`, textareaId);
    return null;
  }

  function createAIButton(textarea: HTMLElement): HTMLElement {
    const button = document.createElement('button');
    button.textContent = '🤖 Generate AI Reply';
    button.className = 'ai-review-button VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ VfPpkd-LgbsSe-OWXEXe-dgl2Hf nCP5yc AjY5Oe DuMIQc LQeN7 FwaX8';
    button.setAttribute('data-textarea-id', textarea.id || 'textarea-' + Date.now());

    button.style.cssText = `
      margin: 0 8px 0 0;
      padding: 8px 16px;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-weight: 500;
      transition: background-color 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    `;

    // Add hover effects
    button.onmouseover = () => button.style.backgroundColor = '#1557b0';
    button.onmouseout = () => button.style.backgroundColor = '#1a73e8';

    // Add click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      generateAIReply(textarea);
    });

    // Add Google-like inner structure
    button.innerHTML = `
      <div class="VfPpkd-Jh9lGc"></div>
      <div class="VfPpkd-J1Ukfc-LhBDec"></div>
      <div class="VfPpkd-RLmnJb"></div>
      <span jsname="V67aGc" class="VfPpkd-vQzf8d">🤖 Generate AI Reply</span>
    `;

    return button;
  }

  function findBestInjectionPoint(textarea: HTMLElement): { container: HTMLElement; reference: HTMLElement | null } | null {
    // Strategy 1: Look for Google-specific button container
    const googleContainer = document.querySelector('div.FkJOzc.lgfhc.LW6Hp') as HTMLElement;
    if (googleContainer) {
      const skipButton = googleContainer.querySelector('button[jsname="dmDvRc"]') as HTMLElement;
      if (skipButton) {
        console.log('🎯 Found Google button container with Skip button');
        return { container: googleContainer, reference: skipButton };
      }
      // Use any button in the container
      const anyButton = googleContainer.querySelector('button') as HTMLElement;
      if (anyButton) {
        console.log('🎯 Found Google button container with alternative button');
        return { container: googleContainer, reference: anyButton };
      }
    }

    // Strategy 2: Find form buttons container
    const form = textarea.closest('form');
    if (form) {
      const buttonContainer = form.querySelector('.button-container, .form-actions, .actions') as HTMLElement;
      if (buttonContainer) {
        console.log('🎯 Found form button container');
        return { container: buttonContainer, reference: buttonContainer.firstElementChild as HTMLElement };
      }
    }

    // Strategy 3: Insert next to textarea
    if (textarea.parentElement) {
      console.log('🎯 Using textarea parent as injection point');
      return { container: textarea.parentElement, reference: textarea.nextElementSibling as HTMLElement };
    }

    console.warn('⚠️ No suitable injection point found');
    return null;
  }

  function injectButtonAtPoint(button: HTMLElement, injectionPoint: { container: HTMLElement; reference: HTMLElement | null }, textarea: HTMLElement) {
    if (injectionPoint.reference) {
      // Insert before reference element
      injectionPoint.container.insertBefore(button, injectionPoint.reference);
      console.log('🚀 Button injected before reference element');
    } else {
      // Append to container
      injectionPoint.container.appendChild(button);
      console.log('🚀 Button appended to container');
    }

    // Mark button as injected for this textarea using jsname for better identification
    const textareaIdentifier = textarea.getAttribute('jsname') || textarea.id || 'anonymous-textarea';
    button.setAttribute('data-associated-textarea', textareaIdentifier);
    button.setAttribute('data-associated-jsname', textarea.getAttribute('jsname') || '');
    button.setAttribute('data-injection-timestamp', Date.now().toString());

    console.log(`🏷️ Button associated with textarea:`, textareaIdentifier);
  }

  // ==================== LEGACY FUNCTIONS (KEPT FOR COMPATIBILITY) ====================

  function initializeReplyFormEnhancement() {
    console.log('🎨 Legacy reply form enhancement (redirecting to dynamic system)');
    initializeDynamicInjectionSystem();
  }

  function enhanceReplyForm(replyTextarea: HTMLElement) {
    console.log('🎨 Legacy form enhancement called - using dynamic system');
    // This function is now handled by the dynamic injection system
    // Just trigger a scan for this specific textarea
    debouncedInjectAIButtons();
  }

  function insertAIButton(container: HTMLElement, referenceButton: HTMLElement, replyTextarea: HTMLElement) {
    console.log('🔄 Legacy button insertion called - using dynamic system');
    // This is now handled by injectButtonAtPoint
    const injectionPoint = { container, reference: referenceButton };
    const button = createAIButton(replyTextarea);
    injectButtonAtPoint(button, injectionPoint, replyTextarea);
    injectedButtons.add(button);
  }

  function fallbackButtonInjection(replyTextarea: HTMLElement) {
    console.log('🔄 Legacy fallback injection called - using dynamic system');
    // This is now handled by findBestInjectionPoint strategy 3
    debouncedInjectAIButtons();
  }

  function generateAIReply(replyElement: HTMLElement) {
    console.log('🤖 Generating AI reply for element:', {
      tagName: replyElement.tagName,
      id: replyElement.id,
      className: replyElement.className,
      hasContentEditable: replyElement.hasAttribute('contenteditable')
    });

    try {
      // Extract review data using the provided selectors
      const reviewData = extractReviewData();
      if (!reviewData) {
        console.error('❌ Could not extract review data');
        showErrorMessage('Could not extract review data. Please try again.');
        return;
      }

      console.log('📝 Extracted review data:', {
        reviewer: reviewData.reviewer_name,
        rating: reviewData.review_rating,
        textLength: reviewData.review_text ? reviewData.review_text.length : 0,
        isEmptyReview: reviewData.review_text === "[Review with no text content]"
      });

      // Show loading state
      showLoadingState(replyElement);

      // Send message to background script to generate AI response
      chrome.runtime.sendMessage({
        type: 'GENERATE_AI_RESPONSE',
        data: {
          reviewData: reviewData,
          mode: getSelectedMode() // We'll implement this to get mode from popup or default
        }
      }, (response) => {
        console.log('📨 Received response from background:', response);

        if (response && response.success) {
          // Success - insert the generated response
          const aiResponse = response.aiResponse || '';

          // Only insert if we have a valid response or if textarea is empty
          // This prevents overwriting a valid response with an empty one
          const currentValue = replyElement.tagName === 'TEXTAREA' || replyElement.tagName === 'INPUT'
            ? (replyElement as HTMLInputElement | HTMLTextAreaElement).value
            : replyElement.textContent || '';

          if (aiResponse.length > 0 || currentValue.length === 0) {
            console.log('📝 Inserting response via callback:', {
              responseLength: aiResponse.length,
              currentTextareaLength: currentValue.length
            });
            insertGeneratedResponse(replyElement, aiResponse);
            console.log('✅ AI reply generated and inserted successfully');
          } else {
            console.log('⏭️ Skipping callback insertion - textarea already has content and response is empty');
          }

          // Notify parent frame
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'REPLY_GENERATED',
              data: {
                replyLength: aiResponse.length,
                reviewTextLength: reviewData.review_text ? reviewData.review_text.length : 0,
                confidence: response.confidence,
                processingTime: response.processingTime,
                tokensUsed: response.tokensUsed,
                timestamp: new Date().toISOString()
              }
            }, '*');
          }
        } else {
          // Error handling
          console.error('❌ Error generating AI response:', response?.error);
          showErrorMessage(response?.error || 'Failed to generate AI response');
          hideLoadingState(replyElement);
        }
      });

    } catch (error) {
      console.error('❌ Error in generateAIReply:', error);
      showErrorMessage('An unexpected error occurred. Please try again.');
      hideLoadingState(replyElement);
    }
  }

  function getSelectedMode(): 'simple' | 'pro' {
    // For now, default to simple mode
    // TODO: Get this from popup settings or user preference
    return 'simple';
  }

  function showLoadingState(replyElement: HTMLElement) {
    // Disable the button and show loading state
    const button = document.querySelector('.ai-review-button') as HTMLElement;
    if (button) {
      button.textContent = '🤖 Generating...';
      button.style.opacity = '0.6';
      button.style.pointerEvents = 'none';
    }

    // Optionally show a loading indicator in the textarea
    if (replyElement.hasAttribute('placeholder')) {
      const originalPlaceholder = replyElement.getAttribute('placeholder') || '';
      replyElement.setAttribute('data-original-placeholder', originalPlaceholder);
      replyElement.setAttribute('placeholder', 'Generating AI response...');
    }
  }

  function hideLoadingState(replyElement: HTMLElement) {
    // Re-enable the button
    const button = document.querySelector('.ai-review-button') as HTMLElement;
    if (button) {
      button.textContent = '🤖 Generate AI Reply';
      button.style.opacity = '1';
      button.style.pointerEvents = 'auto';
    }

    // Restore original placeholder
    if (replyElement.hasAttribute('data-original-placeholder')) {
      const originalPlaceholder = replyElement.getAttribute('data-original-placeholder') || '';
      replyElement.setAttribute('placeholder', originalPlaceholder);
      replyElement.removeAttribute('data-original-placeholder');
    }
  }

  function insertGeneratedResponse(replyElement: HTMLElement, response: string) {
    console.log('📝 Attempting to insert response into element:', {
      tagName: replyElement.tagName,
      id: replyElement.id,
      jsname: replyElement.getAttribute('jsname'),
      className: replyElement.className,
      responseLength: response.length,
      responsePreview: response.substring(0, 100) + (response.length > 100 ? '...' : '')
    });

    hideLoadingState(replyElement);

    // Fill the reply form
    if (replyElement.tagName === 'TEXTAREA' || replyElement.tagName === 'INPUT') {
      (replyElement as HTMLInputElement | HTMLTextAreaElement).value = response;
      console.log('✅ Set textarea/input value, current value length:', (replyElement as HTMLInputElement | HTMLTextAreaElement).value.length);
      // Trigger input event to notify any listeners
      replyElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (replyElement.hasAttribute('contenteditable')) {
      replyElement.textContent = response;
      console.log('✅ Set contenteditable textContent, current text length:', replyElement.textContent?.length);
      // Trigger input event for contenteditable
      replyElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      console.log('⚠️ Element is neither textarea/input nor contenteditable');
    }

    // Optionally, focus the element to show the response
    replyElement.focus();
    console.log('✅ Focused the element');
  }

  function showErrorMessage(message: string) {
    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.textContent = `❌ ${message}`;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      max-width: 300px;
    `;

    document.body.appendChild(errorDiv);

    // Remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }

  function handleAIResponseResult(data: any) {
    console.log('🤖 Handling AI response result:', data);

    try {
      // Find the associated textarea/button
      const button = document.querySelector('.ai-review-button') as HTMLElement;
      console.log('🔍 Found AI button:', button);

      const textarea = button ? findAssociatedTextarea(button) : null;
      console.log('🎯 Found associated textarea:', textarea);

      if (data && data.success && data.aiResponse && typeof data.aiResponse === 'string') {
        // Success - insert the response
        if (textarea) {
          // Check current textarea content to avoid unnecessary overwrites
          const currentValue = textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT'
            ? (textarea as HTMLInputElement | HTMLTextAreaElement).value
            : textarea.textContent || '';

          console.log('📝 Inserting AI response into textarea via message listener:', {
            responseLength: data.aiResponse.length,
            currentTextareaLength: currentValue.length,
            responsePreview: data.aiResponse.substring(0, 50) + '...'
          });

          // Only insert if the response has content or textarea is empty
          if (data.aiResponse.length > 0 || currentValue.length === 0) {
            insertGeneratedResponse(textarea, data.aiResponse);
            console.log('✅ AI response inserted via message listener');
          } else {
            console.log('⏭️ Skipping message listener insertion - response is empty and textarea has content');
          }
        } else {
          console.log('❌ No textarea found to insert response into');
        }

        // Show success message
        showSuccessMessage('AI response generated successfully!');

        console.log('✅ AI response inserted successfully');
      } else {
        // Error handling
        console.error('❌ AI response failed:', data?.error || 'Unknown error');
        if (textarea) {
          hideLoadingState(textarea);
        }
        showErrorMessage(data?.error || 'Failed to generate AI response');
      }
    } catch (error) {
      console.error('❌ Error handling AI response result:', error);
      // Try to hide loading state even if there's an error
      try {
        const button = document.querySelector('.ai-review-button') as HTMLElement;
        const textarea = button ? findAssociatedTextarea(button) : null;
        if (textarea) {
          hideLoadingState(textarea);
        }
      } catch (hideError) {
        console.error('❌ Error hiding loading state:', hideError);
      }
      showErrorMessage('An unexpected error occurred while processing the response');
    }
  }

  function handleProgressUpdate(data: any) {
    console.log('📊 Handling progress update:', data);

    try {
      // Update button text to show progress
      const button = document.querySelector('.ai-review-button') as HTMLElement;
      if (button && data) {
        const statusText = getStatusText(data.status);
        const progressText = (typeof data.progress === 'number') ? ` (${data.progress}%)` : '';
        button.textContent = `🤖 ${statusText}${progressText}`;
      }
    } catch (error) {
      console.error('❌ Error updating progress:', error);
    }
  }

  function getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return 'Queued...';
      case 'processing':
        return 'Generating...';
      case 'completed':
        return 'Complete!';
      case 'failed':
        return 'Failed';
      default:
        return 'Processing...';
    }
  }

  function showSuccessMessage(message: string) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.textContent = `✅ ${message}`;
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      max-width: 300px;
    `;

    document.body.appendChild(successDiv);

    // Remove after 3 seconds
    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.remove();
      }
    }, 3000);
  }

  function findReviewText(): string {
    console.log('🔍 Searching for review text content');

    // Try to extract review data using the provided selectors first
    const reviewData = extractReviewData();
    if (reviewData && reviewData.review_text) {
      console.log('✅ Found review text using provided selectors');
      return reviewData.review_text;
    }

    // Fallback to legacy selectors if the new ones don't work
    console.log('⚠️ Provided selectors failed, trying fallback selectors');

    // Comprehensive selectors for finding review content
    const reviewSelectors = [
      // Google-specific selectors
      '[data-review-text]',
      '[data-message-text]',
      '.review-text',
      '.review-content',
      '.review-body',
      '[class*="review"]',
      // Generic content selectors
      '[class*="content"]',
      '[class*="message"]',
      '[class*="comment"]',
      // Fallback to any text content in the main content area
      'main [class*="text"]',
      'article [class*="text"]',
      '.main-content',
      '#main-content'
    ];

    for (const selector of reviewSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element && element.textContent && element.textContent.trim().length > 20) {
            const text = element.textContent.trim();
            // Make sure it's not our button text or other UI text
            if (!text.includes('Generate AI Reply') && !text.includes('Omitir') && !text.includes('Reply')) {
              console.log(`✅ Found review text using fallback selector: ${selector}`);
              return text;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error with selector ${selector}:`, error);
      }
    }

    // Last resort: look for any substantial text content
    const allTextElements = document.querySelectorAll('p, div, span');
    for (const element of allTextElements) {
      if (element.textContent && element.textContent.trim().length > 50) {
        const text = element.textContent.trim();
        if (!text.includes('Generate AI Reply') && !text.includes('Omitir')) {
          console.log('✅ Found review text using last resort search');
          return text;
        }
      }
    }

    console.log('⚠️ No review text found, using default');
    return 'Thank you for your valuable feedback. We appreciate you taking the time to share your experience with us.';
  }

  function extractReviewData() {
    try {
      console.log('🔍 Extracting review data using provided selectors');

      // Extract reviewer name using the provided selector
      const reviewerNameElement = document.querySelector('#AH1dze > div > div > main > div > div > c-wiz > div > div > article > div.noyJyc > div > div > div.N0c6q.JhRJje') as HTMLElement;
      const reviewer_name = reviewerNameElement?.textContent?.trim() || undefined;

      // Extract rating from the star rating span - multiple fallback methods
      let review_rating: number | undefined;

      // Method 1: Try the specific Google Business rating span with DYizzd class
      const ratingElement = document.querySelector('span.DYizzd[aria-label]') as HTMLElement;
      if (ratingElement) {
        const ariaLabel = ratingElement.getAttribute('aria-label') || '';
        console.log('🎯 Found rating element with aria-label:', ariaLabel);

        // Handle both Spanish and English formats, including non-breaking spaces
        const match = ariaLabel.match(/(\d+)\s*(?:de|out of)\s*5\s*(?:estrellas?|stars?)/i);
        if (match) {
          review_rating = parseInt(match[1], 10);
          console.log('✅ Extracted rating from aria-label:', review_rating);
        }
      }

      // Method 2: Fallback - count filled stars by checking for the filled star class
      if (!review_rating && ratingElement) {
        const filledStars = ratingElement.querySelectorAll('i.VfPpkd-kBDsod.lMAmUc:not(.VOmEhb)');
        if (filledStars.length > 0) {
          review_rating = filledStars.length;
          console.log('✅ Extracted rating by counting filled stars:', review_rating);
        }
      }

      // Method 3: Alternative selector for older Google layouts
      if (!review_rating) {
        const altRatingElement = document.querySelector('span[aria-label*="de 5 estrellas"], span[aria-label*="out of 5 stars"]') as HTMLElement;
        if (altRatingElement) {
          const ariaLabel = altRatingElement.getAttribute('aria-label') || '';
          const match = ariaLabel.match(/(\d+)\s*(?:de|out of)\s*5/);
          if (match) {
            review_rating = parseInt(match[1], 10);
            console.log('✅ Extracted rating from alternative selector:', review_rating);
          }
        }
      }

      // Method 4: Look for any span with rating-like aria-label
      if (!review_rating) {
        const allRatingSpans = document.querySelectorAll('span[aria-label]');
        for (const span of allRatingSpans) {
          const ariaLabel = span.getAttribute('aria-label') || '';
          const match = ariaLabel.match(/(\d+)\s*(?:de|out of|\/)\s*5\s*(?:estrellas?|stars?)?/i);
          if (match) {
            review_rating = parseInt(match[1], 10);
            console.log('✅ Extracted rating from generic span search:', review_rating);
            break;
          }
        }
      }

      // Method 5: Last resort - look for star icons and count them
      if (!review_rating) {
        const starIcons = document.querySelectorAll('i[aria-hidden="true"]:not(.VOmEhb)');
        if (starIcons.length > 0 && starIcons.length <= 5) {
          review_rating = starIcons.length;
          console.log('✅ Extracted rating by counting star icons:', review_rating);
        }
      }

      // Extract review text using the provided selector
      const reviewTextElement = document.querySelector('div.gyKkFe.JhRJje.Fv38Af') as HTMLElement;
      const extracted_text = reviewTextElement?.textContent?.trim();

      // Handle empty reviews gracefully
      let review_text: string;
      if (!extracted_text || extracted_text.length === 0) {
        // Empty review - provide a meaningful placeholder
        review_text = "[Review with no text content]";
        console.log('📝 Empty review detected, using placeholder text');
        console.log('🔍 Debug info:', {
          extracted_text: extracted_text,
          reviewer_name: reviewer_name,
          review_rating: review_rating,
          selector_found_element: !!reviewTextElement
        });
      } else {
        review_text = extracted_text;
      }

      // Method 6: Default fallback - assume rating based on sentiment if still undefined
      if (!review_rating) {
        // If we have review text, try to infer sentiment
        const hasPositiveWords = review_text && review_text !== "[Review with no text content]" && (
          review_text.toLowerCase().includes('great') ||
          review_text.toLowerCase().includes('excellent') ||
          review_text.toLowerCase().includes('amazing') ||
          review_text.toLowerCase().includes('love') ||
          review_text.toLowerCase().includes('fantastic')
        );

        const hasNegativeWords = review_text && review_text !== "[Review with no text content]" && (
          review_text.toLowerCase().includes('bad') ||
          review_text.toLowerCase().includes('terrible') ||
          review_text.toLowerCase().includes('worst') ||
          review_text.toLowerCase().includes('disappointed') ||
          review_text.toLowerCase().includes('awful')
        );

        if (hasPositiveWords && !hasNegativeWords) {
          review_rating = 5;
          console.log('✅ Defaulted to 5 stars (positive sentiment detected)');
        } else if (hasNegativeWords) {
          review_rating = 1;
          console.log('✅ Defaulted to 1 star (negative sentiment detected)');
        } else {
          review_rating = 3;
          console.log('✅ Defaulted to 3 stars (neutral review)');
        }
      }

      // Validate that we have basic review data (at minimum, we should have a rating or reviewer)
      if (!reviewer_name && !review_rating && review_text === "[Review with no text content]") {
        console.warn('⚠️ Review has no meaningful data (no reviewer, rating, or text)');
        return null;
      }

      const reviewData = {
        reviewer_name,
        review_rating,
        review_text,
        website_url: window.location.href,
        source_platform: 'Google'
      };

      console.log('✅ Successfully extracted review data:', {
        hasReviewer: !!reviewer_name,
        rating: review_rating,
        textLength: review_text ? review_text.length : 0,
        url: reviewData.website_url,
        ratingSource: review_rating ? 'extracted' : 'undefined',
        reviewerSource: reviewer_name ? 'extracted' : 'undefined',
        textSource: review_text !== "[Review with no text content]" ? 'extracted' : 'empty_review'
      });

      return reviewData;

    } catch (error) {
      console.error('❌ Error extracting review data:', error);
      return null;
    }
  }

  function generateReplyContent(reviewText: string): string {
    // This is where you would integrate with your AI service
    // For now, we'll generate a contextual response based on the review content

    const lowerReview = reviewText.toLowerCase();

    // Analyze sentiment and content
    const isPositive = lowerReview.includes('great') || lowerReview.includes('excellent') || lowerReview.includes('amazing') || lowerReview.includes('love');
    const isNegative = lowerReview.includes('bad') || lowerReview.includes('terrible') || lowerReview.includes('worst') || lowerReview.includes('disappointed');
    const isSuggestion = lowerReview.includes('suggest') || lowerReview.includes('could') || lowerReview.includes('would be better');

    if (isPositive) {
      return `Thank you so much for your wonderful feedback! We're thrilled to hear that you're enjoying our service. Your positive experience means everything to us, and we look forward to serving you again soon!`;
    } else if (isNegative) {
      return `We're truly sorry to hear about your disappointing experience. Your feedback is incredibly valuable to us, and we're committed to improving our service. We'll review this carefully and work to ensure better experiences for all our customers.`;
    } else if (isSuggestion) {
      return `Thank you for your thoughtful suggestion! We truly appreciate you taking the time to share your ideas for improvement. Your feedback helps us enhance our service for everyone. We'll definitely consider implementing this.`;
    } else {
      return `Thank you for your feedback! We genuinely appreciate you taking the time to share your experience with us. Your input helps us continue to improve and provide the best possible service to all our customers.`;
    }
  }

  // ==================== CLEANUP AND MEMORY MANAGEMENT ====================

  function cleanup() {
    console.log('🧹 Performing cleanup of dynamic injection system');

    // Clear intervals
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
      console.log('✅ URL monitoring interval cleared');
    }

    // Clear debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      console.log('✅ Debounce timer cleared');
    }

    // Disconnect mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
      console.log('✅ MutationObserver disconnected');
    }

    // Disconnect button observer
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
      console.log('✅ Button Observer disconnected');
    }

    // Clear injected buttons set
    injectedButtons.clear();
    console.log('✅ Injected buttons set cleared');

    console.log('🧹 Cleanup complete');
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);

  // Cleanup on iframe navigation (in case iframe is reused)
  window.addEventListener('pagehide', cleanup);

  // Periodic health check
  setInterval(() => {
    console.log('💓 System health check:', {
      urlMonitoring: urlCheckInterval !== null,
      mutationObserver: mutationObserver !== null,
      buttonObserver: buttonObserver !== null,
      injectedButtons: injectedButtons.size,
      isInjecting: isInjecting,
      debounceActive: debounceTimer !== null,
      lastInjectionTime: new Date(lastInjectionTime).toISOString()
    });
  }, 30000); // Every 30 seconds

  console.log('🎉 Dynamic AI Button Injection System fully initialized and ready!');

  // ==================== LEGACY MONITORING (KEPT FOR BACKWARD COMPATIBILITY) ====================

  function monitorForReplyNavigation() {
    console.log('👁️ Legacy monitoring called - redirecting to dynamic system');
    // This is now handled by the dynamic injection system
    initializeDynamicInjectionSystem();
  }

})();
