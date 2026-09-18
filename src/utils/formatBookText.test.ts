import { describe, it, expect } from 'vitest';
import { formatBookHeader, formatBookContent, formatAllResults } from './formatBookText';
import type { BookResult } from '../types/book';

describe('formatBookText utilities', () => {
  const book: BookResult = {
    title: 'Test Title',
    author: 'Test Author',
    description: 'This is a test description.',
    sourceUrl: 'https://example.com'
  };

  it('should format header correctly', () => {
    expect(formatBookHeader(book)).toBe('Test Title - Test Author');
  });

  it('should format content correctly without prefix', () => {
    expect(formatBookContent(book, '')).toBe('This is a test description.');
    expect(formatBookContent(book, '   ')).toBe('This is a test description.');
  });

  it('should format content correctly with prefix', () => {
    expect(formatBookContent(book, '#Polecajka')).toBe('#Polecajka\n\nThis is a test description.');
  });

  it('should format all results correctly without prefix', () => {
    const expected = `Test Title - Test Author\n\nThis is a test description.`;
    expect(formatAllResults([book], '')).toBe(expected);
  });

  it('should format all results correctly with prefix', () => {
    const expected = `Test Title - Test Author #Polecajka\n\nThis is a test description.`;
    expect(formatAllResults([book], '#Polecajka')).toBe(expected);
  });
});
