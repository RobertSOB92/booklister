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
        'User-Agent': 'Mozilla/5.0 (compatible; BookBot/1.0)',
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.5',
        'Accept': 'text/html,application/xhtml+xml',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    if (!searchRes.ok) {
      return Response.json({ description: '', source: null }, { headers });
    }

    const searchHtml = await searchRes.text();

    // Extract first book slug — pattern: href="/ksiazka/12345/slug"
    const linkMatch = searchHtml.match(/href="(\/ksiazka\/\d+\/[^"?]+)"/);
    if (!linkMatch) {
      return Response.json({ description: '', source: null, _debug_html: searchHtml.slice(0, 500) }, { headers });
    }

    const bookPath = linkMatch[1];
    const bookUrl  = 'https://lubimyczytac.pl' + bookPath;

    // ── Step 2: Fetch book page ────────────────────────────
    const bookRes = await fetch(bookUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BookBot/1.0)',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });

    if (!bookRes.ok) {
      return Response.json({ description: '', source: bookUrl, _debug_status: bookRes.status }, { headers });
    }

    const bookHtml = await bookRes.text();

    // ── Step 3: Extract description ────────────────────────
    let description = '';

    // Try: itemprop="description" block
    const descMatch = bookHtml.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      description = stripTags(descMatch[1]);
    }

    // Try: id="book-description"
    if (!description) {
      const bookDescMatch = bookHtml.match(/id="book-description"[^>]*>([\s\S]*?)<\/div>/i);
      if (bookDescMatch) {
        description = stripTags(bookDescMatch[1]);
      }
    }

    // Fallback: collapse-content block
    if (!description) {
      const collapseMatch = bookHtml.match(/class="collapse-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (collapseMatch) {
        description = stripTags(collapseMatch[1]);
      }
    }

    // Fallback: data-full-description attribute
    if (!description) {
      const attrMatch = bookHtml.match(/data-full-description="([^"]+)"/i);
      if (attrMatch) {
        description = attrMatch[1].replace(/&#(\d+);/g, (_, n) =>
          String.fromCharCode(parseInt(n))
        );
      }
    }

    description = description.slice(0, 900).trim();

    return Response.json(
      { description, source: bookUrl },
      { headers }
    );

  } catch (err) {
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
