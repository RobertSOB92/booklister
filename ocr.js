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
      .map(l => cleanLine(l))
      .filter(l => l.length >= 3)
      .filter(l => {
        if (/^\d[\d\s\-]+$/.test(l)) return false;
        if (/isbn|ean|www\.|http|©|copyright|wydaw|print/i.test(l)) return false;
        if (/^[\s\-_\.]+$/.test(l)) return false;
        if (/\b(tom|część|vol\.?|wydanie)\b/i.test(l) && l.length < 12) return false;

        const letters = l.replace(/[^a-złóśćąęźżń0-9A-ZŁÓŚĆĄĘŹŻŃ]/g, '').length;
        const chars = Math.max(l.length, 1);
        return letters / chars > 0.20 && letters >= 2;
      })
      .slice(0, 24);

    if (lines.length === 0) return { title: '', author: '' };

    const authorKeywords = /^(autor[:\s]|by[:\s]|napisał|napisała|tekst[:\s])/i;
    let author = '';
    let title = '';
    const usedIndexes = new Set();

    // 1. Find author by explicit keyword
    for (let i = 0; i < lines.length; i++) {
      if (authorKeywords.test(lines[i])) {
        author = cleanLine(lines[i].replace(authorKeywords, ''));
        usedIndexes.add(i);
        break;
      }
    }

    // 2. Find author by "person name" heuristic near top/bottom
    if (!author) {
      let bestAuthorScore = -1;
      let bestAuthorIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const score = scoreAuthorLine(l, i, lines.length);
        if (score > bestAuthorScore) {
          bestAuthorScore = score;
          bestAuthorIndex = i;
        }
      }
      if (bestAuthorScore >= 10 && bestAuthorIndex >= 0) {
        author = lines[bestAuthorIndex];
        usedIndexes.add(bestAuthorIndex);
      }
    }

    // 3. Find title as best single line or a combined adjacent line
    let bestTitleScore = -1;
    for (let i = 0; i < lines.length; i++) {
      if (usedIndexes.has(i)) continue;
      const l = lines[i];
      if (l.length < 4) continue;
      const score = scoreTitleLine(l, i, lines.length);
      if (score > bestTitleScore) {
        bestTitleScore = score;
        title = l;
      }

      const next = lines[i + 1];
      if (next && !usedIndexes.has(i + 1)) {
        const combined = cleanLine(`${l} ${next}`);
        if (combined.length >= 8 && combined.length <= 95) {
          const combinedScore = scoreTitleLine(combined, i, lines.length) + 3;
          if (combinedScore > bestTitleScore) {
            bestTitleScore = combinedScore;
            title = combined;
          }
        }
      }
    }

    return {
      title: cleanLine(title),
      author: cleanLine(author),
    };
  }

  function cleanLine(line) {
    return (line || '')
      .replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]+/, '')
      .replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreAuthorLine(line, idx, total) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return -5;
    if (line.length > 40) return -5;
    if (!/^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\-\.'\s]+$/.test(line)) return -8;
    if (/\b(tom|część|wydanie|powieść)\b/i.test(line)) return -10;

    const properCaseCount = words.filter(w => /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ\-']*\.?$/.test(w)).length;
    const properRatio = properCaseCount / words.length;
    let score = properRatio * 10 + (words.length <= 3 ? 2 : 0);

    const nearTop = idx <= 2 ? 2 : 0;
    const nearBottom = idx >= total - 3 ? 2 : 0;
    score += nearTop + nearBottom;

    return score;
  }

  function scoreTitleLine(line, idx, total) {
    if (!line) return -20;
    const words = line.split(/\s+/).filter(Boolean);
    const isAllCaps = line === line.toUpperCase() && line.length > 4;
    const hasTitleKeywords = /\b(harry|potter|hobbit|władca|pierścieni|zbrodnia|kara|lalka|gra|tron|książę|pan|tom)\b/i.test(line);

    let score = Math.min(line.length * 1.4, 45);
    if (isAllCaps) score += 6;
    if (hasTitleKeywords) score += 4;
    if (looksLikePersonName(line)) score -= 14;
    if (/\b(wydawnictwo|przekład|redakcja|wydanie|stron)\b/i.test(line)) score -= 14;
    if (words.length === 1 && line.length < 6) score -= 8;

    const middleBoost = idx >= 1 && idx <= Math.ceil(total / 2) ? 2 : 0;
    score += middleBoost;

    return score;
  }

  function looksLikePersonName(line) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) return false;
    return words.every(w => /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ\-']*\.?$/.test(w));
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
