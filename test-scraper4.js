async function test() {
    const bookUrl = 'https://lubimyczytac.pl/ksiazka/224647/felix-net-i-nika-oraz-trzecia-kuzynka';
    const bookRes = await fetch(bookUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      }
    });
    const bookHtml = await bookRes.text();
    const match = bookHtml.match(/data-full-description="([^"]+)"/i);
    if (match) console.log("FOUND BY DATA-FULL-DESCRIPTION:", match[1].slice(0, 100));
    
    // search for words
    const idx = bookHtml.indexOf('Wakacje z duchami? Prawie.');
    if (idx !== -1) {
       console.log("Found text around:", bookHtml.slice(idx - 50, idx + 200));
    }
}
test();
