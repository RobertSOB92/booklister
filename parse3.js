const cheerio = require('cheerio');

async function search() {
  const url = 'https://lubimyczytac.pl/szukaj/ksiazki?phrase=Felix+Net+Nika+Trzecia+Kuzynka';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const html = await res.text();
  const $ = cheerio.load(html);
  const link = $('a[href^="/ksiazka/"]').first().attr('href');
  console.log("Found link:", link);
  
  if (!link) return;
  const bookRes = await fetch('https://lubimyczytac.pl' + link, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const bookHtml = await bookRes.text();
  const $b = cheerio.load(bookHtml);
  console.log("Book Title:", $b('title').text());
  
  // Try to find description
  console.log("collapse-content length:", $b('.collapse-content').text().length);
  $b('.collapse-content').each((i, el) => {
     console.log("collapse-content block", i, $b(el).text().trim().slice(0, 100));
  });
}
search();
