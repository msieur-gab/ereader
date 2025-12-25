/**
 * FlashReader Pro - Main Application
 * Entry point that coordinates all modules
 */

// Import modules
import './components/book-card.js';
import * as storage from './storage.js';
import * as ui from './ui.js';
import * as epubReader from './reader-epub.js';
import * as pdfReader from './reader-pdf.js';
import { initGestures, updateCallbacks } from './gestures.js';

// ========================================
// Application State
// ========================================

let currentBookId = null;

// Highlight menu state
let activeHighlightId = null;
let activeHighlightCfi = null;
const DEFAULT_HIGHLIGHT_COLOR = '#ffeb3b';

// ========================================
// Library Functions
// ========================================

/**
 * Load and display all books in the library
 */
async function loadLibrary() {
  try {
    const books = await storage.getAllBooks();
    const grid = ui.elements.bookGrid;

    // Clear existing cards
    grid.innerHTML = '';

    if (books.length === 0) {
      ui.elements.emptyState.hidden = false;
      return;
    }

    ui.elements.emptyState.hidden = true;

    // Create book cards
    books.forEach(book => {
      const card = document.createElement('book-card');
      card.setAttribute('book-id', book.id);
      card.setAttribute('title', book.title);
      card.setAttribute('author', book.author);
      card.setAttribute('type', book.fileType);
      card.setAttribute('progress', book.progress || 0);
      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading library:', error);
  }
}

/**
 * Handle file input change
 * @param {Event} e - Change event
 */
async function handleFileInput(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Reset input so same file can be selected again
  e.target.value = '';

  try {
    ui.setLoading('Reading file...', 0);

    // Determine file type
    const isEpub = file.name.toLowerCase().endsWith('.epub');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    if (!isEpub && !isPdf) {
      ui.setError('Please select an EPUB or PDF file');
      return;
    }

    ui.setLoading('Processing book...', 30);

    // Add book to storage
    const bookId = await storage.addBook(file);

    ui.setLoading('Saving to library...', 70);

    // Reload library
    await loadLibrary();

    ui.setLoading('Opening book...', 90);

    // Open the book
    await openBook(bookId);
  } catch (error) {
    console.error('Error adding book:', error);
    ui.setError('Failed to add book: ' + error.message);
  }
}

/**
 * Open a book for reading
 * @param {number} bookId - Book ID
 */
async function openBook(bookId) {
  try {
    ui.setLoading('Loading book...', 10);

    // Get book from storage
    const book = await storage.getBook(bookId);
    currentBookId = bookId;

    ui.setLoading('Parsing content...', 40);

    // Get saved progress
    const progress = await storage.getProgress(bookId);

    // Initialize appropriate reader
    let result;
    if (book.fileType === 'epub') {
      ui.updateState({ fileType: 'epub' });
      result = await epubReader.initEpub(book.data, {
        cfi: progress?.cfi,
        onNavigate: handleNavigation
      });

      // Apply saved theme and font size
      epubReader.applyTheme({
        theme: ui.state.theme,
        fontSize: ui.state.fontSize
      });
    } else {
      ui.updateState({ fileType: 'pdf' });
      result = await pdfReader.initPdf(book.data, {
        pageNumber: progress?.currentPage,
        onNavigate: handleNavigation
      });
    }

    ui.setLoading('Loading chapters...', 80);

    // Get bookmarks
    const bookmarks = await storage.getBookmarks(bookId);

    // Update UI state
    ui.setReading({
      metadata: result.metadata,
      chapters: result.chapters,
      bookmarks,
      totalPages: result.totalPages || 0,
      currentPage: progress?.currentPage || 1,
      currentBookId: bookId
    });

    // Setup gestures
    setupReaderGestures();

    // Load highlights for EPUB books
    if (book.fileType === 'epub') {
      await loadBookHighlights();
    }

  } catch (error) {
    console.error('Error opening book:', error);
    ui.setError('Failed to open book: ' + error.message);
  }
}

/**
 * Handle navigation events from readers
 * @param {Object} data - Navigation data
 */
async function handleNavigation(data) {
  if (!currentBookId) return;

  // Save progress
  await storage.saveProgress(currentBookId, {
    currentPage: data.currentPage,
    totalPages: data.totalPages,
    cfi: data.cfi
  });
}

/**
 * Delete a book
 * @param {number} bookId - Book ID
 * @param {string} title - Book title
 */
async function deleteBook(bookId, title) {
  const confirmed = await ui.showConfirmDialog(
    'Delete Book',
    `Are you sure you want to delete "${title}"? This cannot be undone.`,
    'Delete'
  );

  if (confirmed) {
    try {
      await storage.deleteBook(bookId);
      await loadLibrary();
    } catch (error) {
      console.error('Error deleting book:', error);
    }
  }
}

/**
 * Go back to library from reader
 */
function backToLibrary() {
  // Destroy current reader
  if (ui.state.fileType === 'epub') {
    epubReader.destroy();
  } else {
    pdfReader.destroy();
  }

  currentBookId = null;
  ui.showLibrary();
  loadLibrary();
}

// ========================================
// Reader Functions
// ========================================

/**
 * Setup gesture callbacks for reader
 */
function setupReaderGestures() {
  updateCallbacks({
    onSwipeLeft: () => navigateNext(),
    onSwipeRight: () => navigatePrev(),
    onSelectionStart: handleSelectionStart,
    onSelectionEnd: handleSelectionEnd
  });
}

/**
 * Navigate to next page
 */
function navigateNext() {
  if (ui.state.fileType === 'epub') {
    epubReader.next();
  } else {
    pdfReader.next();
  }
}

/**
 * Navigate to previous page
 */
function navigatePrev() {
  if (ui.state.fileType === 'epub') {
    epubReader.prev();
  } else {
    pdfReader.prev();
  }
}

/**
 * Navigate to chapter
 * @param {string|number} target - Chapter href or page number
 */
function navigateToChapter(target) {
  if (ui.state.fileType === 'epub') {
    epubReader.goToChapter(target);
  } else {
    pdfReader.goToPage(parseInt(target, 10));
  }
  ui.updateState({ sidebarOpen: false });
}

/**
 * Toggle bookmark at current location
 */
async function toggleBookmark() {
  if (!currentBookId) return;

  const location = {
    cfi: ui.state.currentCfi,
    pageNumber: ui.state.currentPage
  };

  // Check if already bookmarked
  const existing = await storage.findBookmark(currentBookId, location);

  if (existing) {
    await storage.deleteBookmark(existing.id);
  } else {
    await storage.addBookmark(currentBookId, location, `Page ${ui.state.currentPage}`);
  }

  // Refresh bookmarks
  const bookmarks = await storage.getBookmarks(currentBookId);
  ui.updateState({ bookmarks });
}

/**
 * Navigate to bookmark
 * @param {Object} bookmark - Bookmark data
 */
function goToBookmark(bookmark) {
  if (bookmark.cfi) {
    epubReader.goTo(bookmark.cfi);
  } else if (bookmark.pageNumber) {
    pdfReader.goToPage(bookmark.pageNumber);
  }
  ui.updateState({ sidebarOpen: false });
}

/**
 * Delete bookmark
 * @param {number} bookmarkId - Bookmark ID
 */
async function deleteBookmarkById(bookmarkId) {
  await storage.deleteBookmark(bookmarkId);
  const bookmarks = await storage.getBookmarks(currentBookId);
  ui.updateState({ bookmarks });
}

/**
 * Change font size (EPUB only)
 * @param {number} delta - Change amount
 */
function changeFontSize(delta) {
  ui.changeFontSize(delta);
  if (ui.state.fileType === 'epub') {
    epubReader.setFontSize(ui.state.fontSize);
  }
}

/**
 * Change zoom (PDF only)
 * @param {number} delta - Change amount
 */
function changeZoom(delta) {
  ui.changeZoom(delta);
  if (ui.state.fileType === 'pdf') {
    pdfReader.setZoom(ui.state.zoom);
  }
}

// ========================================
// Theme Handling
// ========================================

/**
 * Handle theme change
 */
function handleThemeChange() {
  ui.toggleTheme();

  // Update reader theme if active
  if (ui.state.bookState === 'reading') {
    if (ui.state.fileType === 'epub') {
      epubReader.setTheme(ui.state.theme);
    } else {
      // PDF uses CSS filter, will auto-update
      pdfReader.renderPage(pdfReader.getCurrentPage());
    }
  }
}

// ========================================
// Highlighting Functions
// ========================================

/**
 * Handle selection mode start (long press detected)
 */
function handleSelectionStart() {
  if (ui.state.fileType !== 'epub') return;

  // Enable text selection in EPUB iframe
  epubReader.enableTextSelection();
}

/**
 * Handle selection mode end (finger lifted after long press)
 */
async function handleSelectionEnd() {
  if (ui.state.fileType !== 'epub') return;

  // Get the current selection
  const text = epubReader.getSelectedText();
  const cfiRange = epubReader.getCfiFromSelection();

  // Disable text selection
  epubReader.disableTextSelection();

  // If we have a valid selection, create a highlight
  if (text && cfiRange && currentBookId) {
    try {
      // Save highlight to storage
      const id = await storage.addHighlight(currentBookId, cfiRange, text, DEFAULT_HIGHLIGHT_COLOR);

      // Apply highlight visually
      epubReader.applyHighlight(cfiRange, DEFAULT_HIGHLIGHT_COLOR, id, handleHighlightClick);

      // Clear the selection
      epubReader.clearSelection();
    } catch (error) {
      console.error('Error creating highlight:', error);
    }
  }
}

/**
 * Handle click on an existing highlight
 * @param {Event} e - Click event
 * @param {number} id - Highlight ID
 * @param {string} cfiRange - CFI range
 */
function handleHighlightClick(e, id, cfiRange) {
  e.stopPropagation();

  activeHighlightId = id;
  activeHighlightCfi = cfiRange;

  // Position and show the highlight menu
  const menu = document.getElementById('highlight-menu');
  if (!menu) return;

  // Position near the click
  const x = e.clientX || (e.touches?.[0]?.clientX) || window.innerWidth / 2;
  const y = e.clientY || (e.touches?.[0]?.clientY) || 100;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;

  // Update active color indicator
  updateHighlightMenuActiveColor();
}

/**
 * Update the active color indicator in the highlight menu
 */
async function updateHighlightMenuActiveColor() {
  if (!activeHighlightId) return;

  const highlights = await storage.getHighlights(currentBookId);
  const highlight = highlights.find(h => h.id === activeHighlightId);
  if (!highlight) return;

  const menu = document.getElementById('highlight-menu');
  const colorButtons = menu?.querySelectorAll('.highlight-menu__colors button');
  colorButtons?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === highlight.color);
  });
}

/**
 * Hide the highlight menu
 */
function hideHighlightMenu() {
  const menu = document.getElementById('highlight-menu');
  if (menu) {
    menu.hidden = true;
  }
  activeHighlightId = null;
  activeHighlightCfi = null;
}

/**
 * Change highlight color
 * @param {string} color - New color
 */
async function changeHighlightColor(color) {
  if (!activeHighlightId || !activeHighlightCfi) return;

  try {
    // Update in storage
    await storage.updateHighlight(activeHighlightId, { color });

    // Remove old highlight and reapply with new color
    epubReader.removeHighlight(activeHighlightCfi);
    epubReader.applyHighlight(activeHighlightCfi, color, activeHighlightId, handleHighlightClick);

    // Update active indicator
    updateHighlightMenuActiveColor();
  } catch (error) {
    console.error('Error changing highlight color:', error);
  }
}

/**
 * Delete the currently selected highlight
 */
async function deleteActiveHighlight() {
  if (!activeHighlightId || !activeHighlightCfi) return;

  try {
    // Remove from storage
    await storage.deleteHighlight(activeHighlightId);

    // Remove visual highlight
    epubReader.removeHighlight(activeHighlightCfi);

    // Hide menu
    hideHighlightMenu();
  } catch (error) {
    console.error('Error deleting highlight:', error);
  }
}

/**
 * Load and apply highlights for the current book
 */
async function loadBookHighlights() {
  if (!currentBookId || ui.state.fileType !== 'epub') return;

  try {
    const highlights = await storage.getHighlights(currentBookId);
    epubReader.loadHighlights(highlights, handleHighlightClick);
  } catch (error) {
    console.error('Error loading highlights:', error);
  }
}

// ========================================
// Event Listeners
// ========================================

function setupEventListeners() {
  // File input
  ui.elements.fileInput?.addEventListener('change', handleFileInput);

  // Theme toggles
  ui.elements.themeToggleLib?.addEventListener('click', handleThemeChange);
  ui.elements.themeToggle?.addEventListener('click', handleThemeChange);

  // Back to library
  ui.elements.backToLibrary?.addEventListener('click', backToLibrary);

  // Sidebar toggle
  ui.elements.sidebarToggle?.addEventListener('click', ui.toggleSidebar);

  // Font size controls
  ui.elements.fontDecrease?.addEventListener('click', () => changeFontSize(-10));
  ui.elements.fontIncrease?.addEventListener('click', () => changeFontSize(10));

  // Zoom controls
  ui.elements.zoomOut?.addEventListener('click', () => changeZoom(-0.1));
  ui.elements.zoomIn?.addEventListener('click', () => changeZoom(0.1));

  // Bookmark button
  ui.elements.bookmarkBtn?.addEventListener('click', toggleBookmark);

  // Page navigation
  ui.elements.prevPage?.addEventListener('click', navigatePrev);
  ui.elements.nextPage?.addEventListener('click', navigateNext);

  // Retry button
  ui.elements.retryBtn?.addEventListener('click', () => {
    if (currentBookId) {
      openBook(currentBookId);
    } else {
      backToLibrary();
    }
  });

  // Book card events (delegated)
  document.addEventListener('book-open', (e) => {
    openBook(e.detail.id);
  });

  document.addEventListener('book-delete', (e) => {
    deleteBook(e.detail.id, e.detail.title);
  });

  // Chapter navigation (delegated)
  ui.elements.tocList?.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) {
      const href = button.dataset.href;
      const index = button.dataset.index;
      navigateToChapter(href || index);
    }
  });

  // Bookmark list events (delegated)
  ui.elements.bookmarkList?.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;

    const deleteBtn = e.target.closest('button');
    if (deleteBtn) {
      // Delete bookmark
      deleteBookmarkById(parseInt(li.dataset.id, 10));
    } else {
      // Go to bookmark
      goToBookmark({
        cfi: li.dataset.cfi || null,
        pageNumber: li.dataset.page ? parseInt(li.dataset.page, 10) : null
      });
    }
  });

  // Highlight menu events
  const highlightMenu = document.getElementById('highlight-menu');
  const highlightColors = highlightMenu?.querySelector('.highlight-menu__colors');
  const highlightDelete = document.getElementById('highlight-delete');

  // Color selection
  highlightColors?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn?.dataset.color) {
      changeHighlightColor(btn.dataset.color);
    }
  });

  // Delete highlight
  highlightDelete?.addEventListener('click', () => {
    deleteActiveHighlight();
  });

  // Hide menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('highlight-menu');
    if (menu && !menu.hidden && !menu.contains(e.target)) {
      hideHighlightMenu();
    }
  });
}

// ========================================
// Initialization
// ========================================

async function init() {
  console.log('FlashReader Pro initializing...');

  // Initialize UI
  ui.initUI();

  // Request persistent storage
  try {
    await storage.requestPersistentStorage();
  } catch (error) {
    console.warn('Persistent storage not available');
  }

  // Setup event listeners
  setupEventListeners();

  // Initialize gestures
  initGestures();

  // Load library
  await loadLibrary();

  console.log('FlashReader Pro ready!');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
