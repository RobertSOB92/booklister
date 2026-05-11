const cheerio = require('cheerio');
async function search() {
  const url = 'https://lubimyczytac.pl/ksiazka/65832/jak-powstal-harry-potter-wywiad-z-j-k-rowling';
  const bookRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const bookHtml = await bookRes.text();
  const $ = cheerio.load(bookHtml);
  
  // print out all large text blocks
  $('div').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 200 && text.length < 1000 && !text.includes('ocen') && !text.includes('Czytelnicy')) {
       console.log("Found div class=", $(el).attr('class'), "id=", $(el).attr('id'));
       console.log(text.slice(0, 100));
       console.log("---");
    }
  });
}
search();
