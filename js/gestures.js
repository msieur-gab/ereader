/**
 * FlashReader Pro - Gesture Handler
 * Handles touch gestures and keyboard navigation
 */

import { state, toggleUI, showUI, hideUI } from './ui.js';

// Configuration
const SWIPE_THRESHOLD = 50;   // Minimum distance for swipe
const TAP_THRESHOLD = 10;     // Maximum movement for tap
const SWIPE_TIMEOUT = 300;    // Maximum time for swipe gesture (ms)
const LONG_PRESS_DELAY = 400; // Time to trigger selection mode (ms)

// Touch tracking state
let touchStartX = null;
let touchStartY = null;
let touchStartTime = null;

// Long press / selection state
let longPressTimer = null;
let isSelectionMode = false;

// Callbacks
let onSwipeLeft = null;
let onSwipeRight = null;
let onSwipeUp = null;
let onSwipeDown = null;
let onTap = null;
let onSelectionStart = null;
let onSelectionEnd = null;

/**
 * Initialize gesture handling
 * @param {Object} callbacks - Gesture callbacks
 */
export function initGestures(callbacks = {}) {
  onSwipeLeft = callbacks.onSwipeLeft || null;
  onSwipeRight = callbacks.onSwipeRight || null;
  onSwipeUp = callbacks.onSwipeUp || null;
  onSwipeDown = callbacks.onSwipeDown || null;
  onTap = callbacks.onTap || null;
  onSelectionStart = callbacks.onSelectionStart || null;
  onSelectionEnd = callbacks.onSelectionEnd || null;

  // Touch events on main element
  const reader = document.getElementById('reader');
  if (reader) {
    reader.addEventListener('touchstart', handleTouchStart, { passive: true });
    reader.addEventListener('touchmove', handleTouchMove, { passive: true });
    reader.addEventListener('touchend', handleTouchEnd, { passive: false });
    reader.addEventListener('touchcancel', handleTouchCancel, { passive: true });
  }

  // Listen for custom events from EPUB iframe
  document.addEventListener('reader-swipe', handleReaderSwipe);
  document.addEventListener('reader-tap', handleReaderTap);

  // Keyboard navigation
  document.addEventListener('keydown', handleKeyDown);

  // Mouse movement to show UI
  document.addEventListener('mousemove', handleMouseMove);
}

/**
 * Handle touch start
 * @param {TouchEvent} e
 */
function handleTouchStart(e) {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();

  // Start long press timer for selection mode
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    isSelectionMode = true;
    if (onSelectionStart) onSelectionStart();
  }, LONG_PRESS_DELAY);
}

/**
 * Handle touch move
 * @param {TouchEvent} e
 */
function handleTouchMove(e) {
  if (touchStartX === null || touchStartY === null) return;

  const touch = e.touches[0];
  const deltaX = Math.abs(touchStartX - touch.clientX);
  const deltaY = Math.abs(touchStartY - touch.clientY);

  // If moved before long press triggered, cancel selection mode
  if (!isSelectionMode && (deltaX > TAP_THRESHOLD || deltaY > TAP_THRESHOLD)) {
    clearTimeout(longPressTimer);
  }
  // If in selection mode, let the browser handle text selection
}

/**
 * Handle touch end
 * @param {TouchEvent} e
 */
function handleTouchEnd(e) {
  clearTimeout(longPressTimer);

  if (touchStartX === null || touchStartY === null) return;

  // If in selection mode, trigger selection end callback
  if (isSelectionMode) {
    if (onSelectionEnd) onSelectionEnd();
    isSelectionMode = false;
    resetTouch();
    return;
  }

  const touch = e.changedTouches[0];
  const deltaX = touchStartX - touch.clientX;
  const deltaY = touchStartY - touch.clientY;
  const deltaTime = Date.now() - touchStartTime;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  // Check if it's a valid swipe (within time limit)
  if (deltaTime > SWIPE_TIMEOUT) {
    resetTouch();
    return;
  }

  // Determine gesture type
  if (absX > SWIPE_THRESHOLD || absY > SWIPE_THRESHOLD) {
    // It's a swipe
    if (absX > absY) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe left -> next page
        if (onSwipeLeft) onSwipeLeft();
      } else {
        // Swipe right -> previous page
        if (onSwipeRight) onSwipeRight();
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        // Swipe up -> hide UI
        hideUI();
        if (onSwipeUp) onSwipeUp();
      } else {
        // Swipe down -> show UI
        showUI();
        if (onSwipeDown) onSwipeDown();
      }
    }
    e.preventDefault();
  } else if (absX < TAP_THRESHOLD && absY < TAP_THRESHOLD) {
    // It's a tap -> toggle UI
    toggleUI();
    if (onTap) onTap();
  }

  resetTouch();
}

/**
 * Handle touch cancel
 */
function handleTouchCancel() {
  clearTimeout(longPressTimer);
  isSelectionMode = false;
  resetTouch();
}

/**
 * Reset touch tracking state
 */
function resetTouch() {
  touchStartX = null;
  touchStartY = null;
  touchStartTime = null;
}

/**
 * Handle custom swipe event from reader iframe
 * @param {CustomEvent} e
 */
function handleReaderSwipe(e) {
  const { direction } = e.detail;

  switch (direction) {
    case 'left':
      if (onSwipeLeft) onSwipeLeft();
      break;
    case 'right':
      if (onSwipeRight) onSwipeRight();
      break;
    case 'up':
      hideUI();
      if (onSwipeUp) onSwipeUp();
      break;
    case 'down':
      showUI();
      if (onSwipeDown) onSwipeDown();
      break;
  }
}

/**
 * Handle custom tap event from reader iframe
 */
function handleReaderTap() {
  toggleUI();
  if (onTap) onTap();
}

/**
 * Handle keyboard navigation
 * @param {KeyboardEvent} e
 */
function handleKeyDown(e) {
  // Only handle in reader view
  if (state.currentView !== 'reader') return;

  // Ignore if focused on input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      if (onSwipeRight) onSwipeRight(); // Right swipe = prev page
      break;

    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      e.preventDefault();
      if (onSwipeLeft) onSwipeLeft(); // Left swipe = next page
      break;

    case 'ArrowUp':
      e.preventDefault();
      showUI();
      break;

    case 'ArrowDown':
      e.preventDefault();
      hideUI();
      break;

    case 'Escape':
      e.preventDefault();
      if (state.uiHidden) {
        showUI();
      }
      break;

    case 'f':
    case 'F':
      // Toggle fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      break;
  }
}

/**
 * Handle mouse movement to show UI
 */
let mouseTimer = null;

function handleMouseMove() {
  // Only relevant in reader view with hidden UI
  if (state.currentView !== 'reader') return;

  // Show UI on mouse movement
  if (state.uiHidden) {
    showUI();
  }

  // Auto-hide after inactivity (optional)
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => {
    // Could auto-hide here if desired
    // hideUI();
  }, 3000);
}

/**
 * Update gesture callbacks
 * @param {Object} callbacks - New callbacks
 */
export function updateCallbacks(callbacks) {
  if (callbacks.onSwipeLeft !== undefined) onSwipeLeft = callbacks.onSwipeLeft;
  if (callbacks.onSwipeRight !== undefined) onSwipeRight = callbacks.onSwipeRight;
  if (callbacks.onSwipeUp !== undefined) onSwipeUp = callbacks.onSwipeUp;
  if (callbacks.onSwipeDown !== undefined) onSwipeDown = callbacks.onSwipeDown;
  if (callbacks.onTap !== undefined) onTap = callbacks.onTap;
  if (callbacks.onSelectionStart !== undefined) onSelectionStart = callbacks.onSelectionStart;
  if (callbacks.onSelectionEnd !== undefined) onSelectionEnd = callbacks.onSelectionEnd;
}

/**
 * Check if currently in selection mode
 * @returns {boolean}
 */
export function isInSelectionMode() {
  return isSelectionMode;
}

/**
 * Clean up gesture handling
 */
export function destroyGestures() {
  const reader = document.getElementById('reader');
  if (reader) {
    reader.removeEventListener('touchstart', handleTouchStart);
    reader.removeEventListener('touchmove', handleTouchMove);
    reader.removeEventListener('touchend', handleTouchEnd);
    reader.removeEventListener('touchcancel', handleTouchCancel);
  }

  document.removeEventListener('reader-swipe', handleReaderSwipe);
  document.removeEventListener('reader-tap', handleReaderTap);
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('mousemove', handleMouseMove);

  clearTimeout(mouseTimer);
  clearTimeout(longPressTimer);
  isSelectionMode = false;
  resetTouch();
}
