/**
 * books.js — Book lookup module (no AI)
 * Primary:  Google Books API — free-form search
 * Fallback: Open Library API
 *
 * Search strategy (in order):
 *  1. ISBN-first from OCR text
 *  2. Google Books candidates (title+author / title / OCR words)
 *  3. Open Library candidates
 *  4. Candidate ranking + manual selection in UI
 */

const Books = (() => {
  const cache = new Map();

  /* ── Public API ───────────────────────────────────────── */

  /**
   * Backward-compatible single-result API.
   * @param {string} title
   * @param {string} author
   * @param {string} [rawText]
   */
  async function search(title, author, rawText = '') {
    const { book } = await searchWithCandidates(title, author, rawText);
    return book;
  }

  /**
   * ISBN-first lookup + ranked candidates from multiple sources.
   * @param {string} title
   * @param {string} author
   * @param {string} [rawText]
   * @returns {Promise<{book: object|null, candidates: object[], detectedIsbn: string}>}
   */
  async function searchWithCandidates(title, author, rawText = '') {
    const primaryQ = buildQuery(title, author);
    const cacheKey = (primaryQ || rawText).toLowerCase().trim().slice(0, 180);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const candidates = [];
    const seen = new Set();
    const addCandidate = (book, reason = '') => {
      if (!book || !book.title) return;
      const key = [
        normalizeWords(book.title).join(' '),
        normalizeWords(book.author).join(' '),
        (book.isbn || '').replace(/[^0-9X]/gi, '')
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({
        ...book,
        _reason: reason,
      });
    };

    // 1) ISBN-first from OCR dump
    const isbnCandidates = extractIsbnCandidates(rawText);
    let detectedIsbn = isbnCandidates[0] || '';
    if (isbnCandidates.length) {
      for (const isbn of isbnCandidates.slice(0, 2)) {
        const gb = await searchGoogleByIsbn(isbn);
        if (gb) addCandidate(gb, `ISBN ${isbn} (Google)`);
        const ol = await searchOpenLibraryByIsbn(isbn);
        if (ol) addCandidate(ol, `ISBN ${isbn} (Open Library)`);
      }
    }

    // 2) Query-based candidates
    if (primaryQ) {
      const gb = await googleCandidates(primaryQ, 5);
      gb.forEach(b => addCandidate(b, 'Google: tytuł + autor'));
    }
    if (title && title.trim()) {
      const gbTitle = await googleCandidates(title.trim(), 4);
      gbTitle.forEach(b => addCandidate(b, 'Google: sam tytuł'));
    }
    if (rawText) {
      const words = goodOcrWords(rawText);
      if (words.length >= 2) {
        const gbWords = await googleCandidates(words.join(' '), 4);
        gbWords.forEach(b => addCandidate(b, 'Google: słowa z OCR'));
      }
    }

    const ol1 = await searchOpenLibraryCandidates(title, author, 4);
    ol1.forEach(b => addCandidate(b, 'Open Library'));

    if (rawText) {
      const words = goodOcrWords(rawText);
      if (words.length >= 2) {
        const ol2 = await searchOpenLibraryCandidates(words.slice(0, 4).join(' '), '', 3);
        ol2.forEach(b => addCandidate(b, 'Open Library: słowa z OCR'));
      }
    }

    // 3) Rank and pick best
    const ranked = candidates
      .map(c => ({
        ...c,
        _score: scoreBookCandidate(title, author, c.title, c.author, rawText),
      }))
      .sort((a, b) => b._score - a._score);

    const guarded = ranked.filter(c => candidatePassesGuards(title, author, rawText, c));
    let book = guarded[0] || null;

    if (book) {
      book.description = await ensurePolishDescription(
        book.description || '',
        book.title || title,
        book.author || author
      );
    }

    const payload = {
      book,
      candidates: ranked.slice(0, 6).map(({ _score, ...rest }) => rest),
      detectedIsbn,
    };

    cache.set(cacheKey, payload);
    return payload;
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

  /* ── Google Books (free-form + ISBN) ───────────────────── */

  async function googleCandidates(query, limit = 5) {
    if (!query || !query.trim()) return [];
    try {
      const maxResults = Math.min(Math.max(limit, 1), 10);
      const base =
        'https://www.googleapis.com/books/v1/volumes' +
        `?q=${encodeURIComponent(query.trim())}` +
        `&maxResults=${maxResults}&printType=books`;

      let data = await fetchWithRetry(base + '&langRestrict=pl', 9000);
      if (!data?.items?.length) {
        data = await fetchWithRetry(base, 9000);
      }
      if (!data?.items?.length) return [];

      return data.items
        .map(normalizeGoogleBook)
        .filter(b => b.title)
        .slice(0, maxResults);
    } catch (e) {
      console.warn('[Books] Google error:', e.message);
      return [];
    }
  }

  async function googleFreeForm(query) {
    const list = await googleCandidates(query, 5);
    return list[0] || null;
  }

  async function searchGoogleByIsbn(isbn) {
    if (!isbn) return null;
    const list = await googleCandidates(`isbn:${isbn}`, 3);
    return list[0] || null;
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
    const list = await searchOpenLibraryCandidates(title, author, 3);
    return list[0] || null;
  }

  async function searchOpenLibraryCandidates(title, author, limit = 4) {
    try {
      const parts = [];
      if (title)  parts.push(`title=${encodeURIComponent(title)}`);
      if (author) parts.push(`author=${encodeURIComponent(author)}`);
      if (!parts.length) return [];

      const url =
        'https://openlibrary.org/search.json?' +
        parts.join('&') +
        `&limit=${Math.min(Math.max(limit, 1), 10)}` +
        '&fields=key,title,author_name,first_publish_year,number_of_pages_median,isbn,publisher,cover_i,subject';

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.warn('[Books] OL search returned:', res.status);
        return [];
      }
      const data = await res.json();
      if (!data.docs?.length) return [];

      return data.docs
        .map(normalizeOpenLibraryDoc)
        .filter(d => d.title)
        .slice(0, limit);
    } catch (e) {
      console.warn('[Books] Open Library error:', e.message);
      return [];
    }
  }

  async function searchOpenLibraryByIsbn(isbn) {
    try {
      if (!isbn) return null;
      const url =
        `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}` +
        '&limit=1&fields=key,title,author_name,first_publish_year,number_of_pages_median,isbn,publisher,cover_i,subject';
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) return null;
      const data = await res.json();
      const doc = data.docs?.[0];
      if (!doc) return null;
      return normalizeOpenLibraryDoc(doc);
    } catch (e) {
      console.warn('[Books] Open Library ISBN error:', e.message);
      return null;
    }
  }

  function normalizeOpenLibraryDoc(doc) {
    return {
      title:       fixEncoding(doc.title || ''),
      author:      fixEncoding((doc.author_name || []).join(', ')),
      description: '',
      publisher:   fixEncoding((doc.publisher || [])[0] || ''),
      year:        String(doc.first_publish_year || ''),
      isbn:        (doc.isbn || [])[0] || '',
      pages:       doc.number_of_pages_median ? String(doc.number_of_pages_median) : '',
      language:    '',
      categories:  fixEncoding((doc.subject || []).slice(0, 3).join(', ')),
      coverUrl:    doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : '',
      sourceUrl:   doc.key ? `https://openlibrary.org${doc.key}` : '',
      source:      'Open Library',
    };
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

  async function ensurePolishDescription(current, title, author) {
    const currentDesc = clean(current || '');
    if (isLikelyPolish(currentDesc)) return currentDesc;

    const wiki = await fetchWikipediaDescription(title, author);
    if (isLikelyPolish(wiki)) return wiki;

    const lubimy = await fetchLubimyCzytacDescription(title, author);
    if (isLikelyPolish(lubimy)) return lubimy;

    const ol = await fetchOLDescriptionOnly(title, author);
    if (isLikelyPolish(ol)) return ol;

    // Keep output language consistent: if we fail to get PL text, return empty
    return '';
  }

  function chooseBestGoogleItem(searchTitle, searchAuthor, items) {
    const scored = (items || [])
      .map(item => ({
        item,
        score: scoreBookCandidate(
          searchTitle,
          searchAuthor,
          item?.volumeInfo?.title || '',
          (item?.volumeInfo?.authors || []).join(' ')
        ),
      }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.item || null;
  }

  function chooseBestOpenLibraryDoc(searchTitle, searchAuthor, docs) {
    const scored = (docs || [])
      .map(doc => ({
        doc,
        score: scoreBookCandidate(
          searchTitle,
          searchAuthor,
          doc?.title || '',
          (doc?.author_name || []).join(' ')
        ),
      }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.doc || null;
  }

  function scoreBookCandidate(searchTitle, searchAuthor, resultTitle, resultAuthor, rawText = '') {
    const st = normalizeWords(searchTitle);
    const sa = normalizeWords(searchAuthor);
    const rt = normalizeWords(resultTitle);
    const ra = normalizeWords(resultAuthor);
    const rawSignal = ocrSignalWords(rawText);

    const titleScore = overlapRatio(st, rt);
    const authorScore = overlapRatio(sa, ra);
    const rawTitleScore = overlapRatio(rt, rawSignal);
    const missingTitlePenalty = st.length && titleScore === 0 ? 0.25 : 0;
    const missingRawPenalty = rawSignal.length >= 4 && rawTitleScore === 0 ? 0.20 : 0;
    const strongPotterBoost =
      rawSignal.includes('harry') && rawSignal.includes('potter') &&
      rt.includes('harry') && rt.includes('potter') ? 0.6 : 0;
    const strongPotterPenalty =
      rawSignal.includes('potter') && !rt.includes('potter') ? 0.45 : 0;

    return (
      titleScore * 0.65 +
      authorScore * 0.15 +
      rawTitleScore * 0.20 +
      strongPotterBoost -
      missingTitlePenalty -
      missingRawPenalty -
      strongPotterPenalty
    );
  }

  function candidatePassesGuards(searchTitle, searchAuthor, rawText, candidate) {
    if (!candidate?.title) return false;

    const qWords = normalizeWords([searchTitle, searchAuthor].join(' '));
    const cWords = normalizeWords([candidate.title, candidate.author].join(' '));
    const cTitleWords = normalizeWords(candidate.title);
    const rawSignal = ocrSignalWords(rawText);

    const queryOverlap = overlapRatio(qWords, cWords);
    const rawOverlap = overlapRatio(cTitleWords, rawSignal);
    const score = scoreBookCandidate(searchTitle, searchAuthor, candidate.title, candidate.author, rawText);

    if (qWords.length >= 2) {
      if (queryOverlap < 0.38) return false;
      if (!validateResult(searchTitle, searchAuthor, candidate)) return false;
      return score >= 0.22;
    }

    if (rawSignal.length >= 3) {
      const topRaw = rawSignal.slice(0, 4);
      const hasTopAnchor = topRaw.some(w => cTitleWords.some(t => t === w || t.includes(w) || w.includes(t)));
      if (!hasTopAnchor && rawOverlap < 0.20) return false;
      return score >= 0.15;
    }

    return score >= 0.12;
  }

  function overlapRatio(a, b) {
    if (!a.length) return 0;
    const hits = a.filter(w => b.some(x => x === w || x.includes(w) || w.includes(x))).length;
    return hits / a.length;
  }

  function normalizeWords(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);
  }

  function isLikelyPolish(text) {
    const t = clean(text || '').toLowerCase();
    if (!t) return false;
    if (/[ąćęłńóśźż]/.test(t)) return true;

    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length) return false;

    const plMarkers = new Set([
      'się', 'oraz', 'który', 'która', 'które', 'jest', 'został', 'została',
      'powieść', 'książka', 'wydanie', 'autor', 'autorka', 'opowiada',
      'jego', 'jej', 'przez', 'więc', 'gdzie', 'także', 'czyli', 'po',
      'nie', 'dla', 'oraz', 'nad', 'pod', 'między', 'lat', 'roku'
    ]);
    const enMarkers = new Set([
      'the', 'and', 'with', 'this', 'that', 'from', 'into', 'about',
      'book', 'novel', 'story', 'author', 'published', 'edition'
    ]);

    let plHits = 0;
    let enHits = 0;
    for (const w of words) {
      if (plMarkers.has(w)) plHits++;
      if (enMarkers.has(w)) enHits++;
    }

    return plHits >= 2 || (plHits >= 1 && plHits >= enHits);
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

  function extractIsbnCandidates(rawText) {
    if (!rawText) return [];
    const chunks = rawText.match(/(?:97[89][\d\-\s]{10,18}|\d[\d\-\s]{8,15}[0-9Xx])/g) || [];
    const out = [];
    const seen = new Set();

    for (const chunk of chunks) {
      const compact = chunk.replace(/[^0-9Xx]/g, '').toUpperCase();
      if (compact.length === 13 && isValidIsbn13(compact)) {
        if (!seen.has(compact)) {
          seen.add(compact);
          out.push(compact);
        }
      } else if (compact.length === 10 && isValidIsbn10(compact)) {
        if (!seen.has(compact)) {
          seen.add(compact);
          out.push(compact);
        }
      }
    }

    if (out.length) {
      console.log('[Books] ISBN from OCR:', out);
    }
    return out;
  }

  function ocrSignalWords(rawText) {
    if (!rawText) return [];
    const stop = new Set([
      ...PL_STOPWORDS,
      'pass', 'inverted', 'ocr', 'wydawnictwo', 'stron', 'tom', 'volume',
      'book', 'novel', 'edition', 'copyright', 'printed'
    ]);
    const words = normalizeWords(rawText).filter(w => w.length >= 4 && !stop.has(w));
    const counts = new Map();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w)
      .slice(0, 20);
  }

  function isValidIsbn13(v) {
    if (!/^\d{13}$/.test(v)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += Number(v[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(v[12]);
  }

  function isValidIsbn10(v) {
    if (!/^\d{9}[\dX]$/.test(v)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Number(v[i]) * (10 - i);
    }
    const last = v[9] === 'X' ? 10 : Number(v[9]);
    sum += last;
    return sum % 11 === 0;
  }

  async function hydrateCandidate(candidate, searchTitle = '', searchAuthor = '') {
    if (!candidate) return null;
    const out = { ...candidate };
    out.description = await ensurePolishDescription(
      out.description || '',
      out.title || searchTitle,
      out.author || searchAuthor
    );
    return out;
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

  return {
    search,
    searchWithCandidates,
    hydrateCandidate,
  };
})();
