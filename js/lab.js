/**
 * Page JavaScript
 * Loads lab_data.json (and optionally cv_data.json) and renders each lab page.
 * Which sections to render is controlled by data-page attribute on <main>.
 */

// ===================================
// Configuration
// ===================================
const LAB_DATA_PATH = '/data/lab_data.json';

// Site owner. Populated from lab_data.json (lab.name + lab.nameAliases) so the
// owner's name can be bolded in author lists without being hardcoded here.
let OWNER_ALIASES = [];
const _flatten = n => String(n || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
function setOwner(lab) {
    if (!lab) return;
    OWNER_ALIASES = [lab.name, ...(lab.nameAliases || [])].filter(Boolean).map(_flatten);
}
// JCR / impact-factor figures, keyed journal -> publication year. Clarivate data,
// so it is entered by hand in lab_data.json rather than fetched.
let JOURNAL_METRICS = {};
function setJournalMetrics(m) { JOURNAL_METRICS = m || {}; }
function journalMetricsFor(pub) {
    const byYear = JOURNAL_METRICS[pub.journal || pub.booktitle || ''];
    if (!byYear) return {};
    return byYear[pub.year] || byYear.default || {};
}

function isOwnerName(name) {
    return OWNER_ALIASES.includes(_flatten(name));
}
const CV_DATA_PATH = '/data/cv_data.json';
const THEME_KEY = 'lab-theme';

// Publication filter state (module-level)
let _allPubs = { early: [], journals: [], conferences: [] };
const _filterState = {
    type: 'all',       // 'all' | 'journal' | 'conference'
    years: new Set(),  // selected years; empty = show all
    members: new Set() // selected member names; empty = show all
};
let _searchQuery = ''; // real-time text search query (lowercased)

// Default member avatar SVG (shown when no photo is provided)
const DEFAULT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"
     aria-hidden="true" focusable="false" class="member-avatar-svg">
    <circle cx="40" cy="40" r="40" fill="var(--bg-accent)"/>
    <circle cx="40" cy="30" r="14" fill="var(--text-muted)"/>
    <ellipse cx="40" cy="66" rx="22" ry="16" fill="var(--text-muted)"/>
</svg>`;

// ===================================
// Shared Components (Nav + Footer)
// ===================================
function loadSharedComponents() {
    const navHTML = `
<nav class="lab-nav">
    <div class="lab-nav-inner">
        <a class="nav-brand" href="/" aria-label="Pham Van Phu — home">
            <img src="/assets/title_pvp_nav.png" alt="Pham Van Phu" class="nav-logo-img">
        </a>
        <button id="navMenuToggle" class="nav-menu-toggle" aria-label="Toggle menu">
            <i class="fas fa-bars"></i>
        </button>
        <ul class="nav-links">
            <li><a href="/news/">News</a></li>
            <li><a href="/research/">Research</a></li>
            <li><a href="/projects/">Projects</a></li>
            <li><a href="/publications/">Publications</a></li>
        </ul>
        <button id="darkModeToggle" class="nav-dark-toggle" aria-label="Toggle dark mode">
            <i class="fas fa-moon"></i>
        </button>
    </div>
</nav>`;

    const footerHTML = `
<footer class="lab-footer">
    <p>
        &copy; 2026 Pham Van Phu &nbsp;&middot;&nbsp;
        Department of Future Convergence Technology, Soonchunhyang University
    </p>
</footer>`;

    const navPlaceholder = document.getElementById('site-nav-placeholder');
    if (navPlaceholder) navPlaceholder.outerHTML = navHTML;

    const footerPlaceholder = document.getElementById('site-footer-placeholder');
    if (footerPlaceholder) footerPlaceholder.outerHTML = footerHTML;
}

// ===================================
// Theme
// ===================================
function initTheme() {
    // Light is the default. Dark only when the visitor has chosen it here —
    // the OS colour-scheme preference no longer flips the site on its own.
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const icon = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.innerHTML = icon;
    const mobileBtn = document.getElementById('mobileDarkToggle');
    if (mobileBtn) mobileBtn.innerHTML = icon;
}

// ===================================
// Navigation — highlight active link
// ===================================
function highlightActiveNav() {
    // Normalize a path to always end with '/' and strip /index.html
    function normPath(p) {
        return p
            .replace(/\/index\.html$/, '/')  // /foo/index.html → /foo/
            .replace(/([^/])$/, '$1/')        // ensure trailing slash
            || '/';
    }
    const current = normPath(window.location.pathname);
    document.querySelectorAll('.nav-links a').forEach(a => {
        const href = normPath(a.getAttribute('href') || '');
        const isRoot = href === '/';
        // Root matches only exact '/'; others match prefix (but only full segments)
        const active = isRoot
            ? current === '/'
            : current === href || current.startsWith(href);
        a.classList.toggle('active', active);
    });
}

function initMobileNav() {
    const toggle = document.getElementById('navMenuToggle');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    // Close on link click
    links.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => links.classList.remove('open'));
    });
}

// ===================================
// Back-to-Top Button
// ===================================
function initBackToTop() {
    const btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    document.body.appendChild(btn);

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 300);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ===================================
// Scroll Reveal (Intersection Observer)
// ===================================
function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return; // graceful degradation

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // fire once only
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    // Observe static structural elements
    document.querySelectorAll('.lab-section-title, .recruitment-box, .contact-block').forEach(el => {
        if (!el.classList.contains('reveal')) {
            el.classList.add('reveal');
        }
        observer.observe(el);
    });

    // Watch for dynamically rendered elements (cards, news items, etc.)
    const mo = new MutationObserver(() => {
        const selector = '.card:not(.reveal), .news-item:not(.reveal), .pub-item:not(.reveal), .member-card:not(.reveal), .project-card:not(.reveal), .bento-news-featured:not(.reveal)';
        document.querySelectorAll(selector).forEach((el, i) => {
            el.classList.add('reveal');
            // Stagger siblings (up to delay-3)
            if (!el.classList.contains('delay-1') && !el.classList.contains('delay-2') && !el.classList.contains('delay-3')) {
                const delay = (i % 3) + 1;
                if (delay > 1) el.classList.add(`delay-${delay}`);
            }
            observer.observe(el);
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
}

// ===================================
// Data Loading
// ===================================
async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
}

// ===================================
// Renderers
// ===================================

function renderHome(labData) {
    // News (latest 3) — Bento layout: featured first item, stack remainder
    const newsContainer = document.getElementById('home-news');
    if (newsContainer && labData.news) {
        const items = labData.news.slice(0, 3);
        if (items.length === 0) {
            newsContainer.innerHTML = emptyState('fa-newspaper', 'No news yet.', 'Check back soon for updates.');
        } else if (items.length === 1) {
            newsContainer.innerHTML = `
                <div class="news-item">
                    <span class="news-date">${items[0].date}</span>
                    <a class="news-title-link" href="/news/#news-0">
                        ${escHtml(items[0].title || items[0].content)}
                    </a>
                </div>`;
        } else {
            // Build full index for anchor links (home shows slice, but anchors use full-list index)
            const allNews = labData.news;
            const [featured, ...rest] = items;
            const featuredIdx = allNews.indexOf(featured);
            newsContainer.innerHTML = `
                <div class="bento-news-grid">
                    <div class="bento-news-featured">
                        <span class="news-date">${featured.date}</span>
                        <a class="news-title-link" href="/news/#news-${featuredIdx}">
                            ${escHtml(featured.title || featured.content)}
                        </a>
                    </div>
                    <div class="bento-news-stack">
                        ${rest.map(n => {
                            const idx = allNews.indexOf(n);
                            return `
                            <div class="news-item">
                                <span class="news-date">${n.date}</span>
                                <a class="news-title-link" href="/news/#news-${idx}">
                                    ${escHtml(n.title || n.content)}
                                </a>
                            </div>`;
                        }).join('')}
                        ${labData.news.length > 3
                            ? '<p style="margin-top:0.5rem;font-size:0.85rem;"><a href="/news/">View all news &rarr;</a></p>'
                            : ''}
                    </div>
                </div>`;
        }
        if (labData.news.length > 3 && items.length <= 1) {
            newsContainer.insertAdjacentHTML('beforeend',
                '<p style="margin-top:0.75rem;font-size:0.85rem;"><a href="/news/">View all news &rarr;</a></p>');
        }
    }

    renderExperience(labData);
    renderEducation(labData);

    // Contact
    const contactContainer = document.getElementById('home-contact');
    if (contactContainer && labData.lab) {
        const lab = labData.lab;
        const row = (icon, html) => html
            ? `<div class="contact-row"><i class="${icon}"></i><span>${html}</span></div>` : '';
        const link = (icon, url, text) => url
            ? `<div class="contact-row"><i class="${icon}"></i><a href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(text || url)}</a></div>` : '';
        contactContainer.innerHTML = `
            <div class="contact-block">
                ${row('fas fa-map-marker-alt', lab.office ? `<strong>Office:</strong> ${escHtml(lab.office)}` : '')}
                ${row('fas fa-flask', lab.laboratory ? `<strong>Laboratory:</strong> ${escHtml(lab.laboratory)}` : '')}
                ${lab.email ? `<div class="contact-row"><i class="fas fa-envelope"></i><a href="mailto:${escHtml(lab.email)}">${escHtml(lab.email)}</a></div>` : ''}
                ${link('fab fa-github', lab.github)}
                ${link('fab fa-linkedin', lab.linkedin, 'LinkedIn')}
                ${link('fas fa-graduation-cap', lab.googleScholar, 'Google Scholar')}
                ${link('fab fa-orcid', lab.orcid, 'ORCID')}
                ${link('fab fa-researchgate', lab.researchgate, 'ResearchGate')}
                ${link('fas fa-flask', lab.labWebsite, lab.labName || 'Lab website')}
            </div>
        `;
    }

}

// "3 yrs 7 mos" style duration, counted inclusively like LinkedIn does.
function durationSince(startISO) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(startISO || ''));
    if (!m) return '';
    const start = new Date(Number(m[1]), Number(m[2]) - 1);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12
               + (now.getMonth() - start.getMonth()) + 1;
    if (months <= 0) return '';
    const yrs = Math.floor(months / 12), mos = months % 12;
    const out = [];
    if (yrs) out.push(`${yrs} yr${yrs > 1 ? 's' : ''}`);
    if (mos) out.push(`${mos} mo${mos > 1 ? 's' : ''}`);
    return out.join(' ');
}

function timelineLink(o) {
    if (!o) return '';
    return o.url
        ? `<a href="${escHtml(o.url)}" target="_blank" rel="noopener">${escHtml(o.name)}</a>`
        : escHtml(o.name);
}

function timelineItem(o) {
    const extra = [];
    if (o.gpa) extra.push(`<p class="edu-line"><span class="edu-key">GPA:</span> ${escHtml(o.gpa)}</p>`);
    if (o.summary) extra.push(`<p class="edu-line">${escHtml(o.summary)}</p>`);
    if (o.thesis) extra.push(`<p class="edu-line">Thesis on <em>${escHtml(o.thesis)}</em>.</p>`);

    const credits = [];
    if (o.advisor) credits.push(`Supervised by ${timelineLink(o.advisor)}`);
    if (o.lab) credits.push(timelineLink(o.lab));
    if (credits.length) extra.push(`<p class="edu-line">${credits.join(' &middot; ')}.</p>`);

    if (o.focus) {
        extra.push(`<p class="edu-focus"><i class="fas fa-tag" aria-hidden="true"></i> ${escHtml(o.focus)}</p>`);
    }

    return `
        <li class="edu-item">
            <span class="edu-icon" aria-hidden="true"><i class="fas ${o.icon || 'fa-graduation-cap'}"></i></span>
            <div class="edu-body">
                <h3 class="edu-degree">${escHtml(o.title)}</h3>
                <p class="edu-school">${escHtml(o.subtitle)}</p>
                ${o.period ? `<p class="edu-period">${escHtml(o.period)}</p>` : ''}
                ${extra.join('')}
            </div>
        </li>`;
}

function renderExperience(labData) {
    const el = document.getElementById('home-experience');
    if (!el) return;
    const items = (labData && labData.experience) || [];
    if (items.length === 0) { el.innerHTML = ''; return; }

    el.innerHTML = `<ol class="edu-timeline">` + items.map(x => {
        const dur = x.endLabel === 'Present' ? durationSince(x.start) : '';
        const period = [
            `${x.startLabel || ''} \u2013 ${x.endLabel || ''}`.trim(),
            dur,
        ].filter(Boolean).join(' \u00b7 ');
        return timelineItem({
            icon: 'fa-briefcase',
            title: x.role,
            subtitle: [x.organization, x.employmentType].filter(Boolean).join(' \u00b7 '),
            period,
            summary: x.summary,
            focus: x.focus,
            lab: x.lab,
        });
    }).join('') + `</ol>`;
}

function renderEducation(labData) {
    const el = document.getElementById('home-education');
    if (!el) return;
    const items = (labData && labData.education) || [];
    if (items.length === 0) { el.innerHTML = ''; return; }

    el.innerHTML = `<ol class="edu-timeline">` + items.map(e => timelineItem({
        icon: 'fa-graduation-cap',
        title: e.degree,
        subtitle: [e.institution, e.location].filter(Boolean).join(', '),
        period: e.period,
        gpa: e.gpa,
        summary: e.summary,
        thesis: e.thesis,
        advisor: e.advisor,
        lab: e.lab,
        focus: e.focus,
    })).join('') + `</ol>`;
}

function renderScholarMetrics(labData) {
    const el = document.getElementById('scholar-metrics');
    if (!el) return;
    const s = labData && labData.scholar;
    if (!s) { el.innerHTML = ''; return; }

    const years = s.perYear || [];
    const max = Math.max(1, ...years.map(y => y.count));
    const altText = years.map(y => `${y.year}: ${y.count}`).join(', ');
    const bars = years.map(y => `
        <div class="gs-bar-col">
            <span class="gs-bar-val">${y.count}</span>
            <div class="gs-bar" style="height:${Math.round((y.count / max) * 100)}%"></div>
            <span class="gs-bar-year">${escHtml(y.year)}</span>
        </div>`).join('');

    const since = s.since || null;
    const row = (label, all, sinceVal) => `
        <tr>
            <th scope="row">${escHtml(label)}</th>
            <td>${escHtml(String(all))}</td>
            ${since ? `<td>${escHtml(String(sinceVal))}</td>` : ''}
        </tr>`;

    el.innerHTML = `
        <div class="gs-box">
            <div class="gs-head">Cited by</div>
            <div class="gs-body">
                <table class="gs-table">
                    <thead>
                        <tr>
                            <td></td>
                            <th scope="col">All</th>
                            ${since ? `<th scope="col">Since ${escHtml(since.year)}</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${row('Citations', s.citations, since && since.citations)}
                        ${row('h-index', s.hIndex, since && since.hIndex)}
                        ${row('i10-index', s.i10Index, since && since.i10Index)}
                    </tbody>
                </table>
                ${years.length ? `<div class="gs-chart" role="img"
                     aria-label="Citations per year — ${escHtml(altText)}">${bars}</div>` : ''}
            </div>
            <p class="gs-source">
                Source: <a href="${escHtml(s.url)}" target="_blank" rel="noopener">Google Scholar</a>${
                    s.updated ? ` &middot; snapshot of ${escHtml(s.updated)}` : ''}
            </p>
        </div>`;
}

function renderNews(labData) {
    const container = document.getElementById('news-list');
    if (!container) return;
    if (!labData.news || labData.news.length === 0) {
        container.innerHTML = emptyState('fa-newspaper', 'No news yet.', 'Check back soon for updates.');
        return;
    }
    container.innerHTML = labData.news.map((n, i) => `
        <div class="news-item news-item-full" id="news-${i}">
            <span class="news-date">${n.date}</span>
            ${n.title ? `<h3 class="news-title">${escHtml(n.title)}</h3>` : ''}
            <p class="news-content">${escHtml(n.content)}</p>
        </div>
    `).join('');

    // If URL has a hash anchor, scroll to and highlight the target
    if (window.location.hash) {
        const target = document.querySelector(window.location.hash);
        if (target) {
            setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('news-highlight');
            }, 100);
        }
    }
}
function renderResearch(labData) {
    const intro = document.getElementById('research-intro');
    if (intro && labData.researchIntro) {
        intro.textContent = labData.researchIntro;
    }

    const container = document.getElementById('research-areas');
    if (!container) return;
    const areas = labData.research || [];
    if (areas.length === 0) {
        container.innerHTML = emptyState('fa-flask', 'No research areas yet.', 'Check back soon.');
        return;
    }
    container.innerHTML = areas.map((r, i) => `
        <article class="ra-card">
            <span class="ra-num">${String(i + 1).padStart(2, '0')}</span>
            <h3 class="ra-title">${escHtml(r.title)}</h3>
            <p class="ra-body">${escHtml(r.details)}</p>
        </article>
    `).join('');
}

function renderPublications(cvData, labData) {
    const container = document.getElementById('publications-content');
    if (!container || !cvData) return;
    const pubs = cvData.publications;
    if (!pubs) { container.innerHTML = '<p class="empty-msg">No publications data.</p>'; return; }

    // Cache raw data for re-filtering
    _allPubs.early = pubs.early_access || [];
    _allPubs.journals = pubs.journals || [];
    _allPubs.conferences = pubs.conferences || [];

    // Reset filter state on initial load
    _filterState.type = 'all';
    _filterState.years.clear();
    _filterState.members.clear();

    // Extract years (descending) from all publications
    const allItems = [..._allPubs.early, ..._allPubs.journals, ..._allPubs.conferences];
    const years = [...new Set(allItems.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);

    // Members from labData — PI first, then alphabetical by last name, first name
    const rawMembers = (labData && labData.members) ? labData.members : [];
    const members = rawMembers.slice().sort((a, b) => {
        const piName = (labData && labData.lab && labData.lab.name) || '';
        if (a.name === piName) return -1;
        if (b.name === piName) return 1;
        const lastName = n => n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
        const firstName = n => n.trim().split(/\s+/).slice(0, -1).join(' ').toLowerCase();
        return lastName(a.name).localeCompare(lastName(b.name)) || firstName(a.name).localeCompare(firstName(b.name));
    });

    // Insert filter bar above the publications container (inside the section)
    const section = container.closest('.lab-section') || container.parentElement;
    const existingBar = document.getElementById('pub-filter-bar');
    if (existingBar) existingBar.remove();
    const filterBar = document.createElement('div');
    filterBar.id = 'pub-filter-bar';
    filterBar.className = 'pub-filter-bar';
    section.insertBefore(filterBar, container);

    renderPubFilters(filterBar, years, members);
    applyPubFilters();
    injectPublicationsJsonLd(cvData);
}

function renderPubFilters(bar, years, members) {
    const memberChipsHtml = members.length > 0 ? `
        <div class="pub-filter-group">
            <span class="pub-filter-label">Member</span>
            <div class="pub-filter-chips" id="filter-member-chips">
                ${members.map(m => {
                    const parts = m.name.trim().split(/\s+/);
                    const last = parts.slice(-1)[0].toUpperCase();
                    const first = parts.slice(0, -1).join(' ');
                    const display = first ? `${last}, ${first}` : last;
                    return `<button class="pub-chip" data-member="${escHtml(m.name)}">${escHtml(display)}</button>`;
                }).join('')}
            </div>
        </div>` : '';

    bar.innerHTML = `
        <div class="pub-filter-group">
            <span class="pub-filter-label">Search</span>
            <input type="search" id="pub-search-input" class="pub-search-input"
                   placeholder="Title, author, or venue…" autocomplete="off" spellcheck="false"
                   value="${escHtml(_searchQuery)}">
        </div>
        <div class="pub-filter-group">
            <span class="pub-filter-label">Type</span>
            <div class="pub-type-toggle">
                <button class="pub-type-btn active" data-type="all">All</button>
                <button class="pub-type-btn" data-type="journal">Journal</button>
                <button class="pub-type-btn" data-type="conference">Conference</button>
            </div>
        </div>
        <div class="pub-filter-group">
            <span class="pub-filter-label">Year</span>
            <div class="pub-filter-chips" id="filter-year-chips">
                ${years.map(y => `<button class="pub-chip" data-year="${y}">${y}</button>`).join('')}
            </div>
        </div>
        ${memberChipsHtml}
        <div class="pub-filter-group pub-filter-reset-group">
            <button class="pub-filter-reset" id="filter-reset"><i class="fas fa-times"></i> Reset</button>
        </div>
    `;

    // Search input
    const searchInput = bar.querySelector('#pub-search-input');
    searchInput?.addEventListener('input', () => {
        _searchQuery = searchInput.value.toLowerCase().trim();
        applyPubFilters();
    });

    // Type toggle
    bar.querySelectorAll('.pub-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            bar.querySelectorAll('.pub-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _filterState.type = btn.dataset.type;
            applyPubFilters();
        });
    });

    // Year chips
    bar.querySelectorAll('[data-year]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            const y = chip.dataset.year;
            if (_filterState.years.has(y)) _filterState.years.delete(y);
            else _filterState.years.add(y);
            applyPubFilters();
        });
    });

    // Member chips
    bar.querySelectorAll('[data-member]').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            const m = chip.dataset.member;
            if (_filterState.members.has(m)) _filterState.members.delete(m);
            else _filterState.members.add(m);
            applyPubFilters();
        });
    });

    // Reset button
    bar.querySelector('#filter-reset')?.addEventListener('click', () => {
        _filterState.type = 'all';
        _filterState.years.clear();
        _filterState.members.clear();
        _searchQuery = '';
        if (searchInput) searchInput.value = '';
        bar.querySelectorAll('.pub-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'all'));
        bar.querySelectorAll('.pub-chip').forEach(c => c.classList.remove('active'));
        applyPubFilters();
    });
}

function matchesMember(authorString, memberName) {
    if (!authorString) return false;
    const normalized = authorString.split(/\s+and\s+/).map(a => normalizeAuthorName(a));
    return normalized.some(a => a === memberName);
}

function applyPubFilters() {
    const { type, years, members } = _filterState;

    function keep(pub) {
        if (years.size > 0 && !years.has(pub.year)) return false;
        if (members.size > 0 && ![...members].some(m => matchesMember(pub.author, m))) return false;
        if (_searchQuery) {
            const haystack = [pub.title, pub.author, pub.journal, pub.booktitle]
                .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(_searchQuery)) return false;
        }
        return true;
    }

    const filteredEarly      = (type === 'all' || type === 'journal')     ? _allPubs.early.filter(keep)       : [];
    const filteredJournals   = (type === 'all' || type === 'journal')     ? _allPubs.journals.filter(keep)    : [];
    const filteredConferences = (type === 'all' || type === 'conference') ? _allPubs.conferences.filter(keep) : [];

    renderPubList(filteredEarly, filteredJournals, filteredConferences);
}

function renderPubList(early, journals, conferences) {
    const container = document.getElementById('publications-content');
    if (!container) return;
    let html = '';

    function renderGroup(pubs) {
        return pubs.map((p, i) => {
            const pubId = `pub-${encodeURIComponent((p.title || '').slice(0, 32).replace(/\s+/g, '-'))}`;
            registerPub(p, pubId);
            return createLabPubHTML(p, pubs.length - i);
        }).join('');
    }

    if (early.length > 0) {
        html += `<h2 class="pub-category-header">Early Access or Accepted Publications (${early.length})</h2>
                 <div class="publication-list">${renderGroup(early)}</div>`;
    }
    if (journals.length > 0) {
        // One category heading, then a subheading per authorship position.
        // Each subgroup is numbered independently.
        const firstAuthor = journals.filter(p => p.is_first_author === true);
        const coAuthor    = journals.filter(p => p.is_first_author !== true);

        html += `<h2 class="pub-category-header">International Journal Articles (${journals.length})</h2>`;
        if (firstAuthor.length > 0) {
            html += `<h3 class="pub-subcategory-header">First Author <span class="pub-subcount">(${firstAuthor.length})</span></h3>
                     <div class="publication-list">${renderGroup(firstAuthor)}</div>`;
        }
        if (coAuthor.length > 0) {
            html += `<h3 class="pub-subcategory-header">Co-Author <span class="pub-subcount">(${coAuthor.length})</span></h3>
                     <div class="publication-list">${renderGroup(coAuthor)}</div>`;
        }
    }
    if (conferences.length > 0) {
        html += `<h2 class="pub-category-header">International Conference Proceedings (${conferences.length})</h2>
                 <div class="publication-list">${renderGroup(conferences)}</div>`;
    }

    container.innerHTML = html || emptyState('fa-search', 'No publications match the selected filters.', 'Try broadening your search or resetting the filters.');

    // Event delegation for detail buttons
    container.querySelectorAll('.pub-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => openPubDetail(btn.dataset.pubId));
    });
}

// ===================================
// Publication rendering helpers (mirrors main.js logic)
// ===================================

// normalizeAuthorName is defined in utils.js

function formatAuthors(authorString, isFirstAuthor = false) {
    if (!authorString) return '';
    const authors = authorString.split(/\s+and\s+/).map(a => normalizeAuthorName(a));
    const highlight = (author) => {
        if (isOwnerName(author)) {
            const asterisk = isFirstAuthor ? '<sup>*</sup>' : '';
            return `<strong>${escHtml(author)}${asterisk}</strong>`;
        }
        return escHtml(author);
    };
    if (authors.length === 0) return '';
    if (authors.length === 1) return highlight(authors[0]);
    if (authors.length === 2) return `${highlight(authors[0])} and ${highlight(authors[1])}`;
    const last = authors[authors.length - 1];
    const rest = authors.slice(0, -1);
    return `${rest.map(highlight).join(', ')}, and ${highlight(last)}`;
}

function createLabPubHTML(pub, number) {
    const baseVenue = pub.journal || pub.booktitle || '';
    const venueIndex = pub.index || journalMetricsFor(pub).index || '';
    const venue = baseVenue + (venueIndex ? ` (${venueIndex})` : '');
    const volumeInfo = pub.volume ? `Vol. ${pub.volume}` : '';
    const numberInfo = pub.number ? `No. ${pub.number}` : '';
    const pagesInfo = pub.pages ? `pp. ${pub.pages}` : '';
    const venueDetails = [volumeInfo, numberInfo, pagesInfo].filter(x => x).join(', ');

    const doiLink = pub.doi
        ? (pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`)
        : pub.url;

    const formattedAuthors = formatAuthors(pub.author, pub.is_first_author === true);

    // Per-publication values win; otherwise fall back to the journal/year table.
    const jm = journalMetricsFor(pub);
    const impactFactor = pub.impact_factor || jm.impact_factor || '';
    const jcrQuantile  = pub.jcr_quantile  || jm.jcr_quantile  || '';
    const jcrRanking   = pub.jcr_ranking   || jm.jcr_ranking   || '';
    const jcrField     = pub.jcr_field     || jm.jcr_field     || '';

    let metricsHTML = '';
    if (impactFactor || jcrQuantile || jcrRanking || jcrField) {
        const metrics = [];
        if (impactFactor) metrics.push(`JIF: ${escHtml(impactFactor)}`);

        const isQ1 = jcrQuantile.toUpperCase() === 'Q1';
        const jcrInfo = [];
        if (jcrQuantile) {
            jcrInfo.push(isQ1
                ? `<span class="jcr-q1-badge">${escHtml(jcrQuantile)}</span>`
                : escHtml(jcrQuantile));
        }
        // Show the percentile for every quartile, not just Q1, and preserve the
        // precision as entered (e.g. "Top 14.29%" rather than rounding to 14%).
        if (jcrRanking) {
            const label = escHtml(/^top\s/i.test(jcrRanking.trim())
                ? jcrRanking.trim()
                : `Top ${jcrRanking.trim()}`);
            jcrInfo.push(isQ1
                ? `<span class="jcr-ranking-badge">${label}</span>`
                : label);
        }
        if (jcrInfo.length > 0) metrics.push(`JCR ${jcrInfo.join(', ')}`);
        if (jcrField) metrics.push(`in ${escHtml(jcrField)}`);

        metricsHTML = `<div class="publication-metrics">(${metrics.join(', ')})</div>`;
    }

    const pubId = `pub-${encodeURIComponent((pub.title || '').slice(0, 32).replace(/\s+/g, '-'))}`;

    return `
        <div class="publication-item">
            <div class="publication-number">[${number}]</div>
            <div class="publication-content">
                <div class="publication-title">${escHtml(pub.title)}</div>
                <div class="publication-authors">${formattedAuthors}</div>
                <div class="publication-venue">
                    ${escHtml(venue)}${venueDetails ? ', ' + venueDetails : ''}
                </div>
                <div class="publication-meta">
                    <span class="publication-year">
                        <i class="fas fa-calendar"></i> ${escHtml(pub.year)}
                    </span>
                    ${doiLink ? `
                        <span class="publication-doi">
                            <i class="fas fa-link"></i>
                            <a href="${doiLink}" target="_blank" rel="noopener noreferrer">
                                ${pub.doi ? 'DOI' : 'Link'}
                            </a>
                        </span>
                    ` : ''}
                    ${Number(pub.citations) > 0 ? `
                        <span class="publication-cites" title="Citations (Google Scholar)">
                            <i class="fas fa-quote-right"></i> ${Number(pub.citations)}
                        </span>
                    ` : ''}
                    <button class="pub-detail-btn" data-pub-id="${escHtml(pubId)}"
                            aria-label="Show details for ${escHtml(pub.title)}">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                </div>
                ${metricsHTML}
            </div>
        </div>
    `;
}

// ===================================
// Publication Deep Dive Modal
// ===================================

function generateBibTeX(pub) {
    const type = pub.journal ? 'article' : 'inproceedings';
    const key = [
        (pub.author || '').split(/\s+and\s+/)[0].split(/\s+/).pop() || 'Unknown',
        pub.year || '',
        (pub.title || '').split(/\s+/)[0].toLowerCase()
    ].join('');

    const fields = { title: pub.title, author: pub.author, year: pub.year };
    if (pub.journal)    fields.journal = pub.journal;
    if (pub.booktitle)  fields.booktitle = pub.booktitle;
    if (pub.volume)     fields.volume = pub.volume;
    if (pub.number)     fields.number = pub.number;
    if (pub.pages)      fields.pages = pub.pages;
    if (pub.doi)        fields.doi = pub.doi;
    if (pub.publisher)  fields.publisher = pub.publisher;

    const body = Object.entries(fields)
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(',\n');
    return `@${type}{${key},\n${body}\n}`;
}

function getOrCreatePubModal() {
    let dlg = document.getElementById('pub-detail-dialog');
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'pub-detail-dialog';
    dlg.innerHTML = `
        <div class="pub-dialog-inner">
            <button class="pub-dialog-close" aria-label="Close"><i class="fas fa-times"></i></button>
            <div id="pub-dialog-content"></div>
        </div>
    `;
    document.body.appendChild(dlg);

    dlg.querySelector('.pub-dialog-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    return dlg;
}

// Store pub data for modal lookup: key = pubId (set when rendering list)
const _pubRegistry = new Map();

function registerPub(pub, pubId) {
    _pubRegistry.set(pubId, pub);
}

function openPubDetail(pubId) {
    const pub = _pubRegistry.get(pubId);
    if (!pub) return;

    const dlg = getOrCreatePubModal();
    const contentEl = dlg.querySelector('#pub-dialog-content');

    const doiLink = pub.doi
        ? (pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`)
        : pub.url;

    const bibtex = generateBibTeX(pub);

    contentEl.innerHTML = `
        <div class="pub-dialog-title">${escHtml(pub.title)}</div>
        <div class="pub-dialog-authors">${formatAuthors(pub.author, pub.is_first_author === true)}</div>
        <div class="pub-dialog-venue">${escHtml(pub.journal || pub.booktitle || '')}${pub.year ? ', ' + escHtml(pub.year) : ''}</div>
        ${doiLink ? `<a class="pub-dialog-doi" href="${doiLink}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> View paper</a>` : ''}
        ${pub.abstract ? `<div class="pub-dialog-section-label">Abstract</div><p class="pub-dialog-abstract">${escHtml(pub.abstract)}</p>` : ''}
        <div class="pub-dialog-section-label">BibTeX</div>
        <div class="pub-dialog-bibtex-wrap">
            <pre class="pub-dialog-bibtex">${escHtml(bibtex)}</pre>
            <button class="pub-bibtex-copy" id="pub-bibtex-copy-btn"><i class="fas fa-copy"></i> Copy BibTeX</button>
        </div>
    `;

    dlg.querySelector('#pub-bibtex-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(bibtex).then(() => {
            const btn = dlg.querySelector('#pub-bibtex-copy-btn');
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy BibTeX'; }, 2000);
        });
    });

    dlg.showModal();
}

// ===================================
// DOI → publication lookup map
// Built once from cv_data and reused by renderProjects.
// ===================================
let _doiMap = new Map(); // doi (bare, no https://doi.org/) → pub object

function buildDoiMap(cvData) {
    _doiMap.clear();
    if (!cvData || !cvData.publications) return;

    // Iterate through all publication categories safely
    Object.values(cvData.publications).forEach(categoryArray => {
        if (!Array.isArray(categoryArray)) return;
        
        categoryArray.forEach(pub => {
            if (!pub || !pub.doi || !pub.title) return; // Skip invalid or empty entries
            
            // Normalise: strip leading "https://doi.org/" and lowercase for case-insensitive matching
            const key = pub.doi.replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase();
            
            // Only set if not already present or if current entry is more complete
            if (!_doiMap.has(key)) {
                _doiMap.set(key, pub);
            }
        });
    });
}

/**
 * Resolve a paper reference from a project's papers[] array.
 * A reference is either:
 *   - a DOI string  → looked up in _doiMap → cv_data pub object
 *   - an inline object { authors, title, venue, year, doi? }
 * Returns a normalised { authors, title, venue, year, doi } object.
 */
function resolvePaperRef(ref) {
    if (typeof ref === 'string') {
        const bare    = ref.replace(/^https?:\/\/doi\.org\//i, '').trim();
        const bareKey = bare.toLowerCase();
        const pub     = _doiMap.get(bareKey);
        
        if (!pub) {
            // Fallback: DOI exists in lab_data but not in cv_data
            console.warn(`[site] DOI not found in cv_data.json: "${bare}".`);
            return {
                authors: '',
                title:   `[Paper DOI: ${bare}]`,
                venue:   '',
                year:    '',
                doi:     bare,
                _fallback: true
            };
        }
        
        // Convert cv_data pub format → project paper format
        const authorsRaw = (pub.author || '').split(/\s+and\s+/).map(normalizeAuthorName).join(', ');
        return {
            authors: authorsRaw || '',
            title:   pub.title   || `[Paper DOI: ${bare}]`,
            venue:   pub.journal || pub.booktitle || '',
            year:    pub.year    || '',
            doi:     bare,
        };
    }
    // Inline object — ensure basic fields exist
    return {
        authors: ref.authors || '',
        title:   ref.title   || 'Unknown Title',
        venue:   ref.venue   || '',
        year:    ref.year    || '',
        doi:     ref.doi     || ''
    };
}

function renderProjects(labData, cvData) {
    const container = document.getElementById('projects-list');
    if (!container || !labData) return;

    buildDoiMap(cvData);

    const projects = labData.projects;
    if (!projects || projects.length === 0) {
        container.innerHTML = emptyState('fa-folder-open', 'No projects data.', 'Project information will appear here.');
        return;
    }

    const ongoing   = projects.filter(p => p.status === 'ongoing');
    const completed = projects.filter(p => p.status === 'completed');

    let html = '';

    if (ongoing.length > 0) {
        html += `<h2 class="project-status-header ongoing-header">
                    <i class="fas fa-circle-notch fa-spin"></i> Ongoing Projects
                 </h2>`;
        html += ongoing.map(p => projectCard(p)).join('');
    }

    if (completed.length > 0) {
        html += `<h2 class="project-status-header completed-header">
                    <i class="fas fa-check-circle"></i> Completed Projects
                 </h2>`;
        html += completed.map(p => projectCard(p)).join('');
    }

    container.innerHTML = html;
}

function projectCard(p) {
    const infoRows = [];
    if (p.funder || p.funder_ko) {
        const funderText = p.funder && p.funder_ko
            ? `${escHtml(p.funder)} (${escHtml(p.funder_ko)})`
            : escHtml(p.funder || p.funder_ko);
        infoRows.push(`<div class="project-info-row">
            <span class="project-info-label"><i class="fas fa-building"></i> Funder</span>
            <span>${funderText}</span>
        </div>`);
    }
    if (p.type) {
        infoRows.push(`<div class="project-info-row">
            <span class="project-info-label"><i class="fas fa-tag"></i> Type</span>
            <span>${escHtml(p.type)}</span>
        </div>`);
    }
    if (p.period) {
        infoRows.push(`<div class="project-info-row">
            <span class="project-info-label"><i class="fas fa-calendar-alt"></i> Period</span>
            <span>${escHtml(p.period)}</span>
        </div>`);
    }
    if (p.grant) {
        infoRows.push(`<div class="project-info-row">
            <span class="project-info-label"><i class="fas fa-hashtag"></i> Grant No.</span>
            <span>${escHtml(p.grant)}</span>
        </div>`);
    }
    if (p.role || p.role_ko) {
        const roleText = p.role && p.role_ko
            ? `${escHtml(p.role)} (${escHtml(p.role_ko)})`
            : escHtml(p.role || p.role_ko);
        infoRows.push(`<div class="project-info-row">
            <span class="project-info-label"><i class="fas fa-user"></i> Role</span>
            <span>${roleText}</span>
        </div>`);
    }

    const ackHtml = p.acknowledgment
        ? `<div class="project-acknowledgment">
               <span class="ack-label">Acknowledgment:</span>
               <span class="ack-text">${escHtml(p.acknowledgment)}</span>
           </div>`
        : '';

    let papersHtml = '';
    if (p.papers && p.papers.length > 0) {
        // Each entry is either a DOI string (resolved via _doiMap) or an inline object
        const resolved = p.papers.map(ref => resolvePaperRef(ref)).filter(Boolean);
        if (resolved.length > 0) {
            const paperItems = resolved.map((paper, idx) => {
                const doi = paper.doi
                    ? (paper.doi.startsWith('http') ? paper.doi : `https://doi.org/${paper.doi}`)
                    : null;
                
                // Final safety check: if title or authors are missing, use DOI or placeholder
                const authorsText = (paper.authors && paper.authors.trim() !== "") ? escHtml(paper.authors) + ', ' : '';
                const titleText   = (paper.title && paper.title.trim() !== "") ? escHtml(paper.title) : (paper.doi || "Untitled Paper");

                return `<li class="project-paper-item">
                    ${authorsText}
                    &ldquo;${titleText},&rdquo;
                    ${paper.venue ? `<em>${escHtml(paper.venue)}</em>, ` : ''}
                    ${paper.year ? escHtml(paper.year) : ''}
                    ${doi ? ` &mdash; <a href="${doi}" target="_blank" rel="noopener">DOI</a>` : ''}
                </li>`;
            }).join('');
            papersHtml = `<div class="project-papers">
                <div class="project-papers-title"><i class="fas fa-file-alt"></i> Related Publications</div>
                <ol class="project-papers-list">${paperItems}</ol>
            </div>`;
        }
    }

    return `
        <div class="project-card">
            <div class="project-card-header">
                <span class="project-status-badge ${p.status}">${p.status === 'ongoing' ? 'Ongoing' : 'Completed'}</span>
                <div class="project-titles">
                    ${p.title_ko ? `<div class="project-title-ko">${escHtml(p.title_ko)}</div>` : ''}
                    ${p.title_en ? `<div class="project-title-en">${escHtml(p.title_en)}</div>` : ''}
                </div>
            </div>
            <div class="project-info">${infoRows.join('')}</div>
            ${ackHtml}
            ${papersHtml}
        </div>
    `;
}

// ===================================
// Helper HTML builders
// ===================================
function pubItem(p) {
    const title = p.title || '';
    const authors = p.authors || '';
    const venue = p.journal || p.booktitle || p.venue || '';
    const year = p.year || '';
    const doi = p.doi ? `<a href="https://doi.org/${p.doi}" target="_blank" rel="noopener">DOI</a>` : '';
    return `
        <div class="pub-item">
            <div class="pub-authors">${escHtml(authors)}</div>
            <div class="pub-title">${escHtml(title)}</div>
            <div><span class="pub-venue">${escHtml(venue)}</span>${year ? `, <span class="pub-year">${year}</span>` : ''}${doi ? ` — ${doi}` : ''}</div>
        </div>
    `;
}

// escHtml and normalizeAuthorName are defined in utils.js (loaded first)

// ===================================
// Skeleton Screen helpers
// ===================================

function skeletonNews(count = 3) {
    return Array.from({ length: count }, () => `
        <div class="skeleton-news-item">
            <div class="skeleton skeleton-news-date"></div>
            <div class="skeleton skeleton-news-text"></div>
        </div>`).join('');
}

function skeletonCards(count = 3) {
    return `<div class="card-grid">${Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton skeleton-card-icon"></div>
            <div class="skeleton skeleton-card-title"></div>
            <div class="skeleton skeleton-card-line"></div>
            <div class="skeleton skeleton-card-line short"></div>
        </div>`).join('')}</div>`;
}

function skeletonPubs(count = 4) {
    return Array.from({ length: count }, () => `
        <div class="skeleton-pub-item">
            <div class="skeleton skeleton-pub-num"></div>
            <div class="skeleton-pub-body">
                <div class="skeleton skeleton-pub-title"></div>
                <div class="skeleton skeleton-pub-authors"></div>
                <div class="skeleton skeleton-pub-venue"></div>
            </div>
        </div>`).join('');
}

// ===================================
// Scholarly SEO — JSON-LD helpers
// ===================================

function injectJsonLd(id, data) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('script');
        el.id = id;
        el.type = 'application/ld+json';
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data, null, 2);
}

function injectLabJsonLd(labData) {
    const lab = labData && labData.lab;
    if (!lab) return;
    injectJsonLd('jsonld-org', {
        '@context': 'https://schema.org',
        '@type': 'Person',
        'name': lab.name,
        'url': window.location.origin,
        'email': lab.email,
        'description': lab.description,
        'affiliation': lab.affiliation ? {
            '@type': 'CollegeOrUniversity',
            'name': lab.affiliation
        } : undefined,
        'sameAs': [lab.googleScholar, lab.orcid, lab.researchgate, lab.linkedin, lab.github].filter(Boolean)
    });
}

function injectPublicationsJsonLd(cvData) {
    if (!cvData || !cvData.publications) return;
    const pubs = [
        ...(cvData.publications.early_access || []),
        ...(cvData.publications.journals || []),
        ...(cvData.publications.conferences || [])
    ];
    const items = pubs.map(p => {
        const doiUrl = p.doi
            ? (p.doi.startsWith('http') ? p.doi : 'https://doi.org/' + p.doi)
            : p.url;
        const authorList = (p.author || '').split(/\s+and\s+/).map(a => {
            const name = normalizeAuthorName(a);
            const parts = name.split(' ');
            return {
                '@type': 'Person',
                'name': name,
                'familyName': parts[parts.length - 1],
                'givenName': parts.slice(0, -1).join(' ')
            };
        });
        const item = {
            '@type': 'ScholarlyArticle',
            'name': p.title,
            'author': authorList,
            'datePublished': p.year
        };
        if (doiUrl) item['url'] = doiUrl;
        if (doiUrl && p.doi) item['sameAs'] = doiUrl;
        if (p.journal) item['isPartOf'] = { '@type': 'Periodical', 'name': p.journal };
        if (p.booktitle) item['isPartOf'] = { '@type': 'Event', 'name': p.booktitle };
        return item;
    });
    injectJsonLd('jsonld-pubs', {
        '@context': 'https://schema.org',
        '@graph': items
    });
}

// ===================================
// Empty / Error State helper
// ===================================

function emptyState(icon, message, hint = '') {
    return `<div class="empty-state">
        <div class="empty-state-icon"><i class="fas ${icon}"></i></div>
        <div class="empty-state-message">${escHtml(message)}</div>
        ${hint ? `<div class="empty-state-hint">${escHtml(hint)}</div>` : ''}
    </div>`;
}

// ===================================
// Main
// ===================================
document.addEventListener('DOMContentLoaded', async () => {
    loadSharedComponents(); // must be first — injects nav/footer into DOM
    initTheme();
    highlightActiveNav();
    initMobileNav();
    initBackToTop();
    initScrollReveal();

    // Register Service Worker for PWA offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* non-critical */ });
    }

    document.getElementById('darkModeToggle')?.addEventListener('click', toggleTheme);

    // Mobile floating dark mode button
    const mobileBtn = document.createElement('button');
    mobileBtn.id = 'mobileDarkToggle';
    mobileBtn.className = 'mobile-dark-toggle';
    mobileBtn.setAttribute('aria-label', 'Toggle dark mode');
    const currentTheme = document.documentElement.getAttribute('data-theme');
    mobileBtn.innerHTML = currentTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    mobileBtn.addEventListener('click', toggleTheme);
    document.body.appendChild(mobileBtn);

    const mainEl = document.querySelector('[data-page]');
    const page = mainEl ? mainEl.getAttribute('data-page') : 'home';

    try {
        let labData = null;
        let cvData = null;

        // labData is needed by all pages (publications uses it for the member filter)
        labData = await fetchJSON(LAB_DATA_PATH);

        if (page === 'publications' || page === 'home' || page === 'projects') {
            try { cvData = await fetchJSON(CV_DATA_PATH); } catch (e) { /* optional */ }
        }

        setOwner(labData && labData.lab);
        setJournalMetrics(labData && labData.journalMetrics);

        switch (page) {
            case 'home':
                renderHome(labData);
                injectLabJsonLd(labData);
                break;
            case 'news':    renderNews(labData); break;
            case 'research': renderResearch(labData); break;
            case 'publications':
                renderPublications(cvData, labData);
                renderScholarMetrics(labData);
                break;
            case 'projects': renderProjects(labData, cvData); break;
        }
    } catch (err) {
        console.error('Lab page error:', err);
    }
});

// Hero ASCII particle + spotlight effect
(function () {
    const hero = document.querySelector('.lab-hero');
    if (!hero) return;

    const spotlight = hero.querySelector('.hero-spotlight');

    // Tiered pools: heavy → medium → light
    const POOL_HEAVY = ['@','#','$','%','&','M','W','B','8','0'];
    const POOL_MED   = ['+','=','*','!','?','~','^','<','>','x','o','s','n'];
    const POOL_LIGHT = ['-',':',';','_','.','`',','];

    function sample(arr, n) {
        return arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
    }

    // 3 heavy + 3 medium + 3 light = 9 steps, ~220ms each → clearly visible
    function makeSeq() {
        return [...sample(POOL_HEAVY, 3), ...sample(POOL_MED, 3), ...sample(POOL_LIGHT, 3)];
    }
    const CELL = 14; // grid cell size in px (~2× char width at 0.72rem monospace)

    function snapGrid(v) { return Math.round(v / CELL) * CELL; }

    let lastSpawn = 0;
    const occupied = new Set(); // prevent stacking on same cell simultaneously

    function spawnParticle(gx, gy) {
        const key = `${gx},${gy}`;
        if (occupied.has(key)) return;
        occupied.add(key);

        const el = document.createElement('span');
        el.className = 'hero-ascii-particle';
        el.style.animation = 'none';
        el.style.opacity = '0.9';
        el.style.left = `${gx}px`;
        el.style.top  = `${gy}px`;
        const seq = makeSeq();
        el.textContent = seq[0];

        document.body.appendChild(el);

        const duration = 900 + Math.random() * 200;
        const stepTime = duration / seq.length;
        const sizeStart = 1.0;
        const sizeEnd   = 0.45;
        let idx = 0;

        el.style.fontSize = `${sizeStart}rem`;

        const timer = setInterval(() => {
            idx++;
            if (idx >= seq.length) {
                clearInterval(timer);
                el.remove();
                occupied.delete(key);
                return;
            }
            el.textContent = seq[idx];
            const t = idx / (seq.length - 1);
            el.style.fontSize = `${sizeStart + (sizeEnd - sizeStart) * t}rem`;
        }, stepTime);

        setTimeout(() => {
            clearInterval(timer);
            el.remove();
            occupied.delete(key);
        }, duration + 200);
    }

    function updateSpotlight(clientX, clientY) {
        const rect = hero.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        spotlight.style.background =
            `radial-gradient(400px circle at ${x}px ${y}px, rgba(255,255,255,0.09), transparent 65%)`;
    }

    // Mouse (desktop)
    hero.addEventListener('mouseenter', () => {
        spotlight.style.opacity = '1';
    });

    function spawnAround(cx, cy) {
        const gx = snapGrid(cx);
        const gy = snapGrid(cy);
        const RADIUS = 2; // cells in each direction (5×5 area)
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            for (let dy = -RADIUS; dy <= RADIUS; dy++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                const prob = dist === 0 ? 1.0 : dist === 1 ? 0.6 : dist === 2 ? 0.3 : 0.1;
                if (Math.random() < prob) {
                    spawnParticle(gx + dx * CELL, gy + dy * CELL);
                }
            }
        }
    }

    hero.addEventListener('mousemove', (e) => {
        updateSpotlight(e.clientX, e.clientY);
        const now = Date.now();
        if (now - lastSpawn > 50) {
            spawnAround(e.clientX, e.clientY);
            lastSpawn = now;
        }
    });

    hero.addEventListener('mouseleave', () => {
        spotlight.style.opacity = '0';
    });

    // Touch (mobile)
    hero.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        updateSpotlight(touch.clientX, touch.clientY);
        const now = Date.now();
        if (now - lastSpawn > 60) {
            spawnAround(touch.clientX, touch.clientY);
            lastSpawn = now;
        }
    }, { passive: true });

    hero.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        spotlight.style.opacity = '1';
        updateSpotlight(touch.clientX, touch.clientY);
        spawnAround(touch.clientX, touch.clientY);
    }, { passive: true });

    hero.addEventListener('touchend', () => {
        spotlight.style.opacity = '0';
    }, { passive: true });
}());
