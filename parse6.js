const fs = require('fs');
const html = fs.readFileSync('book.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);
console.log("book-description html:", $('#book-description').html());
