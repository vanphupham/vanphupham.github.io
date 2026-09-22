/**
 * Global Command Palette
 * Triggered by Ctrl+K / Cmd+K or the nav search button.
 * Searches across pages, publications, and research areas.
 */

(function () {
    'use strict';

    const LAB_DATA_PATH = '/data/lab_data.json';
    const CV_DATA_PATH  = '/data/cv_data.json';

    // Icon map per item type
    const TYPE_ICONS = {
        page:        'fa-compass',
        publication: 'fa-file-alt',
        member:      'fa-user',
        research:    'fa-flask',
        news:        'fa-newspaper',
        project:     'fa-briefcase',
    };

    // -----------------------------------------------
    // Build static page entries (always present)
    // -----------------------------------------------
    const STATIC_PAGES = [
        { label: 'Home',         url: '/',              type: 'page', sub: 'Homepage' },
        { label: 'News',         url: '/news/',         type: 'page', sub: 'News and updates' },
        { label: 'Research',     url: '/research/',     type: 'page', sub: 'Research areas' },
        { label: 'Publications', url: '/publications/', type: 'page', sub: 'Journal and conference papers' },
        { label: 'Projects',     url: '/projects/',     type: 'page', sub: 'Funded research projects' },
        { label: 'Experience',   url: '/experience/',   type: 'page', sub: 'Positions and education' },
    ];

    let _index = [];          // full search index
    let _built = false;       // index built flag
    let _activeIdx = -1;      // keyboard-selected result index

    // -----------------------------------------------
    // DOM references (set in init)
    // -----------------------------------------------
    let backdrop, palette, input, resultsList;

    // -----------------------------------------------
    // Index building
    // normalizeAuthorName is provided by utils.js (loaded before this script)
    // -----------------------------------------------
    async function buildIndex() {
        if (_built) return;
        _built = true;

        _index = [...STATIC_PAGES];

        try {
            const labData = await fetch(LAB_DATA_PATH).then(r => r.ok ? r.json() : null);
            if (labData) {
                // Research areas
                (labData.research || []).forEach(r => {
                    _index.push({
                        label: r.title,
                        url: '/research/',
                        type: 'research',
                        sub: (r.keywords || []).slice(0, 4).join(', '),
                        keywords: [r.title, r.details, ...(r.keywords || [])].filter(Boolean).join(' ').toLowerCase(),
                    });
                });

                // News
                (labData.news || []).slice(0, 10).forEach(n => {
                    _index.push({
                        label: n.content.slice(0, 72) + (n.content.length > 72 ? '…' : ''),
                        url: '/news/',
                        type: 'news',
                        sub: n.date,
                        keywords: n.content.toLowerCase(),
                    });
                });

                // Projects
                (labData.projects || []).forEach(p => {
                    const title = p.title_en || p.title_ko || '';
                    _index.push({
                        label: title,
                        url: '/projects/',
                        type: 'project',
                        sub: [p.funder, p.period].filter(Boolean).join(' · '),
                        keywords: [title, p.title_ko, p.funder].filter(Boolean).join(' ').toLowerCase(),
                    });
                });
            }
        } catch (_) { /* silently ignore */ }

        try {
            const cvData = await fetch(CV_DATA_PATH).then(r => r.ok ? r.json() : null);
            if (cvData && cvData.publications) {
                const pubs = [
                    ...(cvData.publications.early_access || []),
                    ...(cvData.publications.journals || []),
                    ...(cvData.publications.conferences || []),
                ];
                pubs.forEach(p => {
                    const authors = (p.author || '').split(/\s+and\s+/).map(normalizeAuthorName).join(', ');
                    const venue = p.journal || p.booktitle || '';
                    _index.push({
                        label: p.title || '',
                        url: '/publications/',
                        type: 'publication',
                        sub: [authors.split(',')[0].trim(), venue, p.year].filter(Boolean).join(' · '),
                        keywords: [p.title, p.author, p.journal, p.booktitle].filter(Boolean).join(' ').toLowerCase(),
                    });
                });
            }
        } catch (_) { /* silently ignore */ }
    }

    // -----------------------------------------------
    // Filtering
    // -----------------------------------------------
    function search(query) {
        if (!query) return STATIC_PAGES;
        const q = query.toLowerCase().trim();
        return _index.filter(item => {
            const hay = (item.keywords || '') + ' ' + item.label.toLowerCase() + ' ' + (item.sub || '').toLowerCase();
            return q.split(/\s+/).every(word => hay.includes(word));
        }).slice(0, 12);
    }

    // -----------------------------------------------
    // Rendering
    // escHtml is provided by utils.js (loaded before this script)
    // -----------------------------------------------
    function renderResults(items) {
        _activeIdx = -1;
        if (items.length === 0) {
            resultsList.innerHTML = `<li class="cmd-empty">No results found. Try a different keyword.</li>`;
            return;
        }
        resultsList.innerHTML = items.map((item, i) => `
            <li data-url="${escHtml(item.url)}" data-idx="${i}" role="option">
                <span class="cmd-result-icon"><i class="fas ${TYPE_ICONS[item.type] || 'fa-circle'}"></i></span>
                <span class="cmd-result-text">
                    <span class="cmd-result-label">${escHtml(item.label)}</span>
                    ${item.sub ? `<span class="cmd-result-sub">${escHtml(item.sub)}</span>` : ''}
                </span>
                <span class="cmd-result-type">${item.type}</span>
            </li>
        `).join('');

        resultsList.querySelectorAll('li[data-url]').forEach(li => {
            li.addEventListener('click', () => navigate(li.dataset.url));
        });
    }

    function setActive(idx, items) {
        const lis = resultsList.querySelectorAll('li[data-url]');
        lis.forEach(li => li.classList.remove('cmd-active'));
        if (idx < 0 || idx >= lis.length) { _activeIdx = -1; return; }
        _activeIdx = idx;
        lis[idx].classList.add('cmd-active');
        lis[idx].scrollIntoView({ block: 'nearest' });
    }

    // -----------------------------------------------
    // Open / Close
    // -----------------------------------------------
    function open() {
        backdrop.classList.add('open');
        palette.classList.add('open');
        input.value = '';
        renderResults(STATIC_PAGES);
        input.focus();
        buildIndex(); // build in background if not yet done
    }

    function close() {
        backdrop.classList.remove('open');
        palette.classList.remove('open');
    }

    function navigate(url) {
        close();
        if (url) window.location.href = url;
    }

    // -----------------------------------------------
    // Keyboard handling
    // -----------------------------------------------
    function onInputKey(e) {
        const items = search(input.value);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(_activeIdx + 1, items.length - 1), items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(_activeIdx - 1, 0), items);
        } else if (e.key === 'Enter') {
            const lis = resultsList.querySelectorAll('li[data-url]');
            const target = _activeIdx >= 0 ? lis[_activeIdx] : lis[0];
            if (target) navigate(target.dataset.url);
        } else if (e.key === 'Escape') {
            close();
        }
    }

    // -----------------------------------------------
    // Inject DOM elements and wire events
    // -----------------------------------------------
    function init() {
        // Backdrop
        backdrop = document.createElement('div');
        backdrop.id = 'cmd-backdrop';
        backdrop.addEventListener('click', close);

        // Palette
        palette = document.createElement('div');
        palette.id = 'cmd-palette';
        palette.setAttribute('role', 'dialog');
        palette.setAttribute('aria-label', 'Command palette');
        palette.innerHTML = `
            <div class="cmd-input-wrap">
                <i class="fas fa-search"></i>
                <input id="cmd-input" type="search" autocomplete="off" spellcheck="false"
                       placeholder="Search pages, papers…" aria-autocomplete="list"
                       aria-controls="cmd-results">
                <span class="cmd-kbd-hint">ESC to close</span>
            </div>
            <ul id="cmd-results" role="listbox"></ul>
            <div class="cmd-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>↵</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(palette);

        input = document.getElementById('cmd-input');
        resultsList = document.getElementById('cmd-results');

        input.addEventListener('input', () => renderResults(search(input.value)));
        input.addEventListener('keydown', onInputKey);

        // Global shortcut
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                palette.classList.contains('open') ? close() : open();
            }
        });

        // Inject trigger button into nav (guard against duplicates)
        function injectTrigger() {
            if (document.getElementById('cmd-trigger')) return; // already injected
            const darkToggle = document.getElementById('darkModeToggle');
            if (!darkToggle) return;
            const btn = document.createElement('button');
            btn.id = 'cmd-trigger';
            btn.setAttribute('aria-label', 'Open command palette');
            btn.innerHTML = '<i class="fas fa-search"></i> <span>Search</span> <kbd>Ctrl K</kbd>';
            btn.addEventListener('click', open);
            darkToggle.parentElement.insertBefore(btn, darkToggle);
        }

        // Try immediately; retry once after shared components (nav) are injected
        injectTrigger();
        setTimeout(injectTrigger, 100);
    }

    // -----------------------------------------------
    // Bootstrap
    // -----------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
