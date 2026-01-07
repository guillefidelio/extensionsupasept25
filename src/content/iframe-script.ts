// AI Review Responder - Dynamic Iframe Script
// This script runs ONLY in Google Business review iframes (automatically injected by manifest.json)
// URL pattern: https://www.google.com/local/business/*/customers/reviews*

(() => {
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
    switch (message.type) {
      case 'AI_RESPONSE_RESULT':
        handleAIResponseResult(message.data);
        break;

      case 'PROGRESS_UPDATE':
        handleProgressUpdate(message.data);
        break;
    }

    sendResponse({ success: true });
  });

  // Determine if this is a single review reply iframe or multi-review iframe
  const currentUrl = window.location.href;
  const hasCustomersReviews = currentUrl.includes('/customers/reviews');
  const isSingleReviewReply = currentUrl.includes('/customers/reviews/reply');

  if (hasCustomersReviews) {
    initializeDynamicInjectionSystem();
  }

  // ==================== DYNAMIC INJECTION SYSTEM ====================

  function initializeDynamicInjectionSystem() {
    // Set up content change detection
    setupContentChangeDetection();

    // Set up DOM mutation monitoring
    setupMutationObserver();

    // Initial scan for existing textareas
    debouncedInjectAIButtons();

    // Set up button removal observer
    setupButtonObserver();
  }

  function setupContentChangeDetection() {
    urlCheckInterval = window.setInterval(() => {
      const currentUrl = window.location.href;

      if (currentUrl !== lastKnownUrl) {
        lastKnownUrl = currentUrl;
        handleContentChange();
      }
    }, URL_CHECK_INTERVAL_MS);
  }

  function setupMutationObserver() {
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
            }
          }
        }
      });

      if (shouldTriggerScan) {
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
  }

  function setupButtonObserver() {
    buttonObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.classList.contains('ai-review-button')) {
                injectedButtons.delete(element as HTMLElement);
              }
              // Also check for buttons inside removed containers
              const removedButtons = element.querySelectorAll('.ai-review-button');
              removedButtons.forEach(button => {
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
  }

  function handleContentChange() {
    cleanupOrphanedButtons();

    // Don't trigger injection immediately - let the MutationObserver handle it
    // when the new textarea appears in the DOM
  }

  function handleTextareaChanges() {
    debouncedInjectAIButtons();
  }

  function debouncedInjectAIButtons() {
    const now = Date.now();
    const timeSinceLastInjection = now - lastInjectionTime;

    // Clear any existing timer first
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (timeSinceLastInjection < INJECTION_DEBOUNCE_MS) {
      const remainingTime = INJECTION_DEBOUNCE_MS - timeSinceLastInjection;

      debounceTimer = window.setTimeout(() => {
        performInjection();
        debounceTimer = null;
      }, remainingTime);

    } else {
      performInjection();
    }
  }

  function performInjection() {
    // Prevent concurrent injections
    if (isInjecting) {
      return;
    }

    isInjecting = true;
    lastInjectionTime = Date.now();

    try {
      // Clean up orphaned buttons first
      cleanupOrphanedButtons();

      // Find all textareas that need enhancement
      const textareas = findAllReplyTextareas();

      if (textareas.length > 0) {
        let successfulInjections = 0;
        let skippedInjections = 0;

        textareas.forEach((textarea, index) => {
          const existingButton = findExistingButtonForTextarea(textarea);
          if (existingButton) {
            skippedInjections++;
          } else {
            const success = injectAIButtonForTextarea(textarea, index);
            if (success) {
              successfulInjections++;
            }
          }
        });
      }
    } finally {
      // Always reset the flag
      isInjecting = false;
    }
  }

  function findAllReplyTextareas(): HTMLTextAreaElement[] {
    // Use only the specific Google selector provided by the user
    const specificSelector = '[jsname="YPqjbf"]';
    const foundTextareas: HTMLTextAreaElement[] = [];

    try {
      const element = document.querySelector(specificSelector) as HTMLTextAreaElement;

      if (element && (element.tagName === 'TEXTAREA' || element.hasAttribute('contenteditable'))) {
        // Verify this is actually a reply textarea and not already processed
        if (isLikelyReplyTextarea(element) && !hasAssociatedButton(element)) {
          foundTextareas.push(element);
        }
      }
    } catch (error) {
      // Ignore errors with selector
    }

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
          return true;
        }
      }
    }

    // Also check if there's a button in the same container
    const container = textarea.closest('form, .modal, .dialog, .review-reply-container') || textarea.parentElement;
    if (container) {
      const nearbyButton = container.querySelector('.ai-review-button');
      if (nearbyButton) {
        return true;
      }
    }

    return false;
  }

  function cleanupOrphanedButtons() {
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
          button.remove();
          injectedButtons.delete(button as HTMLElement);
          cleanedCount++;
        }
      }
    });
  }

  function findAssociatedTextarea(button: Element): HTMLElement | null {
    // First, try to find the specific textarea with jsname="YPqjbf" (Google's reply textarea)
    const googleReplyTextarea = document.querySelector('textarea[jsname="YPqjbf"]') ||
                               document.querySelector('[jsname="YPqjbf"]');
    if (googleReplyTextarea) {
      return googleReplyTextarea as HTMLElement;
    }

    // Fallback: Try to find textarea in the same container or nearby
    const container = button.parentElement;
    if (container) {
      const textarea = container.querySelector('textarea') ||
                      container.querySelector('[contenteditable="true"]');
      if (textarea) {
        return textarea as HTMLElement;
      }
    }

    // Look for textarea before the button's container
    const previousTextarea = button.parentElement?.previousElementSibling?.querySelector('textarea') ||
                           button.parentElement?.previousElementSibling?.querySelector('[contenteditable="true"]');
    if (previousTextarea) {
      return previousTextarea as HTMLElement;
    }

    // Last resort: look for any textarea on the page
    const anyTextarea = document.querySelector('textarea');
    if (anyTextarea) {
      return anyTextarea as HTMLElement;
    }

    return null;
  }

  function injectAIButtonForTextarea(textarea: HTMLElement, index: number): boolean {
    // Check if we already have a button for this textarea
    const existingButton = findExistingButtonForTextarea(textarea);

    if (existingButton) {
      return false;
    }

    try {
      const button = createAIButton(textarea);
      const injectionPoint = findBestInjectionPoint(textarea);

      if (injectionPoint) {
        injectButtonAtPoint(button, injectionPoint, textarea);
        injectedButtons.add(button);
        return true;
      } else {
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
          return button;
        }
      }
    }

    // Method 3: Check parent elements (up to 3 levels)
    let currentElement: HTMLElement | null = textarea;
    for (let i = 0; i < 3 && currentElement; i++) {
      const button = currentElement.querySelector('.ai-review-button') as HTMLElement;
      if (button && injectedButtons.has(button)) {
        return button;
      }
      currentElement = currentElement.parentElement;
    }

    return null;
  }

  function createAIButton(textarea: HTMLElement): HTMLElement {
    const button = document.createElement('button');
    button.textContent = 'Bolt Reply';
    button.className = 'ai-review-button VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ VfPpkd-LgbsSe-OWXEXe-dgl2Hf nCP5yc AjY5Oe DuMIQc LQeN7 FwaX8';
    button.setAttribute('data-textarea-id', textarea.id || 'textarea-' + Date.now());

    button.style.cssText = `
      margin: 0 8px 0 0;
      padding: 8px 16px;
      background: hsl(217, 91%, 60%);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-family: 'Inter', 'Google Sans', Roboto, Arial, sans-serif;
      font-weight: 500;
      transition: background-color 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    // Add hover effects
    button.onmouseover = () => button.style.backgroundColor = 'hsl(217, 91%, 50%)';
    button.onmouseout = () => button.style.backgroundColor = 'hsl(217, 91%, 60%)';

    // Add click handler
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      generateAIReply(textarea);
    });

    // Lightning bolt SVG icon (flat, white)
    const lightningIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

    // Add Google-like inner structure with lightning icon
    button.innerHTML = `
      <div class="VfPpkd-Jh9lGc"></div>
      <div class="VfPpkd-J1Ukfc-LhBDec"></div>
      <div class="VfPpkd-RLmnJb"></div>
      <span jsname="V67aGc" class="VfPpkd-vQzf8d" style="display: flex; align-items: center; gap: 6px;">${lightningIcon} Bolt Reply</span>
    `;

    return button;
  }

  function findBestInjectionPoint(textarea: HTMLElement): { container: HTMLElement; reference: HTMLElement | null } | null {
    // Strategy 1: Look for Google-specific button container
    const googleContainer = document.querySelector('div.FkJOzc.lgfhc.LW6Hp') as HTMLElement;
    if (googleContainer) {
      const skipButton = googleContainer.querySelector('button[jsname="dmDvRc"]') as HTMLElement;
      if (skipButton) {
        return { container: googleContainer, reference: skipButton };
      }
      // Use any button in the container
      const anyButton = googleContainer.querySelector('button') as HTMLElement;
      if (anyButton) {
        return { container: googleContainer, reference: anyButton };
      }
    }

    // Strategy 2: Find form buttons container
    const form = textarea.closest('form');
    if (form) {
      const buttonContainer = form.querySelector('.button-container, .form-actions, .actions') as HTMLElement;
      if (buttonContainer) {
        return { container: buttonContainer, reference: buttonContainer.firstElementChild as HTMLElement };
      }
    }

    // Strategy 3: Insert next to textarea
    if (textarea.parentElement) {
      return { container: textarea.parentElement, reference: textarea.nextElementSibling as HTMLElement };
    }

    return null;
  }

  function injectButtonAtPoint(button: HTMLElement, injectionPoint: { container: HTMLElement; reference: HTMLElement | null }, textarea: HTMLElement) {
    if (injectionPoint.reference) {
      // Insert before reference element
      injectionPoint.container.insertBefore(button, injectionPoint.reference);
    } else {
      // Append to container
      injectionPoint.container.appendChild(button);
    }

    // Mark button as injected for this textarea using jsname for better identification
    const textareaIdentifier = textarea.getAttribute('jsname') || textarea.id || 'anonymous-textarea';
    button.setAttribute('data-associated-textarea', textareaIdentifier);
    button.setAttribute('data-associated-jsname', textarea.getAttribute('jsname') || '');
    button.setAttribute('data-injection-timestamp', Date.now().toString());
  }

  // ==================== LEGACY FUNCTIONS (KEPT FOR COMPATIBILITY) ====================

  function initializeReplyFormEnhancement() {
    initializeDynamicInjectionSystem();
  }

  function enhanceReplyForm(replyTextarea: HTMLElement) {
    // This function is now handled by the dynamic injection system
    // Just trigger a scan for this specific textarea
    debouncedInjectAIButtons();
  }

  function insertAIButton(container: HTMLElement, referenceButton: HTMLElement, replyTextarea: HTMLElement) {
    // This is now handled by injectButtonAtPoint
    const injectionPoint = { container, reference: referenceButton };
    const button = createAIButton(replyTextarea);
    injectButtonAtPoint(button, injectionPoint, replyTextarea);
    injectedButtons.add(button);
  }

  function fallbackButtonInjection(replyTextarea: HTMLElement) {
    // This is now handled by findBestInjectionPoint strategy 3
    debouncedInjectAIButtons();
  }

  function generateAIReply(replyElement: HTMLElement) {
    try {
      // Extract review data using the provided selectors
      const reviewData = extractReviewData();
      if (!reviewData) {
        console.error('❌ Could not extract review data');
        showErrorMessage('Could not extract review data. Please try again.');
        return;
      }

      // Show loading state
      showLoadingState(replyElement);

      // Send message to background script to generate AI response
      chrome.runtime.sendMessage({
        type: 'GENERATE_AI_RESPONSE',
        data: {
          reviewData: reviewData
        }
      }, (response) => {
        if (response && response.success) {
          // Success - insert the generated response
          const aiResponse = response.aiResponse || '';

          // Only insert if we have a valid response or if textarea is empty
          // This prevents overwriting a valid response with an empty one
          const currentValue = replyElement.tagName === 'TEXTAREA' || replyElement.tagName === 'INPUT'
            ? (replyElement as HTMLInputElement | HTMLTextAreaElement).value
            : replyElement.textContent || '';

          if (aiResponse.length > 0 || currentValue.length === 0) {
            insertGeneratedResponse(replyElement, aiResponse);
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

  function showLoadingState(replyElement: HTMLElement) {
    // Disable the button and show loading state
    const button = document.querySelector('.ai-review-button') as HTMLElement;
    if (button) {
      const lightningIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
      button.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;">${lightningIcon} Generating...</span>`;
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
      const lightningIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
      button.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;">${lightningIcon} Bolt Reply</span>`;
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
    hideLoadingState(replyElement);

    // Fill the reply form
    if (replyElement.tagName === 'TEXTAREA' || replyElement.tagName === 'INPUT') {
      (replyElement as HTMLInputElement | HTMLTextAreaElement).value = response;
      // Trigger input event to notify any listeners
      replyElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (replyElement.hasAttribute('contenteditable')) {
      replyElement.textContent = response;
      // Trigger input event for contenteditable
      replyElement.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Optionally, focus the element to show the response
    replyElement.focus();
  }

  function showErrorMessage(message: string) {
    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.textContent = `❌ ${message}`;
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: hsl(0, 84%, 60%);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 300px;
      backdrop-filter: blur(12px);
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
    try {
      // Find the associated textarea/button
      const button = document.querySelector('.ai-review-button') as HTMLElement;

      const textarea = button ? findAssociatedTextarea(button) : null;

      if (data && data.success && data.aiResponse && typeof data.aiResponse === 'string') {
        // Success - insert the response
        if (textarea) {
          // Check current textarea content to avoid unnecessary overwrites
          const currentValue = textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT'
            ? (textarea as HTMLInputElement | HTMLTextAreaElement).value
            : textarea.textContent || '';

          // Only insert if the response has content or textarea is empty
          if (data.aiResponse.length > 0 || currentValue.length === 0) {
            insertGeneratedResponse(textarea, data.aiResponse);
          }
        }

        // Show success message
        showSuccessMessage('AI response generated successfully!');
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
      background: hsl(142, 76%, 36%);
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 300px;
      backdrop-filter: blur(12px);
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
    // Try to extract review data using the provided selectors first
    const reviewData = extractReviewData();
    if (reviewData && reviewData.review_text) {
      return reviewData.review_text;
    }

    // Fallback to legacy selectors if the new ones don't work

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
            if (!text.includes('Bolt Reply') && !text.includes('Omitir') && !text.includes('Reply')) {
              return text;
            }
          }
        }
      } catch (error) {
        // Ignore selector errors
      }
    }

    // Last resort: look for any substantial text content
    const allTextElements = document.querySelectorAll('p, div, span');
    for (const element of allTextElements) {
      if (element.textContent && element.textContent.trim().length > 50) {
        const text = element.textContent.trim();
        if (!text.includes('Bolt Reply') && !text.includes('Omitir')) {
          return text;
        }
      }
    }

    return 'Thank you for your valuable feedback. We appreciate you taking the time to share your experience with us.';
  }

  function extractReviewData() {
    try {
      // Extract reviewer name using the provided selector
      const reviewerNameElement = document.querySelector('#AH1dze > div > div > main > div > div > c-wiz > div > div > article > div.noyJyc > div > div > div.N0c6q.JhRJje') as HTMLElement;
      const reviewer_name = reviewerNameElement?.textContent?.trim() || undefined;

      // Extract rating from the star rating span - multiple fallback methods
      let review_rating: number | undefined;

      // Method 1: Try the specific Google Business rating span with DYizzd class
      const ratingElement = document.querySelector('span.DYizzd[aria-label]') as HTMLElement;
      if (ratingElement) {
        const ariaLabel = ratingElement.getAttribute('aria-label') || '';

        // Handle both Spanish and English formats, including non-breaking spaces
        const match = ariaLabel.match(/(\d+)\s*(?:de|out of)\s*5\s*(?:estrellas?|stars?)/i);
        if (match) {
          review_rating = parseInt(match[1], 10);
        }
      }

      // Method 2: Fallback - count filled stars by checking for the filled star class
      if (!review_rating && ratingElement) {
        const filledStars = ratingElement.querySelectorAll('i.VfPpkd-kBDsod.lMAmUc:not(.VOmEhb)');
        if (filledStars.length > 0) {
          review_rating = filledStars.length;
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
            break;
          }
        }
      }

      // Method 5: Last resort - look for star icons and count them
      if (!review_rating) {
        const starIcons = document.querySelectorAll('i[aria-hidden="true"]:not(.VOmEhb)');
        if (starIcons.length > 0 && starIcons.length <= 5) {
          review_rating = starIcons.length;
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
        } else if (hasNegativeWords) {
          review_rating = 1;
        } else {
          review_rating = 3;
        }
      }

      // Validate that we have basic review data (at minimum, we should have a rating or reviewer)
      if (!reviewer_name && !review_rating && review_text === "[Review with no text content]") {
        return null;
      }

      const reviewData = {
        reviewer_name,
        review_rating,
        review_text,
        website_url: window.location.href,
        source_platform: 'Google'
      };

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
    // Clear intervals
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }

    // Clear debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Disconnect mutation observer
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    // Disconnect button observer
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    // Clear injected buttons set
    injectedButtons.clear();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

  // Cleanup on iframe navigation (in case iframe is reused)
  window.addEventListener('pagehide', cleanup);

  // Periodic health check
  setInterval(() => {
    // Keep minimal health check if needed, or remove. I'll leave it empty effectively or just remove the log.
  }, 30000); // Every 30 seconds

  // ==================== LEGACY MONITORING (KEPT FOR BACKWARD COMPATIBILITY) ====================

  function monitorForReplyNavigation() {
    // This is now handled by the dynamic injection system
    initializeDynamicInjectionSystem();
  }

})();
