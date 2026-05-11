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
   * Dual-pass: Normal + Inverted (for light text on dark covers)
   */
  async function recognize(source, onProgress) {
    const w = await getWorker();
    
    // Pass 1: Standard high-contrast
    const imgNormal = await preprocessImage(source, { invert: false });
    const resNormal = await w.recognize(imgNormal);
    const textNormal = resNormal.data.text || '';
    
    if (onProgress) onProgress(0.4);

    // Pass 2: Inverted (Crucial for Harry Potter and dark covers)
    const imgInverted = await preprocessImage(source, { invert: true });
    const resInverted = await w.recognize(imgInverted);
    const textInverted = resInverted.data.text || '';

    if (onProgress) onProgress(0.8);

    // Pick the best text (the one that looks more like a book title)
    const parsedNormal = parseBookText(textNormal);
    const parsedInverted = parseBookText(textInverted);
    
    // Heuristic: pick the one that found a more "solid" title or specific keywords
    const scoreN = parsedNormal.title.length + (parsedNormal.author ? 10 : 0);
    const scoreI = parsedInverted.title.length + (parsedInverted.author ? 10 : 0);
    
    const useInverted = (scoreI > scoreN + 2) || 
                        (/harry|potter/i.test(textInverted) && !/harry|potter/i.test(textNormal));

    const finalResult = useInverted ? parsedInverted : parsedNormal;
    const rawText = `[PASS 1]\n${textNormal}\n\n[PASS 2 (INVERTED)]\n${textInverted}`;

    console.log('[OCR] Results:', { normal: parsedNormal, inverted: parsedInverted, picked: useInverted ? 'inverted' : 'normal' });

    return { rawText, ...finalResult };
  }

  /**
   * Parse raw OCR text → best guess for title and author.
   */
  function parseBookText(raw) {
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 3)
      // Filter out garbage lines like "kk i i :" or "......."
      .filter(l => {
        const letters = l.replace(/[^a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]/g, '').length;
        return letters / l.length > 0.35; // At least 35% of the line must be letters
      })
      .filter(l => !/^\d[\d\s\-]+$/.test(l))
      .filter(l => !/isbn|ean|www\.|http/i.test(l))
      .filter(l => !/©|copyright|wydaw|print/i.test(l))
      .slice(0, 15);

    if (lines.length === 0) return { title: '', author: '' };

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

    // 2. Author heuristic (usually top/bottom of the cover, shorter lines)
    if (!author) {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const words = lines[i].split(/\s+/);
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
      const score = l.length * (isAllCaps ? 2.0 : 1.0) * (hasHarry ? 10.0 : 1.0);
      
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

  /**
   * Canvas-based image preprocessing with filters.
   */
  function preprocessImage(source, options = { invert: false }) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2048;
        const scale = Math.min(MAX / Math.max(img.width, img.height), 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        
        // Use browser-native filters for speed and quality
        ctx.filter = `brightness(1.1) contrast(1.8) grayscale(1) ${options.invert ? 'invert(1)' : ''}`;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(b => b ? resolve(b) : reject(), 'image/png');
        if (img._revokeUrl) URL.revokeObjectURL(img._revokeUrl);
      };
      img.onerror = () => reject();
      
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
