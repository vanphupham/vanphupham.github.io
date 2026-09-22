/**
 * Shared Utilities
 * Single source of truth for functions used across lab.js and command-palette.js.
 * Load this script before lab.js and command-palette.js.
 */

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Convert a BibTeX-style "Last, First" author name to "First Last".
 * Passes through names that are already in "First Last" order.
 * @param {string} author
 * @returns {string}
 */
function normalizeAuthorName(author) {
    author = author.trim();
    if (author.includes(',')) {
        const parts = author.split(',').map(p => p.trim());
        if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
    }
    return author;
}
