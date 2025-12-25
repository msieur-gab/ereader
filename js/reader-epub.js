/**
 * FlashReader Pro - EPUB Reader Module
 * Uses epub.js for rendering EPUB files
 */

import { elements, updatePageInfo } from './ui.js';

// EPUB.js instances
let book = null;
let rendition = null;

// Event callbacks
let onNavigate = null;

/**
 * Initialize EPUB reader with book data
 * @param {ArrayBuffer} data - EPUB file data
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Book metadata and chapters
 */
export async function initEpub(data, options = {}) {
  // Destroy previous instance
  destroy();

  // Create book from array buffer
  book = window.ePub(data);

  // Wait for book to be ready
  await book.opened;

  // Create rendition
  rendition = book.renderTo(elements.viewerContainer, {
    width: '100%',
    height: '100%',
    flow: 'paginated',
    manager: 'default',
    spread: 'none'
  });

  // Apply theme
  applyTheme();

  // Set up navigation callback
  onNavigate = options.onNavigate;

  // Set up event listeners
  setupEventListeners();

  // Display book (restore position or start from beginning)
  if (options.cfi) {
    await rendition.display(options.cfi);
  } else {
    await rendition.display();
  }

  // Get metadata
  const metadata = await book.loaded.metadata;

  // Get navigation/chapters
  const navigation = await book.loaded.navigation;
  const chapters = navigation.toc.map((item, index) => ({
    label: item.label,
    href: item.href,
    index
  }));

  return {
    metadata: {
      title: metadata.title || 'Untitled',
      author: metadata.creator || 'Unknown Author'
    },
    chapters
  };
}

/**
 * Set up rendition event listeners
 */
function setupEventListeners() {
  if (!rendition) return;

  // Location changed
  rendition.on('relocated', (location) => {
    if (location.start?.displayed) {
      const currentPage = location.start.displayed.page || 1;
      const totalPages = location.start.displayed.total || 0;
      const cfi = location.start.cfi;

      updatePageInfo(currentPage, totalPages, cfi);

      if (onNavigate) {
        onNavigate({
          currentPage,
          totalPages,
          cfi
        });
      }
    }
  });

  // Handle touch events from iframe
  rendition.on('touchstart', handleTouchStart);
  rendition.on('touchend', handleTouchEnd);

  // Handle click events from iframe
  rendition.on('click', () => {
    // Dispatch to main document for gesture handling
    document.dispatchEvent(new CustomEvent('reader-tap'));
  });

  // Key events for navigation
  rendition.on('keydown', handleKeyDown);
}

// Touch tracking
let touchStartX = null;
let touchStartY = null;

function handleTouchStart(e) {
  touchStartX = e.changedTouches?.[0]?.clientX ?? null;
  touchStartY = e.changedTouches?.[0]?.clientY ?? null;
}

function handleTouchEnd(e) {
  if (touchStartX === null || touchStartY === null) return;

  const touchEndX = e.changedTouches?.[0]?.clientX ?? touchStartX;
  const touchEndY = e.changedTouches?.[0]?.clientY ?? touchStartY;

  const diffX = touchStartX - touchEndX;
  const diffY = touchStartY - touchEndY;
  const absX = Math.abs(diffX);
  const absY = Math.abs(diffY);

  // Dispatch custom gesture event
  if (absX > 40 || absY > 40) {
    if (absX > absY) {
      // Horizontal swipe
      document.dispatchEvent(new CustomEvent('reader-swipe', {
        detail: { direction: diffX > 0 ? 'left' : 'right' }
      }));
    } else {
      // Vertical swipe
      document.dispatchEvent(new CustomEvent('reader-swipe', {
        detail: { direction: diffY > 0 ? 'up' : 'down' }
      }));
    }
  } else {
    // Tap
    document.dispatchEvent(new CustomEvent('reader-tap'));
  }

  touchStartX = null;
  touchStartY = null;
}

function handleKeyDown(e) {
  switch (e.key) {
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      prev();
      break;
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      e.preventDefault();
      next();
      break;
  }
}

// Current settings (updated when applyTheme is called)
let currentFontSize = 100;
let currentTheme = 'light';

/**
 * Apply current theme to rendition
 * @param {Object} options - Optional theme/fontSize overrides
 */
export function applyTheme(options = {}) {
  if (!rendition) return;

  // Update current settings if provided
  if (options.theme !== undefined) currentTheme = options.theme;
  if (options.fontSize !== undefined) currentFontSize = options.fontSize;

  const isDark = currentTheme === 'dark';
  const bgColor = isDark ? '#1e293b' : '#ffffff';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';

  rendition.themes.register('custom', {
    'body': {
      'background-color': `${bgColor} !important`,
      'color': `${textColor} !important`,
      'font-size': `${currentFontSize}% !important`,
      'padding': '20px !important',
      'line-height': '1.6 !important'
    },
    'p': {
      'color': `${textColor} !important`
    },
    'h1, h2, h3, h4, h5, h6': {
      'color': `${textColor} !important`
    },
    'a': {
      'color': `${isDark ? '#818cf8' : '#4f46e5'} !important`
    },
    'img': {
      'max-width': '100% !important',
      'height': 'auto !important'
    }
  });

  rendition.themes.select('custom');
}

/**
 * Update font size
 * @param {number} fontSize - Font size percentage
 */
export function setFontSize(fontSize) {
  if (!rendition) return;
  applyTheme({ fontSize });
}

/**
 * Update theme
 * @param {string} theme - 'light' or 'dark'
 */
export function setTheme(theme) {
  if (!rendition) return;
  applyTheme({ theme });
}

/**
 * Navigate to next page
 */
export function next() {
  if (rendition) {
    rendition.next();
  }
}

/**
 * Navigate to previous page
 */
export function prev() {
  if (rendition) {
    rendition.prev();
  }
}

/**
 * Navigate to a specific location
 * @param {string} target - CFI string or href
 */
export function goTo(target) {
  if (rendition) {
    rendition.display(target);
  }
}

/**
 * Navigate to a specific chapter
 * @param {string} href - Chapter href
 */
export function goToChapter(href) {
  if (rendition && href) {
    rendition.display(href);
  }
}

/**
 * Get current location
 * @returns {Object|null} Current location info
 */
export function getCurrentLocation() {
  if (!rendition) return null;

  const location = rendition.currentLocation();
  if (!location?.start) return null;

  return {
    cfi: location.start.cfi,
    percentage: book ? book.locations.percentageFromCfi(location.start.cfi) : 0
  };
}

/**
 * Check if currently at a specific location
 * @param {string} cfi - CFI to check
 * @returns {boolean}
 */
export function isAtLocation(cfi) {
  const current = getCurrentLocation();
  return current?.cfi === cfi;
}

// ========================================
// Text Selection & Highlighting
// ========================================

// Track applied highlights
let appliedHighlights = [];

/**
 * Enable text selection in the EPUB iframe
 */
export function enableTextSelection() {
  if (!rendition) return;
  rendition.themes.override('user-select', 'text');
  rendition.themes.override('-webkit-user-select', 'text');
}

/**
 * Disable text selection in the EPUB iframe
 */
export function disableTextSelection() {
  if (!rendition) return;
  rendition.themes.override('user-select', 'none');
  rendition.themes.override('-webkit-user-select', 'none');
}

/**
 * Get the current selection from the EPUB iframe
 * @returns {Selection|null}
 */
export function getSelection() {
  if (!rendition) return null;
  const manager = rendition.manager;
  if (!manager) return null;

  // Get the iframe's window
  const views = manager.views?._views || [];
  for (const view of views) {
    if (view.window) {
      const selection = view.window.getSelection();
      if (selection && selection.toString().trim()) {
        return selection;
      }
    }
  }
  return null;
}

/**
 * Get the selected text
 * @returns {string}
 */
export function getSelectedText() {
  const selection = getSelection();
  return selection ? selection.toString().trim() : '';
}

/**
 * Get CFI range from current selection
 * @returns {string|null}
 */
export function getCfiFromSelection() {
  if (!rendition || !book) return null;

  const selection = getSelection();
  if (!selection || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!range || range.collapsed) return null;

  try {
    // Get the current section/view
    const manager = rendition.manager;
    const views = manager?.views?._views || [];

    for (const view of views) {
      if (view.window && view.window.getSelection()?.toString().trim()) {
        const section = view.section;
        if (section) {
          const cfiRange = section.cfiFromRange(range);
          return cfiRange;
        }
      }
    }
  } catch (error) {
    console.error('Error getting CFI from selection:', error);
  }

  return null;
}

/**
 * Clear any text selection in the iframe
 */
export function clearSelection() {
  if (!rendition) return;
  const manager = rendition.manager;
  if (!manager) return;

  const views = manager.views?._views || [];
  for (const view of views) {
    if (view.window) {
      view.window.getSelection()?.removeAllRanges();
    }
  }
}

/**
 * Apply a highlight to the rendition
 * @param {string} cfiRange - CFI range to highlight
 * @param {string} color - Highlight color (hex)
 * @param {number} id - Highlight ID from storage
 * @param {Function} onClick - Click callback
 */
export function applyHighlight(cfiRange, color, id, onClick = null) {
  if (!rendition) return;

  try {
    rendition.annotations.highlight(
      cfiRange,
      { id },
      (e) => {
        if (onClick) onClick(e, id, cfiRange);
      },
      'highlight',
      {
        fill: color,
        'fill-opacity': '0.4',
        'mix-blend-mode': 'multiply'
      }
    );

    appliedHighlights.push({ id, cfiRange });
  } catch (error) {
    console.error('Error applying highlight:', error);
  }
}

/**
 * Remove a highlight from the rendition
 * @param {string} cfiRange - CFI range of the highlight
 */
export function removeHighlight(cfiRange) {
  if (!rendition) return;

  try {
    rendition.annotations.remove(cfiRange, 'highlight');
    appliedHighlights = appliedHighlights.filter(h => h.cfiRange !== cfiRange);
  } catch (error) {
    console.error('Error removing highlight:', error);
  }
}

/**
 * Clear all highlights from the rendition
 */
export function clearHighlights() {
  if (!rendition) return;

  for (const h of appliedHighlights) {
    try {
      rendition.annotations.remove(h.cfiRange, 'highlight');
    } catch (error) {
      // Ignore errors when clearing
    }
  }
  appliedHighlights = [];
}

/**
 * Load and apply highlights from storage
 * @param {Array} highlights - Array of highlight objects
 * @param {Function} onClick - Click callback for highlights
 */
export function loadHighlights(highlights, onClick = null) {
  clearHighlights();

  for (const h of highlights) {
    applyHighlight(h.cfiRange, h.color, h.id, onClick);
  }
}

/**
 * Generate locations for progress tracking
 * @returns {Promise<void>}
 */
export async function generateLocations() {
  if (book && !book.locations.length()) {
    await book.locations.generate(1024);
  }
}

/**
 * Get total number of locations
 * @returns {number}
 */
export function getTotalLocations() {
  return book?.locations?.length() || 0;
}

/**
 * Destroy the current book instance
 */
export function destroy() {
  // Clear highlights first
  appliedHighlights = [];

  if (rendition) {
    rendition.destroy();
    rendition = null;
  }
  if (book) {
    book.destroy();
    book = null;
  }
  onNavigate = null;
  touchStartX = null;
  touchStartY = null;

  // Clear container
  if (elements.viewerContainer) {
    elements.viewerContainer.innerHTML = '';
  }
}

/**
 * Check if a book is currently loaded
 * @returns {boolean}
 */
export function isLoaded() {
  return book !== null && rendition !== null;
}

// Export book reference for advanced usage
export function getBook() {
  return book;
}

export function getRendition() {
  return rendition;
}
