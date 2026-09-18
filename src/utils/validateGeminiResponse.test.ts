import { describe, it, expect } from 'vitest';
import { validateGeminiResponse } from './validateGeminiResponse';

describe('validateGeminiResponse', () => {
  it('should return isValid false when no JSON found', () => {
    const result = validateGeminiResponse('To jest zwykły tekst bez JSONa.');
    expect(result.isValid).toBe(false);
  });

  it('should extract and parse valid JSON from markdown fences', () => {
    const result = validateGeminiResponse('Here is the book:\n```json\n{"title":"A","author":"B","description":"C","sourceUrl":"D"}\n```');
    expect(result.isValid).toBe(true);
    expect(result.data?.title).toBe('A');
  });

  it('should fail if title is missing', () => {
    const result = validateGeminiResponse('{"author":"B","description":"C","sourceUrl":"D"}');
    expect(result.isValid).toBe(false);
  });
});
