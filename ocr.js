/**
 * ocr.js — OCR module using Tesseract.js (client-side)
 * Extracts text from book cover images with English + Polish support
 */

const OCR = (() => {
  let tesseractWorker = null;

  /**
   * Initialize Tesseract.js worker (lazy loaded).
   */
  async function initTesseract() {
    if (tesseractWorker) return tesseractWorker;

    // Load Tesseract.js from CDN
    if (typeof Tesseract === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.4/dist/tesseract.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    tesseractWorker = await Tesseract.createWorker({
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.2.0/tesseract-core.wasm.js',
      cacheMethod: 'IndexedDB',
    });

    return tesseractWorker;
  }

  /**
   * Run OCR on an image file using Tesseract.js
   */
  async function recognize(source, onProgress) {
    if (!(source instanceof File || source instanceof Blob)) {
      throw new Error('OCR: input must be File or Blob');
    }

    const worker = await initTesseract();

    if (onProgress) onProgress(0.2);

    // Run OCR with English + Polish languages
    const result = await worker.recognize(source, 'eng+pol');

    if (onProgress) onProgress(0.9);

    const rawText = result.data.text || '';
    const lines = rawText
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Extract title and author from recognized text
    // Assuming title is first significant line, author is second
    let title = '';
    let author = '';

    for (const line of lines) {
      if (line.length > 3 && !title) {
        title = line;
      } else if (line.length > 3 && title && !author) {
        author = line;
        break;
      }
    }

    return {
      rawText,
      title: title.slice(0, 150),
      author: author.slice(0, 100),
    };
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
