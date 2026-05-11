const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('book.html', 'utf8');
const $ = cheerio.load(html);
console.log("Title:", $('title').text());
console.log("Body length:", $('body').text().length);
