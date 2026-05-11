const cheerio = require('cheerio');

async function search() {
  const url = 'https://lubimyczytac.pl/ksiazka/65832/jak-powstal-harry-potter-wywiad-z-j-k-rowling';
  const bookRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const bookHtml = await bookRes.text();
  const $ = cheerio.load(bookHtml);
  console.log("Book Title:", $('title').text());
  
  // Try to find description
  console.log("description block length:", $('[data-full-description]').length);
  $('[data-full-description]').each((i, el) => {
     console.log("data-full-description", i, $(el).attr('data-full-description').slice(0, 100));
  });

  const texts = $('.collapse-content').map((i, el) => $(el).text().trim()).get();
  texts.forEach((t, i) => console.log("collapse-content", i, t.slice(0, 100)));
}
search();
