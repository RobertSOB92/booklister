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
      // More lenient filtering for better results
      .filter(l => {
        // Skip pure numbers/ISBN/codes
        if (/^\d[\d\s\-]+$/.test(l)) return false;
        if (/isbn|ean|www\.|http|©|copyright|wydaw|print/i.test(l)) return false;
        // Skip pure symbols/dashes
        if (/^[\s\-_\.]+$/.test(l)) return false;
        
        const letters = l.replace(/[^a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]/g, '').length;
        const chars = l.length;
        // More lenient: 20% letters is ok (down from 35%)
        return letters / chars > 0.20 && letters >= 2;
      })
      .slice(0, 20); // Increased from 15 to find better matches

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

    // 2. Author heuristic (usually top/bottom of cover, shorter lines)
    if (!author) {
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const l = lines[i];
        const words = l.split(/\s+/).filter(w => w.length > 0);
        
        // Look for 1-4 words in proper case (likely author names)
        if (words.length >= 1 && words.length <= 4) {
          const isProperCase = words.every(w => 
            /^[A-ZŁÓŚĆĄĘŹŻŃ][a-złóśćąęźżńA-ZŁÓŚĆĄĘŹŻŃ]*\.?$/.test(w)
          );
          
          // Also accept mixed case names that look like names
          const isNameLike = !isProperCase && l.length <= 30 && /^[A-Za-z\s\-'\.]+$/.test(l);
          
          if (isProperCase || (isNameLike && i < 3)) {
            author = l;
            usedIndexes.add(i);
            break;
          }
        }
      }
    }

    // 3. Title heuristic (longest/most significant remaining line)
    let bestTitleScore = -1;
    for (let i = 0; i < lines.length; i++) {
      if (usedIndexes.has(i)) continue;
      const l = lines[i];
      
      // Skip very short lines that are unlikely to be titles
      if (l.length < 4) continue;
      
      const isAllCaps = l === l.toUpperCase() && l.length > 4;
      const hasCommonKeywords = /harry|potter|twilight|hunger|games|hobbit|lord|rings|series|pamiętnik|władca|gra|pną/i.test(l);
      
      // More balanced scoring: prefer longer lines but not excessively
      const baseScore = Math.min(l.length * 1.5, 40);
      const capsBonus = isAllCaps ? 8 : 0;
      const keywordBonus = hasCommonKeywords ? 5 : 0;
      const score = baseScore + capsBonus + keywordBonus;
      
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
   * Canvas-based image preprocessing with adaptive filters.
   * Adapted to handle various book cover designs and lighting conditions.
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
        
        // Adaptive preprocessing:
        // - Brightness boost for dark covers
        // - Moderate contrast (not too aggressive)
        // - Grayscale for consistency
        // - Invert option for light text on dark backgrounds
        const filterStr = options.invert 
          ? `brightness(1.05) contrast(1.5) grayscale(1) invert(1)`
          : `brightness(1.15) contrast(1.4) grayscale(1)`;
        
        ctx.filter = filterStr;
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
