/**
 * Cloudflare Pages Function — /api/description
 * Scrapes Polish book description from LubimyCzytac.pl
 * Runs server-side so no CORS issues.
 *
 * Query params: ?title=...&author=...
 */

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const title  = (searchParams.get('title')  || '').trim();
  const author = (searchParams.get('author') || '').trim();

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400',
  };

  if (!title && !author) {
    return Response.json({ description: '', source: null }, { headers });
  }

  try {
    const phrase = [title, author].filter(Boolean).join(' ');

    // ── Step 1: Search LubimyCzytac ───────────────────────
    const searchUrl =
      'https://lubimyczytac.pl/szukaj/ksiazki?phrase=' +
      encodeURIComponent(phrase);

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://lubimyczytac.pl/',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!searchRes.ok) {
      console.log(`[LubimyCzytac] Search failed with status ${searchRes.status}`);
      return Response.json({ description: '', source: null }, { headers });
    }

    const searchHtml = await searchRes.text();

    // Extract ALL book links, then pick best match by title/slug word overlap
    const allLinks = [...searchHtml.matchAll(/href="(\/ksiazka\/\d+\/([^"?]+))"[^>]*>([^<]{3,})<\/a>/g)];
    const unique = new Map();
    for (const m of allLinks) {
      if (!unique.has(m[1])) unique.set(m[1], { path: m[1], slug: m[2], linkTitle: m[3].trim() });
    }
    const candidates = [...unique.values()];

    if (!candidates.length) {
      console.log('[LubimyCzytac] No book links found in search results');
      return Response.json({ description: '', source: null }, { headers });
    }

    // Score each candidate by word overlap with search phrase
    const normWords = s => s.toLowerCase()
      .replace(/[^\w\s]/g, ' ').split(/[\s\-_]+/).filter(w => w.length >= 3);
    const needles = normWords(phrase);

    function titleScore(cand) {
      const hay = normWords(cand.linkTitle + ' ' + cand.slug);
      if (!needles.length) return 0;
      return needles.filter(w => hay.some(h => h.includes(w) || w.includes(h))).length / needles.length;
    }

    const best = candidates.reduce((a, b) => titleScore(a) >= titleScore(b) ? a : b);
    if (titleScore(best) < 0.25) {
      console.log('[LubimyCzytac] No good match found, best score:', titleScore(best));
      return Response.json({ description: '', source: null }, { headers });
    }

    const bookPath = best.path;
    const bookUrl  = 'https://lubimyczytac.pl' + bookPath;

    // ── Step 2: Fetch book page with retry ────────────────
    let bookRes = null;
    let bookHtml = '';
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        bookRes = await fetch(bookUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'pl-PL,pl;q=0.9',
            'Accept': 'text/html,application/xhtml+xml',
            'Referer': searchUrl,
          },
          cf: { cacheTtl: 86400, cacheEverything: true },
        });

        if (bookRes.ok) {
          bookHtml = await bookRes.text();
          break;
        }
      } catch (err) {
        console.log(`[LubimyCzytac] Book fetch attempt ${attempt} failed:`, err.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!bookHtml) {
      console.log('[LubimyCzytac] Could not fetch book page');
      return Response.json({ description: '', source: bookUrl }, { headers });
    }

    // ── Step 3: Extract description (try multiple selectors) ──
    let description = '';

    // Try 1: itemprop="description" block (primary)
    let match = bookHtml.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) {
      description = stripTags(match[1]);
    }

    // Try 2: id="book-description" or data-full-description
    if (!description) {
      match = bookHtml.match(/id="book-description"[^>]*>([\s\S]*?)<\/div>/i);
      if (match) {
        description = stripTags(match[1]);
      }
    }

    // Try 3: class="collapse-content" (collapsible section)
    if (!description) {
      match = bookHtml.match(/class="collapse-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (match) {
        description = stripTags(match[1]);
      }
    }

    // Try 4: data-full-description attribute
    if (!description) {
      match = bookHtml.match(/data-full-description="([^"]+)"/i);
      if (match) {
        description = match[1].replace(/&#(\d+);/g, (_, n) =>
          String.fromCharCode(parseInt(n))
        );
      }
    }

    // Try 5: Look for any paragraph-like content in book info section
    if (!description) {
      match = bookHtml.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      if (match) {
        description = stripTags(match[1]);
      }
    }

    description = description.slice(0, 900).trim();

    return Response.json(
      { description, source: bookUrl },
      { headers }
    );

  } catch (err) {
    console.error('[LubimyCzytac] Error:', err.message);
    // Never fail the whole request — just return empty
    return Response.json(
      { description: '', source: null, _error: err.message },
      { headers }
    );
  }
}

/** Strip HTML tags and normalise whitespace */
function stripTags(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
