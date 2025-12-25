/**
 * FlashReader Pro - Storage Module
 * Uses Dexie.js for metadata and OPFS for book files
 */

// Initialize Dexie database
const db = new Dexie('FlashReaderDB');

db.version(1).stores({
  books: '++id, title, author, fileType, fileName, fileSize, addedAt, lastReadAt',
  bookmarks: '++id, bookId, cfi, pageNumber, label, createdAt',
  readingProgress: 'bookId'
});

// ========================================
// OPFS (Origin Private File System) Helpers
// ========================================

/**
 * Get the books directory handle from OPFS
 * @param {boolean} create - Whether to create the directory if it doesn't exist
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getBooksDirectory(create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('books', { create });
}

/**
 * Save a book file to OPFS
 * @param {number} id - Book ID
 * @param {ArrayBuffer} data - File data
 * @param {string} ext - File extension (epub or pdf)
 */
async function saveBookFile(id, data, ext) {
  const booksDir = await getBooksDirectory(true);
  const fileName = `${id}.${ext}`;
  const fileHandle = await booksDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

/**
 * Get a book file from OPFS
 * @param {number} id - Book ID
 * @param {string} ext - File extension (epub or pdf)
 * @returns {Promise<ArrayBuffer>}
 */
async function getBookFile(id, ext) {
  try {
    const booksDir = await getBooksDirectory();
    const fileName = `${id}.${ext}`;
    const fileHandle = await booksDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch (error) {
    console.error('Error reading book file:', error);
    throw new Error('Book file not found');
  }
}

/**
 * Delete a book file from OPFS
 * @param {number} id - Book ID
 * @param {string} ext - File extension
 */
async function deleteBookFile(id, ext) {
  try {
    const booksDir = await getBooksDirectory();
    const fileName = `${id}.${ext}`;
    await booksDir.removeEntry(fileName);
  } catch (error) {
    console.warn('Could not delete book file:', error);
  }
}

// ========================================
// Book Operations
// ========================================

/**
 * Add a new book to the library
 * @param {File} file - The book file
 * @param {Object} metadata - Book metadata (title, author)
 * @returns {Promise<number>} The new book ID
 */
export async function addBook(file, metadata = {}) {
  const fileType = file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf';
  const data = await file.arrayBuffer();

  // Add metadata to database
  const id = await db.books.add({
    title: metadata.title || file.name.replace(/\.(epub|pdf)$/i, ''),
    author: metadata.author || 'Unknown Author',
    fileType,
    fileName: file.name,
    fileSize: file.size,
    addedAt: Date.now(),
    lastReadAt: null
  });

  // Save file to OPFS
  await saveBookFile(id, data, fileType);

  return id;
}

/**
 * Get all books from the library
 * @returns {Promise<Array>} Array of book metadata
 */
export async function getAllBooks() {
  const books = await db.books.orderBy('lastReadAt').reverse().toArray();

  // Get progress for each book
  const booksWithProgress = await Promise.all(
    books.map(async (book) => {
      const progress = await getProgress(book.id);
      return {
        ...book,
        progress: progress ? progress.percentage : 0
      };
    })
  );

  return booksWithProgress;
}

/**
 * Get a single book with its file data
 * @param {number} id - Book ID
 * @returns {Promise<Object>} Book metadata and file data
 */
export async function getBook(id) {
  const book = await db.books.get(id);
  if (!book) {
    throw new Error('Book not found');
  }

  const data = await getBookFile(id, book.fileType);

  // Update last read time
  await db.books.update(id, { lastReadAt: Date.now() });

  return { ...book, data };
}

/**
 * Update book metadata
 * @param {number} id - Book ID
 * @param {Object} updates - Fields to update
 */
export async function updateBook(id, updates) {
  await db.books.update(id, updates);
}

/**
 * Delete a book from the library
 * @param {number} id - Book ID
 */
export async function deleteBook(id) {
  const book = await db.books.get(id);
  if (!book) return;

  // Delete file from OPFS
  await deleteBookFile(id, book.fileType);

  // Delete from database
  await db.books.delete(id);

  // Delete associated bookmarks and progress
  await db.bookmarks.where('bookId').equals(id).delete();
  await db.readingProgress.delete(id);
}

// ========================================
// Bookmark Operations
// ========================================

/**
 * Add a bookmark
 * @param {number} bookId - Book ID
 * @param {Object} location - Bookmark location (cfi for EPUB, pageNumber for PDF)
 * @param {string} label - Optional label
 * @returns {Promise<number>} Bookmark ID
 */
export async function addBookmark(bookId, location, label = '') {
  return db.bookmarks.add({
    bookId,
    cfi: location.cfi || null,
    pageNumber: location.pageNumber || null,
    label: label || `Page ${location.pageNumber || '?'}`,
    createdAt: Date.now()
  });
}

/**
 * Get all bookmarks for a book
 * @param {number} bookId - Book ID
 * @returns {Promise<Array>} Array of bookmarks
 */
export async function getBookmarks(bookId) {
  return db.bookmarks.where('bookId').equals(bookId).toArray();
}

/**
 * Delete a bookmark
 * @param {number} id - Bookmark ID
 */
export async function deleteBookmark(id) {
  await db.bookmarks.delete(id);
}

/**
 * Check if a location is bookmarked
 * @param {number} bookId - Book ID
 * @param {Object} location - Location to check
 * @returns {Promise<Object|null>} Bookmark if exists, null otherwise
 */
export async function findBookmark(bookId, location) {
  if (location.cfi) {
    return db.bookmarks.where({ bookId, cfi: location.cfi }).first();
  }
  if (location.pageNumber) {
    return db.bookmarks.where({ bookId, pageNumber: location.pageNumber }).first();
  }
  return null;
}

// ========================================
// Reading Progress Operations
// ========================================

/**
 * Save reading progress
 * @param {number} bookId - Book ID
 * @param {Object} progress - Progress data
 */
export async function saveProgress(bookId, progress) {
  await db.readingProgress.put({
    bookId,
    currentPage: progress.currentPage || 1,
    totalPages: progress.totalPages || 0,
    percentage: progress.totalPages
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0,
    cfi: progress.cfi || null,
    updatedAt: Date.now()
  });
}

/**
 * Get reading progress for a book
 * @param {number} bookId - Book ID
 * @returns {Promise<Object|null>} Progress data or null
 */
export async function getProgress(bookId) {
  return db.readingProgress.get(bookId);
}

// ========================================
// Storage Info
// ========================================

/**
 * Get storage usage info
 * @returns {Promise<Object>} Storage usage information
 */
export async function getStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage,
      quota: estimate.quota,
      percentage: Math.round((estimate.usage / estimate.quota) * 100)
    };
  }
  return null;
}

/**
 * Request persistent storage
 * @returns {Promise<boolean>} Whether persistent storage was granted
 */
export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist();
  }
  return false;
}

// Export database instance for advanced operations
export { db };
