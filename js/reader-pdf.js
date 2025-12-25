/**
 * FlashReader Pro - PDF Reader Module
 * Uses PDF.js for rendering PDF files
 */

import { elements, state, updatePageInfo } from './ui.js';

// PDF.js instance
let pdfDoc = null;
let currentPageNum = 1;
let isRendering = false;
let pendingPage = null;

// Event callbacks
let onNavigate = null;

/**
 * Initialize PDF.js worker
 */
function initWorker() {
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

/**
 * Initialize PDF reader with document data
 * @param {ArrayBuffer} data - PDF file data
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Document metadata and chapters
 */
export async function initPdf(data, options = {}) {
  // Destroy previous instance
  destroy();

  // Initialize worker
  initWorker();

  // Load PDF document
  const loadingTask = window.pdfjsLib.getDocument({ data });
  pdfDoc = await loadingTask.promise;

  // Set up navigation callback
  onNavigate = options.onNavigate;

  // Get metadata
  const metadata = await pdfDoc.getMetadata().catch(() => ({}));

  // Create chapters (one per page)
  const chapters = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    chapters.push({
      label: `Page ${i}`,
      index: i
    });
  }

  // Render initial page
  const startPage = options.pageNumber || 1;
  await renderPage(startPage);

  return {
    metadata: {
      title: metadata.info?.Title || 'PDF Document',
      author: metadata.info?.Author || 'Unknown'
    },
    chapters,
    totalPages: pdfDoc.numPages
  };
}

/**
 * Render a specific page
 * @param {number} pageNum - Page number to render
 */
export async function renderPage(pageNum) {
  if (!pdfDoc) return;

  // Validate page number
  pageNum = Math.max(1, Math.min(pageNum, pdfDoc.numPages));

  // If currently rendering, queue this page
  if (isRendering) {
    pendingPage = pageNum;
    return;
  }

  isRendering = true;
  currentPageNum = pageNum;

  try {
    // Get page
    const page = await pdfDoc.getPage(pageNum);

    // Calculate scale based on zoom and container
    const containerWidth = elements.viewerContainer.clientWidth - 32; // padding
    const viewport = page.getViewport({ scale: 1 });
    const baseScale = containerWidth / viewport.width;
    const scale = baseScale * state.zoom;
    const scaledViewport = page.getViewport({ scale });

    // Clear container and create canvas
    elements.viewerContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';

    elements.viewerContainer.appendChild(canvas);

    // Render page
    await page.render({
      canvasContext: context,
      viewport: scaledViewport
    }).promise;

    // Update page info
    updatePageInfo(pageNum, pdfDoc.numPages);

    // Notify callback
    if (onNavigate) {
      onNavigate({
        currentPage: pageNum,
        totalPages: pdfDoc.numPages
      });
    }
  } catch (error) {
    console.error('Error rendering PDF page:', error);
  } finally {
    isRendering = false;

    // Render pending page if any
    if (pendingPage !== null) {
      const nextPage = pendingPage;
      pendingPage = null;
      await renderPage(nextPage);
    }
  }
}

/**
 * Navigate to next page
 */
export function next() {
  if (pdfDoc && currentPageNum < pdfDoc.numPages) {
    renderPage(currentPageNum + 1);
  }
}

/**
 * Navigate to previous page
 */
export function prev() {
  if (pdfDoc && currentPageNum > 1) {
    renderPage(currentPageNum - 1);
  }
}

/**
 * Navigate to a specific page
 * @param {number} pageNum - Page number
 */
export function goToPage(pageNum) {
  if (pdfDoc) {
    renderPage(pageNum);
  }
}

/**
 * Update zoom and re-render
 * @param {number} zoom - Zoom level
 */
export function setZoom(zoom) {
  if (pdfDoc) {
    renderPage(currentPageNum);
  }
}

/**
 * Get current page number
 * @returns {number}
 */
export function getCurrentPage() {
  return currentPageNum;
}

/**
 * Get total pages
 * @returns {number}
 */
export function getTotalPages() {
  return pdfDoc?.numPages || 0;
}

/**
 * Get current progress percentage
 * @returns {number}
 */
export function getProgress() {
  if (!pdfDoc) return 0;
  return Math.round((currentPageNum / pdfDoc.numPages) * 100);
}

/**
 * Search text in document
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
export async function searchText(query) {
  if (!pdfDoc || !query) return [];

  const results = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');

      if (text.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          page: i,
          text: text.substring(0, 200) + '...'
        });
      }
    } catch (error) {
      console.warn(`Error searching page ${i}:`, error);
    }
  }

  return results;
}

/**
 * Get page text content
 * @param {number} pageNum - Page number
 * @returns {Promise<string>}
 */
export async function getPageText(pageNum) {
  if (!pdfDoc) return '';

  try {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    return textContent.items.map(item => item.str).join(' ');
  } catch (error) {
    console.error('Error getting page text:', error);
    return '';
  }
}

/**
 * Destroy the current document instance
 */
export function destroy() {
  if (pdfDoc) {
    pdfDoc.destroy();
    pdfDoc = null;
  }
  currentPageNum = 1;
  isRendering = false;
  pendingPage = null;
  onNavigate = null;

  // Clear container
  if (elements.viewerContainer) {
    elements.viewerContainer.innerHTML = '';
  }
}

/**
 * Check if a document is currently loaded
 * @returns {boolean}
 */
export function isLoaded() {
  return pdfDoc !== null;
}

// Export document reference for advanced usage
export function getDocument() {
  return pdfDoc;
}
