/**
 * ocr.js — OCR module using Tesseract.js
 * Extracts text from book cover images and parses title/author
 */

const OCR = (() => {
  let worker = null;
  let workerReady = false;
  let initPromise = null;

  /** Lazy-init Tesseract worker (loaded from CDN) */
  async function getWorker() {
    if (workerReady) return worker;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // Tesseract.js is loaded via CDN script tag in index.html
      worker = await Tesseract.createWorker('pol+eng', 1, {
        logger: () => {}, // suppress verbose logs
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      });
      workerReady = true;
      return worker;
    })();

    return initPromise;
  }

  /**
   * Run OCR on an image file or blob
   * @param {File|Blob|string} source
   * @param {function} onProgress
   * @returns {Promise<{rawText: string, title: string, author: string}>}
   */
  async function recognize(source, onProgress) {
    // Preprocess image first for better OCR accuracy on stylized covers
    let processedSource = source;
    try {
      processedSource = await preprocessImage(source);
    } catch (e) {
      console.warn('[OCR] Preprocessing failed, using original:', e.message);
    }

    const w = await getWorker();
    const result = await w.recognize(processedSource);
    const rawText = result.data.text || '';

    if (onProgress) onProgress(0.8);

    const parsed = parseBookText(rawText);
    return { rawText, ...parsed };
  }

  /**
   * Parse raw OCR text → best guess for title and author.
   * Heuristics for Polish book covers:
   *  - Author is typically SMALL text (first 1-3 lines) or contains known patterns
   *  - Title is typically LARGE/BOLD text (often all-caps or mid-section)
   *  - Lines with numbers/ISBNs are ignored
   *  - Lines shorter than 3 chars are ignored
   */
  function parseBookText(raw) {
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 3)
      .filter(l => !/^\d[\d\s\-]+$/.test(l))          // strip pure number lines
      .filter(l => !/isbn|ean|www\.|http/i.test(l))    // strip ISBN/URL lines
      .filter(l => !/©|copyright|wydaw|print/i.test(l)) // strip publisher boilerplate
      .slice(0, 12); // look at first 12 meaningful lines

    if (lines.length === 0) return { title: '', author: '' };

    // Check for explicit author keyword in Polish/English
    const authorKeywords = /^(autor[:\s]|by[:\s]|napisał|napisała|tekst[:\s])/i;

    let author = '';
    let title = '';
    let usedIndexes = new Set();

    for (let i = 0; i < lines.length; i++) {
      if (authorKeywords.test(lines[i])) {
        author = lines[i].replace(authorKeywords, '').trim();
        usedIndexes.add(i);
        break;
      }
    }

    // If no explicit keyword: heuristic — author lines tend to be shorter,
    // title lines tend to be longer or ALL CAPS
    if (!author) {
      // Find best "author candidate" — short line, proper-case words
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const words = lines[i].split(/\s+/);
        const isProperCase = words.every(w => /^[A-ZŁÓŚĆĄĘŹŻŃ][a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]+\.?$/.test(w));
        const isShort = words.length >= 1 && words.length <= 4;
        if (isProperCase && isShort) {
          author = lines[i];
          usedIndexes.add(i);
          break;
        }
      }
    }

    // Title: find the longest / all-caps line not used as author
    let bestTitleScore = -1;
    for (let i = 0; i < lines.length; i++) {
      if (usedIndexes.has(i)) continue;
      const l = lines[i];
      // Score: prefer longer lines and ALL-CAPS lines
      const isAllCaps = l === l.toUpperCase() && l.length > 3;
      const score = l.length * (isAllCaps ? 1.5 : 1.0);
      if (score > bestTitleScore) {
        bestTitleScore = score;
        title = l;
      }
    }

    // Swap if title looks like a person name and author looks like a book title
    if (title && author) {
      const titleWords = title.split(/\s+/);
      const authorWords = author.split(/\s+/);
      if (authorWords.length > 4 && titleWords.length <= 2) {
        [title, author] = [author, title];
      }
    }

    // Clean up excess whitespace
    title = title.replace(/\s+/g, ' ').trim();
    author = author.replace(/\s+/g, ' ').trim();

    return { title, author };
  }

  /**
   * Canvas-based image preprocessing: grayscale + contrast boost.
   * Helps Tesseract read decorative / coloured fonts on dark backgrounds.
   */
  function preprocessImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        // Scale down very large images (> 2000px on longest side) to save time
        const MAX = 2000;
        const scale = Math.min(MAX / Math.max(img.width, img.height), 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
          // Luminance-weighted grayscale
          const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          // S-curve contrast stretch (darkens shadows, brightens highlights)
          const norm = gray / 255;
          const c = norm < 0.5
            ? 2 * norm * norm
            : 1 - Math.pow(-2 * norm + 2, 2) / 2;
          const v = Math.min(255, Math.round(c * 255 * 1.1)); // slight brightness boost
          d[i] = d[i+1] = d[i+2] = v;
        }

        ctx.putImageData(imgData, 0, 0);

        // Return as Blob so Tesseract can consume it
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('canvas toBlob failed')),
          'image/png'
        );

        // Revoke object URL created below (if applicable)
        if (img._revokeUrl) URL.revokeObjectURL(img._revokeUrl);
      };

      img.onerror = () => reject(new Error('Image load failed'));

      if (source instanceof File || source instanceof Blob) {
        const url = URL.createObjectURL(source);
        img._revokeUrl = url;
        img.src = url;
      } else {
        img.src = source;
      }
    });
  }

  /** Terminate worker to free memory */
  async function terminate() {
    if (worker) {
      await worker.terminate();
      worker = null;
      workerReady = false;
      initPromise = null;
    }
  }

  return { recognize, parseBookText, terminate };
})();
