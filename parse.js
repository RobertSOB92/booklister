const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('book.html', 'utf8');
const $ = cheerio.load(html);

// Try common description selectors
console.log("description:", $('[itemprop="description"]').text().trim().slice(0, 200));
console.log("book-description:", $('.book-description').text().trim().slice(0, 200));
console.log("collapse-content:", $('#book-description .collapse-content').text().trim().slice(0, 200));
