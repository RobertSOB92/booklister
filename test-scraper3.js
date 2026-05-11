async function test() {
    const bookUrl = 'https://lubimyczytac.pl/ksiazka/65832/jak-powstal-harry-potter-wywiad-z-j-k-rowling';
    const bookRes = await fetch(bookUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      }
    });
    const bookHtml = await bookRes.text();
    const idx = bookHtml.indexOf('Harry Potter to jeden z najbardziej');
    if (idx !== -1) {
       console.log(bookHtml.slice(idx - 100, idx + 100));
    } else {
        console.log("NOT FOUND BY EXACT TEXT");
    }
}
test();
