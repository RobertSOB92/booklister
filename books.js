/**
 * books.js — Book lookup module (no AI)
 * Primary:  Google Books API — free-form search
 * Fallback: Open Library API
 *
 * Search strategy (in order):
 *  1. Google Books — free-form "title author"
 *  2. Google Books — title only
 *  3. Google Books — good words extracted from raw OCR text
 *  4. Open Library — free-form title+author
 */

const Books = (() => {
  const cache = new Map();

  /* ── Public API ───────────────────────────────────────── */

  /**
   * @param {string} title
   * @param {string} author
   * @param {string} [rawText]  raw OCR dump used as last-resort fallback
   */
  async function search(title, author, rawText = '') {
    const primaryQ = buildQuery(title, author);
    const cacheKey = (primaryQ || rawText).toLowerCase().trim().slice(0, 120);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    let result = null;

    // 1 — free-form "title author"
    if (primaryQ) {
      result = await googleFreeForm(primaryQ);
      if (result && !validateResult(title, author, result)) {
        console.warn('[Books] Rejected (low similarity):', result.title);
        result = null;
      }
    }

    // 2 — title only (drop possibly-garbage author)
    if (!result && title && title.trim()) {
      result = await googleFreeForm(title.trim());
      if (result && !validateResult(title, '', result)) result = null;
    }

    // 3 — good words from raw OCR (skip validation — OCR is garbage anyway)
    if (!result && rawText) {
      const words = goodOcrWords(rawText);
      console.log('[Books] OCR good words:', words);
      if (words.length >= 2) {
        result = await googleFreeForm(words.join(' '));
        // accept any result here since we trust the API more than our OCR
      }
    }

    // 4 — Open Library fallback
    if (!result && primaryQ) {
      result = await searchOpenLibrary(title, author);
      if (result && !validateResult(title, author, result)) result = null;
    }

    // 5 — Open Library with raw OCR words
    if (!result && rawText) {
      const words = goodOcrWords(rawText);
      if (words.length >= 2) {
        result = await searchOpenLibrary(words.slice(0, 4).join(' '), '');
      }
    }

    if (result) {
      // Description priority: Wikipedia (PL) → LubimyCzytac → OL
      if (!result.description) {
        const descTitle  = result.title  || title;
        const descAuthor = result.author || author;
        result.description =
          await fetchWikipediaDescription(descTitle, descAuthor) ||
          await fetchLubimyCzytacDescription(descTitle, descAuthor) ||
          await fetchOLDescriptionOnly(descTitle, descAuthor);
      }
      cache.set(cacheKey, result);
    }
    return result;
  }

  /* ── Polish Wikipedia description ─────────────────────── */
  /**
   * Searches pl.wikipedia.org and returns the intro extract of the
   * best-matching article. Works client-side (no CORS issues).
   */
  async function fetchWikipediaDescription(title, author) {
    if (!title) return '';
    try {
      const q = [title, author].filter(Boolean).join(' ');
      const searchUrl =
        'https://pl.wikipedia.org/w/api.php' +
        '?action=query&list=search&srnamespace=0&srlimit=6&format=json&origin=*' +
        '&srsearch=' + encodeURIComponent(q);

      const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
      if (!sr.ok) return '';
      const sd = await sr.json();
      const results = sd.query?.search || [];
      if (!results.length) return '';

      // Pick best article: score by word overlap, boost novel articles, penalise films
      const norm = s => (s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);

      const needles = norm(title);
      const scored = results.map(r => {
        const hay = norm(r.title);
        const hits = needles.filter(w => hay.some(h => h.includes(w) || w.includes(h))).length;
        const base = needles.length ? hits / needles.length : 0;
        const boost = r.title.includes('powieść') ? 0.25
                    : (r.title.includes('film') || r.title.includes('gra')) ? -0.3 : 0;
        return { title: r.title, score: base + boost };
      }).sort((a, b) => b.score - a.score);

      if (!scored.length || scored[0].score < 0.3) return '';

      const wTitle = scored[0].title;
      const exUrl =
        'https://pl.wikipedia.org/w/api.php' +
        '?action=query&prop=extracts&exintro=1&exsentences=6&format=json&origin=*' +
        '&titles=' + encodeURIComponent(wTitle);

      const ex = await fetch(exUrl, { signal: AbortSignal.timeout(7000) });
      if (!ex.ok) return '';
      const ed = await ex.json();
      const pages = Object.values(ed.query?.pages || {});
      const raw = pages[0]?.extract || '';
      const text = raw
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800);

      return text.length > 80 ? text : '';
    } catch (e) {
      console.warn('[Books] Wikipedia error:', e.message);
      return '';
    }
  }

  /* ── LubimyCzytac (via Cloudflare Pages Function) ────── */
  /**
   * Calls /api/description — only works when deployed on CF Pages.
   * Falls back silently when running locally (file://).
   * Includes timeout and error handling.
   */
  async function fetchLubimyCzytacDescription(title, author) {
    if (window.location.protocol === 'file:') return '';
    try {
      const params = new URLSearchParams();
      if (title)  params.set('title',  title);
      if (author) params.set('author', author);
      
      const res = await fetch(`/api/description?${params}`, {
        signal: AbortSignal.timeout(14000), // Increased from 12s to allow retries
      });
      
      if (!res.ok) {
        console.warn('[Books] LubimyCzytac returned status:', res.status);
        return '';
      }
      
      const data = await res.json();
      const desc = (data.description || '').trim();
      
      if (desc) {
        console.log('[Books] LubimyCzytac description found:', desc.slice(0, 50) + '...');
      }
      
      return desc;
    } catch (e) {
      console.warn('[Books] LubimyCzytac error:', e.message);
      return '';
    }
  }

  /* ── Google Books (free-form) ─────────────────────────── */

  async function googleFreeForm(query) {
    if (!query || !query.trim()) return null;
    try {
      const base =
        'https://www.googleapis.com/books/v1/volumes' +
        `?q=${encodeURIComponent(query.trim())}` +
        '&maxResults=3&printType=books';

      // 1st try: Polish edition
      let res = await fetchWithRetry(base + '&langRestrict=pl', 9000);
      let data = res ? res : {};

      // 2nd try: any language
      if (!data.items?.length) {
        res = await fetchWithRetry(base, 9000);
        data = res ? res : {};
      }

      if (!data.items?.length) return null;

      const gbItem = data.items[0];
      const result = normalizeGoogleBook(gbItem);

      // Search results often omit description — fetch full volume if needed
      if (!result.description && gbItem.id) {
        result.description = await fetchGoogleVolumeDescription(gbItem.id);
      }

      return result;
    } catch (e) {
      console.warn('[Books] Google error:', e.message);
      return null;
    }
  }

  /** Fetch with timeout and basic retry logic */
  async function fetchWithRetry(url, timeoutMs = 9000, maxAttempts = 2) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return await res.json();
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        if (attempt === maxAttempts) throw e;
        console.warn(`[Books] Attempt ${attempt} failed, retrying...`, e.message);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return null;
  }

  /** Fetch full volume record to get complete description */
  async function fetchGoogleVolumeDescription(volumeId) {
    try {
      const url = `https://www.googleapis.com/books/v1/volumes/${volumeId}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return '';
      const data = await res.json();
      return clean(data.volumeInfo?.description || '');
    } catch (e) {
      console.warn('[Books] Volume description fetch failed:', e.message);
      return '';
    }
  }

  function normalizeGoogleBook(item) {
    const info = item.volumeInfo || {};
    return {
      title:       fixEncoding(info.title || ''),
      author:      fixEncoding((info.authors || []).join(', ')),
      description: clean(info.description || ''),
      publisher:   fixEncoding(info.publisher || ''),
      year:        (info.publishedDate || '').slice(0, 4),
      isbn:        extractISBN(info.industryIdentifiers),
      pages:       info.pageCount ? String(info.pageCount) : '',
      language:    info.language || '',
      categories:  fixEncoding((info.categories || []).slice(0, 2).join(', ')),
      coverUrl:    (info.imageLinks?.thumbnail || '').replace('http:', 'https:'),
      sourceUrl:   info.infoLink || `https://books.google.com/books?id=${item.id}`,
      source:      'Google Books',
    };
  }

  /* ── Open Library ─────────────────────────────────────── */

  async function searchOpenLibrary(title, author) {
    try {
      const parts = [];
      if (title)  parts.push(`title=${encodeURIComponent(title)}`);
      if (author) parts.push(`author=${encodeURIComponent(author)}`);
      if (!parts.length) return null;

      const url =
        'https://openlibrary.org/search.json?' +
        parts.join('&') +
        '&limit=3&fields=key,title,author_name,first_publish_year,number_of_pages_median,isbn,publisher,cover_i,subject';

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.warn('[Books] OL search returned:', res.status);
        return null;
      }
      const data = await res.json();
      if (!data.docs?.length) return null;

      const doc = data.docs[0];
      let description = '';
      if (doc.key) {
        description = await olDescription(doc.key);
      }

      return {
        title:       fixEncoding(doc.title || ''),
        author:      fixEncoding((doc.author_name || []).join(', ')),
        description: clean(description),
        publisher:   fixEncoding((doc.publisher || [])[0] || ''),
        year:        String(doc.first_publish_year || ''),
        isbn:        (doc.isbn || [])[0] || '',
        pages:       doc.number_of_pages_median ? String(doc.number_of_pages_median) : '',
        language:    '',
        categories:  fixEncoding((doc.subject || []).slice(0, 3).join(', ')),
        coverUrl:    doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : '',
        sourceUrl:   `https://openlibrary.org${doc.key}`,
        source:      'Open Library',
      };
    } catch (e) {
      console.warn('[Books] Open Library error:', e.message);
      return null;
    }
  }

  /** Fetch description from OL even if Google Books found the book */
  async function fetchOLDescriptionOnly(title, author) {
    try {
      const parts = [];
      if (title)  parts.push(`title=${encodeURIComponent(title)}`);
      if (author) parts.push(`author=${encodeURIComponent(author)}`);
      if (!parts.length) return '';

      // Try Polish edition first (language=pol)
      let url = `https://openlibrary.org/search.json?${parts.join('&')}&language=pol&limit=1&fields=key`;
      let res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      let data = res.ok ? await res.json() : {};

      // Fallback: any language
      if (!data.docs?.length) {
        url = `https://openlibrary.org/search.json?${parts.join('&')}&limit=1&fields=key`;
        res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        data = res.ok ? await res.json() : {};
      }

      const key = data.docs?.[0]?.key;
      if (!key) {
        console.warn('[Books] No OL key found for', title, author);
        return '';
      }
      return await olDescription(key);
    } catch (e) {
      console.warn('[Books] OL description-only fetch error:', e.message);
      return '';
    }
  }

  async function olDescription(workKey) {
    try {
      const res = await fetch(`https://openlibrary.org${workKey}.json`,
        { signal: AbortSignal.timeout(9000) });
      if (!res.ok) {
        console.warn('[Books] OL description endpoint returned:', res.status);
        return '';
      }
      const data = await res.json();
      const d = data.description;
      const raw = typeof d === 'string' ? d : (d?.value || '');
      
      if (raw) {
        console.log('[Books] OL description found:', raw.slice(0, 50) + '...');
      }
      
      return clean(raw);
    } catch (e) {
      console.warn('[Books] OL description error:', e.message);
      return '';
    }
  }

  /* ── Result validation ────────────────────────────────── */

  function validateResult(searchTitle, searchAuthor, result) {
    const norm = s =>
      (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);

    const sq = norm([searchTitle, searchAuthor].join(' '));
    const rq = norm([result.title, result.author].join(' '));

    if (sq.length === 0) return true;

    let matches = 0;
    for (const w of sq) {
      if (rq.some(r => r === w || r.includes(w) || w.includes(r))) matches++;
    }
    const ratio = matches / sq.length;
    console.log(`[Books] Similarity ${Math.round(ratio * 100)}% — "${result.title}"`);
    return ratio >= 0.20;
  }

  /* ── OCR word extraction ──────────────────────────────── */

  const PL_STOPWORDS = new Set([
    'oraz', 'przez', 'tego', 'jest', 'jako', 'przy', 'tylko',
    'jego', 'czy', 'ale', 'dla', 'jak', 'ten', 'tej',
  ]);

  /** Extract words from raw OCR text that are likely real words (not pipe chars etc.) */
  function goodOcrWords(rawText) {
    return (rawText || '')
      .replace(/[|\\\/\[\]{}<>]/g, ' ')   // remove common OCR noise chars
      .split(/[\s,;:.!?()"\n]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 4)
      .filter(w => /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+$/.test(w))  // only letters
      .filter(w => !PL_STOPWORDS.has(w.toLowerCase()))
      .slice(0, 8);  // take first 8 good words
  }

  /* ── Helpers ──────────────────────────────────────────── */

  function buildQuery(title, author) {
    return [title, author].filter(Boolean).map(s => s.trim()).filter(Boolean).join(' ');
  }

  function extractISBN(ids) {
    if (!ids) return '';
    return (ids.find(i => i.type === 'ISBN_13') || ids.find(i => i.type === 'ISBN_10'))?.identifier || '';
  }

  const PL_MOJIBAKE = {
    'Ä…': 'ą', 'Ä‡': 'ć', 'Ä™': 'ę', 'Ĺ‚': 'ł', 'Ĺ„': 'ń', 'Ăł': 'ó', 'Ĺ›': 'ś', 'Ĺş': 'ź', 'Ĺź': 'ż',
    'Ä„': 'Ą', 'Ä†': 'Ć', 'Ä': 'Ę', 'Ĺ': 'Ł', 'Ĺƒ': 'Ń', 'Ă“': 'Ó', 'Ĺš': 'Ś', 'Ĺą': 'Ź', 'Ĺť': 'Ż',
    'RafaĹ ': 'Rafał ', 'KSIÄĹťKA': 'KSIĄŻKA'
  };

  /** Fix UTF-8 bytes mistakenly decoded as Latin-1 (common Open Library issue) */
  function fixEncoding(str) {
    if (!str) return str;
    try { 
      return decodeURIComponent(escape(str)); 
    } catch { 
      let s = str;
      for (const [bad, good] of Object.entries(PL_MOJIBAKE)) {
        s = s.split(bad).join(good);
      }
      return s;
    }
  }

  function clean(text) {
    return fixEncoding((text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 800));
  }

  return { search };
})();
