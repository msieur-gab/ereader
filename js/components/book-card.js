/**
 * FlashReader Pro - Book Card Web Component
 * Displays a book in the library grid
 */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }

    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-secondary, #f8fafc);
      border-radius: var(--radius-lg, 0.75rem);
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
    }

    .card:active {
      transform: translateY(-2px);
    }

    .card__cover {
      position: relative;
      aspect-ratio: 3 / 4;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--accent, #4f46e5) 0%, #6366f1 100%);
      color: white;
      font-size: 2rem;
      font-weight: 700;
    }

    .card__cover--epub {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    }

    .card__cover--pdf {
      background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
    }

    .card__badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 0.25rem;
    }

    .card__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0.75rem;
    }

    .card__title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary, #1e293b);
      margin: 0 0 0.25rem;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.3;
    }

    .card__author {
      font-size: 0.75rem;
      color: var(--text-secondary, #64748b);
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card__progress {
      margin-top: auto;
      padding-top: 0.5rem;
    }

    .card__progress-bar {
      height: 4px;
      background: var(--bg-tertiary, #e2e8f0);
      border-radius: 2px;
      overflow: hidden;
    }

    .card__progress-fill {
      height: 100%;
      background: var(--accent, #4f46e5);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .card__progress-text {
      display: flex;
      justify-content: space-between;
      margin-top: 0.25rem;
      font-size: 0.625rem;
      color: var(--text-muted, #94a3b8);
    }

    .card__actions {
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      display: flex;
      justify-content: flex-end;
      padding: 0.5rem;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .card:hover .card__actions {
      opacity: 1;
    }

    .card__delete {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      background: rgba(0, 0, 0, 0.5);
      border: none;
      border-radius: 50%;
      color: white;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .card__delete:hover {
      background: var(--danger, #ef4444);
    }

    .card__delete svg {
      width: 1rem;
      height: 1rem;
    }
  </style>

  <article class="card" tabindex="0" role="button">
    <div class="card__cover">
      <span class="card__initial"></span>
      <span class="card__badge"></span>
    </div>
    <div class="card__actions">
      <button class="card__delete" aria-label="Delete book" title="Delete book">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
    <div class="card__body">
      <h3 class="card__title"></h3>
      <p class="card__author"></p>
      <div class="card__progress">
        <div class="card__progress-bar">
          <div class="card__progress-fill"></div>
        </div>
        <div class="card__progress-text">
          <span class="card__progress-label">Progress</span>
          <span class="card__progress-value">0%</span>
        </div>
      </div>
    </div>
  </article>
`;

class BookCard extends HTMLElement {
  static get observedAttributes() {
    return ['book-id', 'title', 'author', 'type', 'progress'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    // Cache DOM elements
    this._card = this.shadowRoot.querySelector('.card');
    this._cover = this.shadowRoot.querySelector('.card__cover');
    this._initial = this.shadowRoot.querySelector('.card__initial');
    this._badge = this.shadowRoot.querySelector('.card__badge');
    this._title = this.shadowRoot.querySelector('.card__title');
    this._author = this.shadowRoot.querySelector('.card__author');
    this._progressFill = this.shadowRoot.querySelector('.card__progress-fill');
    this._progressValue = this.shadowRoot.querySelector('.card__progress-value');
    this._deleteBtn = this.shadowRoot.querySelector('.card__delete');
  }

  connectedCallback() {
    this._render();
    this._attachEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._render();
    }
  }

  _render() {
    const title = this.getAttribute('title') || 'Untitled';
    const author = this.getAttribute('author') || 'Unknown';
    const type = this.getAttribute('type') || 'epub';
    const progress = parseInt(this.getAttribute('progress') || '0', 10);

    // Set cover type class
    this._cover.className = `card__cover card__cover--${type}`;

    // Set initial letter
    this._initial.textContent = title.charAt(0).toUpperCase();

    // Set badge
    this._badge.textContent = type.toUpperCase();

    // Set title and author
    this._title.textContent = title;
    this._author.textContent = author;

    // Set progress
    this._progressFill.style.width = `${progress}%`;
    this._progressValue.textContent = `${progress}%`;
  }

  _attachEventListeners() {
    this._handleCardClick = this._handleCardClick.bind(this);
    this._handleDeleteClick = this._handleDeleteClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);

    this._card.addEventListener('click', this._handleCardClick);
    this._deleteBtn.addEventListener('click', this._handleDeleteClick);
    this._card.addEventListener('keydown', this._handleKeyDown);
  }

  _removeEventListeners() {
    this._card.removeEventListener('click', this._handleCardClick);
    this._deleteBtn.removeEventListener('click', this._handleDeleteClick);
    this._card.removeEventListener('keydown', this._handleKeyDown);
  }

  _handleCardClick(e) {
    // Don't trigger if delete button was clicked
    if (e.target.closest('.card__delete')) return;

    const bookId = this.getAttribute('book-id');
    this.dispatchEvent(new CustomEvent('book-open', {
      bubbles: true,
      composed: true,
      detail: { id: parseInt(bookId, 10) }
    }));
  }

  _handleDeleteClick(e) {
    e.stopPropagation();
    const bookId = this.getAttribute('book-id');
    const title = this.getAttribute('title');

    this.dispatchEvent(new CustomEvent('book-delete', {
      bubbles: true,
      composed: true,
      detail: {
        id: parseInt(bookId, 10),
        title
      }
    }));
  }

  _handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._handleCardClick(e);
    }
  }
}

// Register the custom element
customElements.define('book-card', BookCard);

export default BookCard;
