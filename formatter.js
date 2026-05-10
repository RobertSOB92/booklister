/**
 * formatter.js — OLX auction description generator
 * Format: prefix → description → book data
 * sourceUrl is NOT included in the copy text (shown only in UI)
 */

const Formatter = (() => {

  function generateOLX(book, prefix = '', opts = {}) {
    const lines = [];

    // ── 1. Prefix ────────────────────────────────────────────
    if (prefix && prefix.trim()) {
      lines.push(prefix.trim());
      lines.push('');
    }

    // ── 2. Description ───────────────────────────────────────
    if (book.description && book.description.trim()) {
      lines.push('📖 Opis:');
      splitIntoChunks(book.description.trim(), 350).forEach(c => lines.push(c));
      lines.push('');
    }

    // ── 3. Book data ─────────────────────────────────────────
    lines.push('─'.repeat(30));
    lines.push('');
    lines.push(`📚 ${book.title || 'Tytuł nieznany'}`);

    if (book.author)    lines.push(`✍️  Autor: ${book.author}`);
    if (book.publisher) lines.push(`🏢 Wydawnictwo: ${book.publisher}`);
    if (book.year)      lines.push(`📅 Rok wydania: ${book.year}`);
    if (book.pages)     lines.push(`📄 Liczba stron: ${book.pages}`);
    if (book.isbn)      lines.push(`🔢 ISBN: ${book.isbn}`);
    if (opts.condition) lines.push(`📦 Stan: ${opts.condition}`);

    return lines.join('\n');
  }

  function generateBatch(books, prefix = '') {
    return books
      .map((book, idx) => {
        const sep = `═══ Książka ${idx + 1}/${books.length} ═══`;
        return [sep, '', generateOLX(book, prefix, { condition: book._condition || '' })].join('\n');
      })
      .join('\n\n\n');
  }

  function splitIntoChunks(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let cur = '';
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + sentence).length > maxLen && cur) {
        chunks.push(cur.trim());
        cur = sentence;
      } else {
        cur = cur ? cur + ' ' + sentence : sentence;
      }
    }
    if (cur) chunks.push(cur.trim());
    return chunks;
  }

  return { generateOLX, generateBatch };
})();
