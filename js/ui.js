/**
 * FlashReader Pro - UI State Management
 * Handles state and DOM updates
 */

// ========================================
// DOM Element References (Lazy-loaded)
// ========================================

let _elements = null;

export function getElements() {
  if (_elements) return _elements;

  _elements = {
    // Views
    libraryView: document.getElementById('library-view'),
    readerView: document.getElementById('reader-view'),

    // Library
    bookGrid: document.getElementById('book-grid'),
    emptyState: document.getElementById('empty-state'),
    fileInput: document.getElementById('file-input'),
    themeToggleLib: document.getElementById('theme-toggle-lib'),

    // Reader header
    header: document.getElementById('header'),
    backToLibrary: document.getElementById('back-to-library'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    bookTitle: document.getElementById('book-title'),
    bookAuthor: document.getElementById('book-author'),

    // Controls
    fontControls: document.getElementById('font-controls'),
    fontDecrease: document.getElementById('font-decrease'),
    fontLevel: document.getElementById('font-level'),
    fontIncrease: document.getElementById('font-increase'),
    zoomControls: document.getElementById('zoom-controls'),
    zoomOut: document.getElementById('zoom-out'),
    zoomLevel: document.getElementById('zoom-level'),
    zoomIn: document.getElementById('zoom-in'),
    themeToggle: document.getElementById('theme-toggle'),
    bookmarkBtn: document.getElementById('bookmark-btn'),

    // Sidebar
    sidebar: document.getElementById('sidebar'),
    chapterCount: document.getElementById('chapter-count'),
    tocList: document.getElementById('toc-list'),
    bookmarkCount: document.getElementById('bookmark-count'),
    bookmarkList: document.getElementById('bookmark-list'),

    // Reader
    reader: document.getElementById('reader'),
    loadingScreen: document.getElementById('loading-screen'),
    loadStatus: document.getElementById('load-status'),
    loadProgress: document.getElementById('load-progress'),
    errorScreen: document.getElementById('error-screen'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    viewerContainer: document.getElementById('viewer-container'),

    // Page navigation
    pageNav: document.getElementById('page-nav'),
    prevPage: document.getElementById('prev-page'),
    currentPage: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    nextPage: document.getElementById('next-page'),

    // Dialog
    confirmDialog: document.getElementById('confirm-dialog'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogMessage: document.getElementById('dialog-message'),
    dialogCancel: document.getElementById('dialog-cancel'),
    dialogConfirm: document.getElementById('dialog-confirm')
  };

  return _elements;
}

// For backwards compatibility - proxy that calls getElements()
export const elements = new Proxy({}, {
  get(target, prop) {
    return getElements()[prop];
  }
});

// ========================================
// Application State
// ========================================

export const state = {
  // View
  currentView: 'library', // 'library' | 'reader'

  // Theme
  theme: localStorage.getItem('flashreader-theme') || 'light',

  // Reader settings
  fontSize: parseInt(localStorage.getItem('flashreader-fontSize') || '100', 10),
  zoom: parseFloat(localStorage.getItem('flashreader-zoom') || '1.0'),

  // UI state
  sidebarOpen: false,
  uiHidden: false,

  // Book state
  bookState: 'idle', // 'idle' | 'loading' | 'reading' | 'error'
  fileType: null,    // 'epub' | 'pdf'
  currentBookId: null,

  // Loading
  loadStatus: '',
  loadPercent: 0,

  // Book data
  metadata: null,
  chapters: [],
  bookmarks: [],
  currentPage: 1,
  totalPages: 0,
  currentCfi: null,
  error: null
};

// State change listeners
const listeners = new Set();

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Update state and notify listeners
 * @param {Object} updates - State updates
 */
export function updateState(updates) {
  const prevState = { ...state };
  Object.assign(state, updates);

  // Notify listeners
  listeners.forEach(listener => {
    try {
      listener(state, prevState);
    } catch (error) {
      console.error('State listener error:', error);
    }
  });

  // Render UI changes
  render(state, prevState);
}

// ========================================
// UI Rendering
// ========================================

/**
 * Main render function - updates DOM based on state changes
 * @param {Object} current - Current state
 * @param {Object} prev - Previous state
 */
function render(current, prev) {
  const els = getElements();

  // Theme
  if (current.theme !== prev.theme) {
    document.body.dataset.theme = current.theme;
    localStorage.setItem('flashreader-theme', current.theme);
  }

  // View switching
  if (current.currentView !== prev.currentView) {
    if (current.currentView === 'library') {
      els.libraryView.hidden = false;
      els.readerView.hidden = true;
    } else {
      els.libraryView.hidden = true;
      els.readerView.hidden = false;
    }
    document.body.dataset.view = current.currentView;
  }

  // Sidebar
  if (current.sidebarOpen !== prev.sidebarOpen) {
    els.sidebar.classList.toggle('sidebar--open', current.sidebarOpen);
  }

  // UI visibility (immersive mode)
  if (current.uiHidden !== prev.uiHidden) {
    document.body.dataset.uiHidden = current.uiHidden;
  }

  // Book state
  if (current.bookState !== prev.bookState) {
    els.loadingScreen.hidden = current.bookState !== 'loading';
    els.errorScreen.hidden = current.bookState !== 'error';
  }

  // Loading progress
  if (current.loadStatus !== prev.loadStatus) {
    els.loadStatus.textContent = current.loadStatus;
  }
  if (current.loadPercent !== prev.loadPercent) {
    els.loadProgress.value = current.loadPercent;
  }

  // Error
  if (current.error !== prev.error && current.error) {
    els.errorMessage.textContent = current.error;
  }

  // File type (show appropriate controls)
  if (current.fileType !== prev.fileType) {
    els.fontControls.hidden = current.fileType !== 'epub';
    els.zoomControls.hidden = current.fileType !== 'pdf';
    els.reader.classList.toggle('reader--pdf', current.fileType === 'pdf');
  }

  // Font size
  if (current.fontSize !== prev.fontSize) {
    els.fontLevel.textContent = `${current.fontSize}%`;
    localStorage.setItem('flashreader-fontSize', current.fontSize);
  }

  // Zoom
  if (current.zoom !== prev.zoom) {
    els.zoomLevel.textContent = `${Math.round(current.zoom * 100)}%`;
    localStorage.setItem('flashreader-zoom', current.zoom);
  }

  // Metadata
  if (current.metadata !== prev.metadata && current.metadata) {
    els.bookTitle.textContent = current.metadata.title || 'Untitled';
    els.bookAuthor.textContent = current.metadata.author || 'Unknown';
  }

  // Page info
  if (current.currentPage !== prev.currentPage) {
    els.currentPage.textContent = current.currentPage;
  }
  if (current.totalPages !== prev.totalPages) {
    els.totalPages.textContent = current.totalPages || '?';
  }

  // Chapters
  if (current.chapters !== prev.chapters) {
    renderChapters(current.chapters);
  }

  // Bookmarks
  if (current.bookmarks !== prev.bookmarks) {
    renderBookmarks(current.bookmarks);
  }
}

/**
 * Render table of contents
 * @param {Array} chapters - Array of chapter objects
 */
function renderChapters(chapters) {
  const els = getElements();
  els.chapterCount.textContent = chapters.length;
  els.tocList.innerHTML = '';

  chapters.forEach((chapter, index) => {
    const btn = document.createElement('button');
    btn.dataset.href = chapter.href || '';
    btn.dataset.index = chapter.index || index;
    btn.innerHTML = `
      <span>${String(index + 1).padStart(2, '0')}</span>
      <span>${chapter.label || `Chapter ${index + 1}`}</span>
    `;
    els.tocList.appendChild(btn);
  });
}

/**
 * Render bookmarks list
 * @param {Array} bookmarks - Array of bookmark objects
 */
function renderBookmarks(bookmarks) {
  const els = getElements();
  els.bookmarkCount.textContent = bookmarks.length;
  els.bookmarkList.innerHTML = '';

  if (bookmarks.length === 0) {
    const li = document.createElement('li');
    li.style.color = 'var(--text-muted)';
    li.style.fontSize = '0.75rem';
    li.style.textAlign = 'center';
    li.style.padding = '1rem';
    li.textContent = 'No bookmarks yet';
    els.bookmarkList.appendChild(li);
    return;
  }

  bookmarks.forEach(bookmark => {
    const li = document.createElement('li');
    li.dataset.id = bookmark.id;
    li.dataset.cfi = bookmark.cfi || '';
    li.dataset.page = bookmark.pageNumber || '';
    li.innerHTML = `
      <span>${bookmark.label}</span>
      <button aria-label="Delete bookmark" title="Delete bookmark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    els.bookmarkList.appendChild(li);
  });
}

// ========================================
// UI Actions
// ========================================

/**
 * Toggle theme
 */
export function toggleTheme() {
  updateState({
    theme: state.theme === 'light' ? 'dark' : 'light'
  });
}

/**
 * Toggle sidebar
 */
export function toggleSidebar() {
  updateState({
    sidebarOpen: !state.sidebarOpen
  });
}

/**
 * Toggle UI visibility (immersive mode)
 * @param {boolean|null} forceValue - Force a specific value, or toggle if null
 */
export function toggleUI(forceValue = null) {
  updateState({
    uiHidden: forceValue !== null ? forceValue : !state.uiHidden
  });
}

/**
 * Show UI (exit immersive mode)
 */
export function showUI() {
  updateState({ uiHidden: false });
}

/**
 * Hide UI (enter immersive mode)
 */
export function hideUI() {
  updateState({ uiHidden: true });
}

/**
 * Switch to library view
 */
export function showLibrary() {
  updateState({
    currentView: 'library',
    bookState: 'idle',
    sidebarOpen: false,
    uiHidden: false
  });
}

/**
 * Switch to reader view
 */
export function showReader() {
  updateState({
    currentView: 'reader'
  });
}

/**
 * Set loading state
 * @param {string} status - Loading status message
 * @param {number} percent - Loading percentage (0-100)
 */
export function setLoading(status, percent = 0) {
  updateState({
    currentView: 'reader',
    bookState: 'loading',
    loadStatus: status,
    loadPercent: percent
  });
}

/**
 * Set error state
 * @param {string} message - Error message
 */
export function setError(message) {
  updateState({
    bookState: 'error',
    error: message
  });
}

/**
 * Set reading state with book data
 * @param {Object} data - Book data
 */
export function setReading(data) {
  updateState({
    bookState: 'reading',
    currentView: 'reader',
    ...data
  });
}

/**
 * Update font size
 * @param {number} delta - Change amount
 */
export function changeFontSize(delta) {
  const newSize = Math.max(50, Math.min(300, state.fontSize + delta));
  updateState({ fontSize: newSize });
}

/**
 * Update zoom level
 * @param {number} delta - Change amount
 */
export function changeZoom(delta) {
  const newZoom = Math.max(0.5, Math.min(3, state.zoom + delta));
  updateState({ zoom: newZoom });
}

/**
 * Update page info
 * @param {number} current - Current page
 * @param {number} total - Total pages
 * @param {string} cfi - Current CFI (for EPUB)
 */
export function updatePageInfo(current, total, cfi = null) {
  updateState({
    currentPage: current,
    totalPages: total,
    currentCfi: cfi
  });
}

// ========================================
// Dialog
// ========================================

let dialogResolve = null;

/**
 * Show confirmation dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} confirmText - Confirm button text
 * @returns {Promise<boolean>} Whether user confirmed
 */
export function showConfirmDialog(title, message, confirmText = 'Confirm') {
  const els = getElements();
  els.dialogTitle.textContent = title;
  els.dialogMessage.textContent = message;
  els.dialogConfirm.textContent = confirmText;
  els.confirmDialog.showModal();

  return new Promise(resolve => {
    dialogResolve = resolve;
  });
}

/**
 * Close dialog with result
 * @param {boolean} confirmed - Whether user confirmed
 */
export function closeDialog(confirmed) {
  const els = getElements();
  els.confirmDialog.close();
  if (dialogResolve) {
    dialogResolve(confirmed);
    dialogResolve = null;
  }
}

// ========================================
// Initialize
// ========================================

/**
 * Initialize UI with stored preferences
 */
export function initUI() {
  const els = getElements();

  // Apply stored theme
  document.body.dataset.theme = state.theme;

  // Apply font size
  if (els.fontLevel) {
    els.fontLevel.textContent = `${state.fontSize}%`;
  }

  // Apply zoom
  if (els.zoomLevel) {
    els.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  // Setup dialog event listeners
  els.dialogCancel?.addEventListener('click', () => closeDialog(false));
  els.dialogConfirm?.addEventListener('click', () => closeDialog(true));
  els.confirmDialog?.addEventListener('cancel', () => closeDialog(false));
}
