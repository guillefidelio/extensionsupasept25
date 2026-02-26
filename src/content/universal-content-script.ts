// Bolt Reply AI — Universal Content Script
// Runs on all non-Google pages.
// Uses the same GENERATE_AI_RESPONSE / AI_RESPONSE_RESULT message contract as iframe-script.ts.
// No project imports — fully self-contained so webpack produces a single flat file.

(() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const BRAND_BLUE = 'hsl(217, 91%, 60%)';
  const BRAND_BLUE_DARK = 'hsl(217, 91%, 50%)';
  const HOST_ID = 'boltreply-universal-host';
  const BTN_ID = 'boltreply-float-btn';

  const LIGHTNING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
  const ICON_URL = chrome.runtime.getURL('icons/icon48.png');
  const LOGO_URL = chrome.runtime.getURL('icons/boltreplyainameicon.png');

  // ── State ──────────────────────────────────────────────────────────────────
  let savedSelectionText = '';
  let isLoading = false;
  let panelOpen = false;

  // Panel field values preserved across open/close cycles
  let fieldReviewerName = '';
  let fieldStarRating = 0;
  let fieldReviewText = '';
  let lastGeneratedReply = '';

  // ── Floating button ────────────────────────────────────────────────────────

  function getOrCreateFloatingButton(): HTMLElement {
    const existing = document.getElementById(BTN_ID);
    if (existing) return existing;

    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.title = 'Generate reply with Bolt Reply AI';
    btn.innerHTML = `<img src="${ICON_URL}" style="width:40px;height:40px;border-radius:50%;display:block;pointer-events:none;" alt="Bolt Reply AI" />`;
    btn.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: transparent;
      box-shadow: 0 2px 12px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.15s;
      user-select: none;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25)';
    });

    btn.addEventListener('mousedown', (e) => {
      // Prevent the click from clearing the selection before we read it
      e.preventDefault();
    });

    btn.addEventListener('click', () => {
      const textToUse = savedSelectionText;
      hideFloatingButton();
      openPanel(textToUse);
    });

    document.body.appendChild(btn);
    return btn;
  }

  function showFloatingButton(rect: DOMRect): void {
    const btn = getOrCreateFloatingButton();
    const btnSize = 40;
    const margin = 8;

    // getBoundingClientRect() is already viewport-relative; position:fixed uses viewport coords
    let top = rect.top - btnSize - margin;
    let left = rect.right - btnSize;

    // If button would go above viewport top, show it below the selection instead
    if (top < margin) {
      top = rect.bottom + margin;
    }
    // Clamp horizontally so it stays within the visible viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - btnSize - margin));

    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;
    btn.style.display = 'flex';
  }

  function hideFloatingButton(): void {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.style.display = 'none';
  }

  // ── Side panel (Shadow DOM) ────────────────────────────────────────────────

  function getOrCreatePanelHost(): ShadowRoot {
    let host = document.getElementById(HOST_ID);
    if (host && host.shadowRoot) return host.shadowRoot;

    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 0;
      height: 0;
      z-index: 2147483646;
      pointer-events: none;
    `;
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  }

  function getPanelCSS(): string {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :host { all: initial; }

      .panel {
        position: fixed;
        top: 0;
        right: 0;
        width: 360px;
        height: 100vh;
        background: #ffffff;
        border-left: 1px solid #e2e8f0;
        box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        color: #1a202c;
        transform: translateX(100%);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: all;
        overflow: hidden;
      }
      .panel.open { transform: translateX(0); }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
        flex-shrink: 0;
      }
      .header-logo {
        display: flex;
        align-items: center;
      }
      .header-logo img {
        height: 28px;
        width: auto;
        object-fit: contain;
        display: block;
      }
      .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #64748b;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
        line-height: 1;
      }
      .close-btn:hover { background: #f1f5f9; color: #1a202c; }

      /* Body */
      .body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      /* Credits badge */
      .credits-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        color: #64748b;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 3px 10px;
        font-weight: 500;
        align-self: flex-end;
      }
      .credits-badge .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: hsl(217, 91%, 60%);
        flex-shrink: 0;
      }

      /* Form sections */
      .field { display: flex; flex-direction: column; gap: 5px; }
      .label {
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      input[type="text"], textarea {
        width: 100%;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #1a202c;
        background: #fff;
        resize: vertical;
        transition: border-color 0.15s, box-shadow 0.15s;
        outline: none;
      }
      input[type="text"]:focus, textarea:focus {
        border-color: hsl(217, 91%, 60%);
        box-shadow: 0 0 0 3px hsla(217, 91%, 60%, 0.15);
      }
      textarea { min-height: 135px; }

      .result-area {
        width: 100%;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #1a202c;
        background: #f8fafc;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.55;
        user-select: none;
        cursor: default;
      }

      /* Stars */
      .stars { display: flex; gap: 4px; }
      .star {
        font-size: 22px;
        cursor: pointer;
        color: #d1d5db;
        line-height: 1;
        transition: color 0.1s, transform 0.1s;
        user-select: none;
      }
      .star.filled { color: #f59e0b; }
      .star:hover { transform: scale(1.15); }

      /* Buttons */
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 9px 16px;
        border: none;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s, transform 0.1s;
        outline: none;
        width: 100%;
      }
      .btn:active { transform: scale(0.98); }
      .btn-primary {
        background: hsl(217, 91%, 60%);
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) { background: hsl(217, 91%, 50%); }
      .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-secondary {
        background: #f1f5f9;
        color: #374151;
        border: 1px solid #e2e8f0;
      }
      .btn-secondary:hover { background: #e2e8f0; }

      /* Result section */
      .result-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 4px;
        border-top: 1px solid #e2e8f0;
      }
      .result-label {
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* Error / info message */
      .message-box {
        padding: 10px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        line-height: 1.5;
      }
      .message-box.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
      .message-box.info  { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

      /* Spinner */
      @keyframes spin { to { transform: rotate(360deg); } }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255,255,255,0.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
      }

      /* Divider */
      .divider { height: 1px; background: #e2e8f0; margin: 2px 0; }
    `;
  }

  function buildPanelHTML(shadowRoot: ShadowRoot): void {
    shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = getPanelCSS();
    shadowRoot.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'boltreply-panel';

    panel.innerHTML = `
      <div class="header">
        <div class="header-logo">
          <img src="${LOGO_URL}" alt="Bolt Reply AI" />
        </div>
        <button class="close-btn" id="br-close" title="Close panel">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="body">

        <div class="credits-badge">
          <span class="dot"></span>
          <span id="br-credits">Loading credits...</span>
        </div>

        <div class="field">
          <span class="label">Reviewer Name</span>
          <input type="text" id="br-name" placeholder="Customer name (optional)" />
        </div>

        <div class="field">
          <span class="label">Star Rating</span>
          <div class="stars" id="br-stars">
            <span class="star" data-value="1">&#9733;</span>
            <span class="star" data-value="2">&#9733;</span>
            <span class="star" data-value="3">&#9733;</span>
            <span class="star" data-value="4">&#9733;</span>
            <span class="star" data-value="5">&#9733;</span>
          </div>
        </div>

        <div class="field">
          <span class="label">Review Text</span>
          <textarea id="br-review" placeholder="Paste or type the customer review here..."></textarea>
        </div>

        <div id="br-error-box" style="display:none;"></div>

        <button class="btn btn-primary" id="br-generate">
          ${LIGHTNING_SVG}
          <span id="br-btn-label">Generate Reply</span>
        </button>

        <div class="divider"></div>

        <div class="result-section" id="br-result-section" style="display:none;">
          <span class="result-label">Generated Reply</span>
          <div class="result-area" id="br-result"></div>
          <button class="btn btn-secondary" id="br-copy">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy to Clipboard
          </button>
        </div>

      </div>
    `;

    shadowRoot.appendChild(panel);
    attachPanelListeners(shadowRoot);
  }

  function attachPanelListeners(shadowRoot: ShadowRoot): void {
    // Close button
    shadowRoot.getElementById('br-close')?.addEventListener('click', closePanel);

    // Star rating
    const starsContainer = shadowRoot.getElementById('br-stars');
    starsContainer?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const value = parseInt(target.getAttribute('data-value') || '0', 10);
      if (value) setStarRating(shadowRoot, value);
    });
    starsContainer?.addEventListener('mouseover', (e) => {
      const target = e.target as HTMLElement;
      const value = parseInt(target.getAttribute('data-value') || '0', 10);
      if (value) highlightStars(shadowRoot, value);
    });
    starsContainer?.addEventListener('mouseleave', () => {
      highlightStars(shadowRoot, fieldStarRating);
    });

    // Name field persistence
    const nameInput = shadowRoot.getElementById('br-name') as HTMLInputElement | null;
    nameInput?.addEventListener('input', () => {
      fieldReviewerName = nameInput.value;
    });

    // Review text persistence
    const reviewTextarea = shadowRoot.getElementById('br-review') as HTMLTextAreaElement | null;
    reviewTextarea?.addEventListener('input', () => {
      fieldReviewText = reviewTextarea.value;
    });

    // Generate button
    shadowRoot.getElementById('br-generate')?.addEventListener('click', () => {
      handleGenerate(shadowRoot);
    });

    // Copy button
    shadowRoot.getElementById('br-copy')?.addEventListener('click', () => {
      handleCopy(shadowRoot);
    });
  }

  function setStarRating(shadowRoot: ShadowRoot, value: number): void {
    fieldStarRating = value;
    highlightStars(shadowRoot, value);
  }

  function highlightStars(shadowRoot: ShadowRoot, upTo: number): void {
    const stars = shadowRoot.querySelectorAll('.star');
    stars.forEach((star, i) => {
      if (i < upTo) {
        star.classList.add('filled');
      } else {
        star.classList.remove('filled');
      }
    });
  }

  // ── Panel open / close ─────────────────────────────────────────────────────

  function openPanel(prefillText: string): void {
    const shadowRoot = getOrCreatePanelHost();
    buildPanelHTML(shadowRoot);

    // Restore / set field values
    fieldReviewText = prefillText || fieldReviewText;
    const nameInput = shadowRoot.getElementById('br-name') as HTMLInputElement | null;
    const reviewTextarea = shadowRoot.getElementById('br-review') as HTMLTextAreaElement | null;
    if (nameInput) nameInput.value = fieldReviewerName;
    if (reviewTextarea) reviewTextarea.value = fieldReviewText;
    highlightStars(shadowRoot, fieldStarRating);

    // Restore previous result if any
    if (lastGeneratedReply) {
      showResult(shadowRoot, lastGeneratedReply);
    }

    loadCredits(shadowRoot);

    // Trigger slide-in on next frame
    requestAnimationFrame(() => {
      const panel = shadowRoot.getElementById('boltreply-panel');
      if (panel) panel.classList.add('open');
      panelOpen = true;
    });
  }

  function closePanel(): void {
    const host = document.getElementById(HOST_ID);
    if (!host?.shadowRoot) return;
    const panel = host.shadowRoot.getElementById('boltreply-panel');
    if (panel) {
      panel.classList.remove('open');
      setTimeout(() => { panelOpen = false; }, 250);
    }
  }

  // ── Credits ────────────────────────────────────────────────────────────────

  function loadCredits(shadowRoot: ShadowRoot): void {
    const creditsEl = shadowRoot.getElementById('br-credits');
    if (!creditsEl) return;

    chrome.storage.local.get(['credits_remaining'], (result) => {
      if (chrome.runtime.lastError) return;
      const val = result['credits_remaining'];
      if (typeof val === 'number') {
        creditsEl.textContent = `${val} credits remaining`;
      } else {
        creditsEl.textContent = 'Credits unavailable';
      }
    });
  }

  function updateCredits(shadowRoot: ShadowRoot, remaining: number): void {
    const creditsEl = shadowRoot.getElementById('br-credits');
    if (creditsEl) creditsEl.textContent = `${remaining} credits remaining`;
    chrome.storage.local.set({ credits_remaining: remaining });
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  function handleGenerate(shadowRoot: ShadowRoot): void {
    if (isLoading) return;

    const nameInput = shadowRoot.getElementById('br-name') as HTMLInputElement | null;
    const reviewTextarea = shadowRoot.getElementById('br-review') as HTMLTextAreaElement | null;

    const reviewerName = nameInput?.value.trim() || undefined;
    const reviewText = reviewTextarea?.value.trim() || '';

    clearError(shadowRoot);

    if (!reviewText) {
      showError(shadowRoot, 'Please enter the review text before generating a reply.');
      return;
    }

    // Auth check first
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }, (authResponse: { isAuthenticated?: boolean } | undefined) => {
      if (chrome.runtime.lastError || !authResponse?.isAuthenticated) {
        showError(shadowRoot, 'Please log in via the Bolt Reply extension icon first.');
        return;
      }

      setLoadingState(shadowRoot, true);

      const reviewData = {
        review_text: reviewText,
        reviewer_name: reviewerName,
        review_rating: fieldStarRating || undefined,
        website_url: window.location.href,
        source_platform: window.location.hostname
      };

      chrome.runtime.sendMessage(
        {
          type: 'GENERATE_AI_RESPONSE',
          data: { reviewData }
        },
        (response: { success?: boolean; aiResponse?: string; error?: string; creditsRemaining?: number } | undefined) => {
          if (chrome.runtime.lastError) {
            setLoadingState(shadowRoot, false);
            showError(shadowRoot, 'Connection error. Please try again.');
            return;
          }

          setLoadingState(shadowRoot, false);

          if (response?.success && response.aiResponse) {
            lastGeneratedReply = response.aiResponse;
            showResult(shadowRoot, response.aiResponse);
            if (typeof response.creditsRemaining === 'number') {
              updateCredits(shadowRoot, response.creditsRemaining);
            }
          } else {
            showError(shadowRoot, response?.error || 'Failed to generate reply. Please try again.');
          }
        }
      );
    });
  }

  function setLoadingState(shadowRoot: ShadowRoot, loading: boolean): void {
    isLoading = loading;
    const btn = shadowRoot.getElementById('br-generate') as HTMLButtonElement | null;
    const label = shadowRoot.getElementById('br-btn-label');
    if (!btn || !label) return;

    btn.disabled = loading;
    if (loading) {
      btn.innerHTML = `<span class="spinner"></span><span id="br-btn-label">Generating...</span>`;
    } else {
      btn.innerHTML = `${LIGHTNING_SVG}<span id="br-btn-label">Generate Reply</span>`;
    }
  }

  function showResult(shadowRoot: ShadowRoot, text: string): void {
    const resultSection = shadowRoot.getElementById('br-result-section');
    const resultArea = shadowRoot.getElementById('br-result');
    if (resultSection) resultSection.style.display = 'flex';
    if (resultArea) resultArea.textContent = text;
    // Auto-copy as soon as the reply is ready
    handleCopy(shadowRoot);
  }

  function showError(shadowRoot: ShadowRoot, message: string): void {
    const box = shadowRoot.getElementById('br-error-box');
    if (!box) return;
    box.className = 'message-box error';
    box.textContent = message;
    box.style.display = 'block';
  }

  function clearError(shadowRoot: ShadowRoot): void {
    const box = shadowRoot.getElementById('br-error-box');
    if (box) box.style.display = 'none';
  }

  function handleCopy(shadowRoot: ShadowRoot): void {
    const resultArea = shadowRoot.getElementById('br-result');
    const text = resultArea?.textContent?.trim() || '';
    if (!text) return;

    const showCopied = () => {
      const copyBtn = shadowRoot.getElementById('br-copy');
      if (!copyBtn) return;
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Copied!
      `;
      setTimeout(() => { copyBtn.innerHTML = original; }, 2000);
    };

    navigator.clipboard.writeText(text).then(showCopied).catch(() => {
      // Fallback: create a temporary textarea, copy from it, remove it
      const tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      showCopied();
    });
  }

  // ── Listen for AI_RESPONSE_RESULT pushed by service worker ─────────────────
  // (Service worker calls chrome.tabs.sendMessage after generation completes)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'AI_RESPONSE_RESULT') {
      const host = document.getElementById(HOST_ID);
      const shadowRoot = host?.shadowRoot;
      if (shadowRoot) {
        setLoadingState(shadowRoot, false);
        const data = message.data as { success?: boolean; aiResponse?: string; error?: string; creditsRemaining?: number } | undefined;
        if (data?.success && data.aiResponse) {
          lastGeneratedReply = data.aiResponse;
          showResult(shadowRoot, data.aiResponse);
          if (typeof data.creditsRemaining === 'number') {
            updateCredits(shadowRoot, data.creditsRemaining);
          }
        } else {
          showError(shadowRoot, data?.error || 'Failed to generate reply.');
        }
      }
      sendResponse({ success: true });
    }
    return false;
  });

  // ── Selection detection ────────────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Ignore clicks inside our own panel host
    const host = document.getElementById(HOST_ID);
    if (host && host.contains(e.target as Node)) return;

    const btn = document.getElementById(BTN_ID);
    if (btn && btn.contains(e.target as Node)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';

      if (text.length > 10) {
        savedSelectionText = text;
        try {
          const range = selection!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showFloatingButton(rect);
        } catch {
          hideFloatingButton();
        }
      } else {
        hideFloatingButton();
      }
    }, 10);
  });

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length <= 10) {
      // Don't hide immediately — let mouseup handle it to avoid race conditions
    }
  });

  // Hide floating button on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideFloatingButton();
      if (panelOpen) closePanel();
    }
  });

  // Hide floating button when clicking elsewhere (not on our elements)
  document.addEventListener('click', (e) => {
    const host = document.getElementById(HOST_ID);
    const btn = document.getElementById(BTN_ID);
    const target = e.target as Node;
    if (host?.contains(target) || btn?.contains(target)) return;

    // If selection is gone, hide button
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length <= 10) {
      hideFloatingButton();
    }
  });

})();
