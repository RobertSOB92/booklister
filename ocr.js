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
      // Set parameters for better title/author detection
      await worker.setParameters({
        tessedit_pageseg_mode: '3', // Fully automatic page segmentation, but no OSD
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
      // Filter out garbage lines like "kk i i :" or "......."
      .filter(l => {
        const letters = l.replace(/[^a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]/g, '').length;
        return letters / l.length > 0.4; // At least 40% of the line must be letters
      })
      .filter(l => !/^\d[\d\s\-]+$/.test(l))
      .filter(l => !/isbn|ean|www\.|http/i.test(l))
      .filter(l => !/©|copyright|wydaw|print/i.test(l))
      .slice(0, 15);

    if (lines.length === 0) return { title: '', author: '' };

    console.log('[OCR] Candidate lines:', lines);

    const authorKeywords = /^(autor[:\s]|by[:\s]|napisał|napisała|tekst[:\s])/i;
    let author = '';
    let title = '';
    let usedIndexes = new Set();

    // 1. Find Author (look for known names or keywords)
    for (let i = 0; i < lines.length; i++) {
      if (authorKeywords.test(lines[i])) {
        author = lines[i].replace(authorKeywords, '').trim();
        usedIndexes.add(i);
        break;
      }
    }

    // 2. Author heuristic (usually top of the cover, shorter lines)
    if (!author) {
      for (let i = 0; i < Math.min(lines.length, 4); i++) {
        const words = lines[i].split(/\s+/);
        // Author usually has 2-3 words, starting with caps
        const isProperCase = words.every(w => /^[A-ZŁÓŚĆĄĘŹŻŃ][a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]+\.?$/.test(w));
        if (isProperCase && words.length >= 2 && words.length <= 3) {
          author = lines[i];
          usedIndexes.add(i);
          break;
        }
      }
    }

    // 3. Title heuristic (the most "significant" remaining line)
    let bestTitleScore = -1;
    for (let i = 0; i < lines.length; i++) {
      if (usedIndexes.has(i)) continue;
      const l = lines[i];
      const isAllCaps = l === l.toUpperCase() && l.length > 5;
      const hasHarry = /harry|potter/i.test(l);
      // Score: weight length, all-caps, and specific patterns
      const score = l.length * (isAllCaps ? 2.0 : 1.0) * (hasHarry ? 5.0 : 1.0);
      
      if (score > bestTitleScore) {
        bestTitleScore = score;
        title = l;
      }
    }

    return { 
      title: (title || '').replace(/\s+/g, ' ').trim(), 
      author: (author || '').replace(/\s+/g, ' ').trim() 
    };
  }

  function preprocessImage(source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2500;
        const scale = Math.min(MAX / Math.max(img.width, img.height), 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Soft contrast enhancement instead of hard binarization
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i], g = d[i+1], b = d[i+2];
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Increase contrast (gamma-like)
          let v = gray;
          if (v < 128) v = (v * v) / 128; // Darker darks
          else v = 255 - ((255 - v) * (255 - v) / 128); // Brighter brights
          
          d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, v));
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob(b => b ? resolve(b) : reject(), 'image/png');
      };
      img.src = (source instanceof File || source instanceof Blob) ? URL.createObjectURL(source) : source;
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
