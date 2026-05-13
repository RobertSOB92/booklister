/**
 * ocr.js — OCR module with Cloudflare AI fallback to Tesseract.js
 * Extracts text from book cover images and returns title/author.
 */

const OCR = (() => {
  const API_ENDPOINT = '/api/ocr';
  let tesseractWorker = null;

  /**
   * Initialize Tesseract.js worker (lazy loaded).
   */
  async function initTesseract() {
    if (tesseractWorker) return tesseractWorker;

    if (typeof Tesseract === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5/dist/tesseract.min.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    tesseractWorker = await Tesseract.createWorker({
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5/tesseract-core.wasm.js',
    });

    return tesseractWorker;
  }

  /**
   * Extract text using Tesseract.js client-side.
   */
  async function recognizeWithTesseract(source, onProgress) {
    const worker = await initTesseract();

    if (onProgress) onProgress(0.15);

    const blob = source instanceof Blob ? source : new Blob([source]);
    const result = await worker.recognize(blob, 'eng+pol');

    if (onProgress) onProgress(0.85);

    const rawText = result.data.text || '';
    const lines = rawText.split(/\n/).filter(l => l.trim().length > 3);

    return {
      rawText,
      title: lines[0] || '',
      author: lines[1] || '',
    };
  }

  /**
   * Try Cloudflare API first, fallback to Tesseract.js if it fails.
   */
  async function recognize(source, onProgress) {
    if (!(source instanceof File || source instanceof Blob)) {
      throw new Error('OCR: input must be File or Blob');
    }

    if (onProgress) onProgress(0.15);

    const formData = new FormData();
    formData.append('image', source);

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        if (onProgress) onProgress(0.85);
        const data = await res.json();
        return {
          rawText: data.rawText || '',
          title: data.title || '',
          author: data.author || '',
        };
      }
    } catch (err) {
      console.warn('[OCR] API failed, falling back to Tesseract.js:', err.message);
    }

    // Fallback to client-side Tesseract.js
    console.log('[OCR] Using Tesseract.js fallback');
    return recognizeWithTesseract(source, onProgress);
  }

  /**
   * Cleanup Tesseract worker.
   */
  async function terminate() {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  }

  return { recognize, terminate };
})();
