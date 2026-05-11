async function test() {
    const bookUrl = 'https://lubimyczytac.pl/ksiazka/65832/jak-powstal-harry-potter-wywiad-z-j-k-rowling';
    const bookRes = await fetch(bookUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      }
    });
    const bookHtml = await bookRes.text();
    const match = bookHtml.match(/collapse-content[^>]*>([\s\S]*?)<\/div>/i);
    if (match) console.log("Found collapse-content:", match[1].slice(0, 100));
    else console.log("collapse-content NOT FOUND");
    
    // try finding description visually
    const idx = bookHtml.indexOf('Potter to jeden z najbardziej');
    if (idx !== -1) {
       console.log("Found text around:", bookHtml.slice(idx - 100, idx + 100));
    } else {
        // Find other description
        const b = bookHtml.indexOf('class="collapse-content"');
        console.log("indexOf collapse-content:", b);
        if (b !== -1) console.log(bookHtml.slice(b, b + 500));
    }
}
test();
