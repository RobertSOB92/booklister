import type { BookResult } from "../types/book";

export const formatBookHeader = (book: BookResult): string => {
  return `${book.title} - ${book.author}`;
};

export const formatBookContent = (book: BookResult, prefix: string): string => {
  const cleanPrefix = prefix.trim();
  if (cleanPrefix) {
    return `${cleanPrefix}\n\n${book.description}`;
  }
  return book.description;
};

export const formatAllResults = (books: BookResult[], prefix: string): string => {
  return books.map((book) => {
    const cleanPrefix = prefix.trim();
    const header = `${book.title} - ${book.author}${cleanPrefix ? ' ' + cleanPrefix : ''}`;
    return `${header}\n\n${book.description}\nSource: ${book.sourceUrl}`;
  }).join('\n\n---\n\n');
};
