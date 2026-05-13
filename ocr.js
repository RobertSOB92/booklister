/**
 * ocr.js — OCR module using Cloudflare AI
 * Extracts text from book cover images and returns title/author.
 */

const OCR = (() => {
  const API_ENDPOINT = '/api/ocr';

  /**
   * Run OCR on an image file via Cloudflare Pages Function.
   */
  async function recognize(source, onProgress) {
    if (!(source instanceof File || source instanceof Blob)) {
      throw new Error('OCR: input must be File or Blob');
    }

    if (onProgress) onProgress(0.15);

    const formData = new FormData();
    formData.append('image', source);

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(45000),
    });

    if (onProgress) onProgress(0.85);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `OCR API returned ${res.status}`);
    }

    const data = await res.json();
    return {
      rawText: data.rawText || '',
      title: data.title || '',
      author: data.author || '',
    };
  }

  /** No-op — worker runs server-side */
  async function terminate() {}

  return { recognize, terminate };
})();
