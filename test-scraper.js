async function test() {
    const phrase = "Harry Potter Rowling";
    const searchUrl = 'https://lubimyczytac.pl/szukaj/ksiazki?phrase=' + encodeURIComponent(phrase);
    console.log("Fetching", searchUrl);
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      }
    });
    console.log("Search status:", searchRes.status);
    const searchHtml = await searchRes.text();
    const linkMatch = searchHtml.match(/href="(\/ksiazka\/\d+\/[^"?]+)"/);
    if (!linkMatch) {
      console.log("No link match found. HTML sample:", searchHtml.slice(0, 500));
      return;
    }
    const bookUrl = 'https://lubimyczytac.pl' + linkMatch[1];
    console.log("Found book:", bookUrl);
    
    const bookRes = await fetch(bookUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      }
    });
    console.log("Book status:", bookRes.status);
    const bookHtml = await bookRes.text();
    
    let description = '';
    const descMatch = bookHtml.match(/itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) description = descMatch[1];
    console.log("Description length:", description.length);
}
test();
