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
