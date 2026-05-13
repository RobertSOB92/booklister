/**
 * app.js — BookLister main application
 * Orchestrates OCR → Book lookup → Description generation
 */

const App = (() => {
  /* ── State ─────────────────────────────────────────────── */
  const state = {
    books: [],
    settings: {
      prefix: '',
      autoSearch: true,
    },
    nextId: 1,
    processing: false,
  };

  /* ── BookItem structure ────────────────────────────────── */
  /*
    {
      id:          number,
      file:        File,
      imageUrl:    string (object URL),
      status:      'idle'|'ocr'|'searching'|'success'|'error',
      progress:    0-100,
      rawText:     string,
      ocrTitle:    string,
       ocrAuthor:   string,
       bookData:    object|null,
       candidates:  object[],
       detectedIsbn:string,
       editTitle:   string,
      editAuthor:  string,
      editDesc:    string,
      editPages:   string,
      editYear:    string,
      error:       string,
    }
  */

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    loadSettings();
    bindEvents();
    renderStats();
  }

  /* ── Settings persistence ──────────────────────────────── */
  function loadSettings() {
    try {
      const saved = localStorage.getItem('booklister_settings');
      if (saved) Object.assign(state.settings, JSON.parse(saved));
    } catch {}
    document.getElementById('setting-prefix').value = state.settings.prefix;
    updateAutoSearchToggle();
  }

  function saveSettings() {
    state.settings.prefix = document.getElementById('setting-prefix').value;
    try {
      localStorage.setItem('booklister_settings', JSON.stringify(state.settings));
    } catch {}
    showToast('✅ Ustawienia zapisane', 'success');
  }

  /* ── Event bindings ────────────────────────────────────── */
  function bindEvents() {
    // Upload zone
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => handleFiles(e.target.files));

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    // Header buttons
    document.getElementById('btn-copy-all').addEventListener('click', copyAll);
    document.getElementById('btn-clear-all').addEventListener('click', clearAll);

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-process-all').addEventListener('click', processAll);
    document.getElementById('btn-process-all-hdr').addEventListener('click', processAll);

    // Auto-search toggle
    document.getElementById('toggle-autosearch').addEventListener('click', () => {
      state.settings.autoSearch = !state.settings.autoSearch;
      updateAutoSearchToggle();
    });

    // Settings change auto-save prefix field on blur
    document.getElementById('setting-prefix').addEventListener('blur', () => {
      state.settings.prefix = document.getElementById('setting-prefix').value;
      try { localStorage.setItem('booklister_settings', JSON.stringify(state.settings)); } catch {}
    });
  }

  function updateAutoSearchToggle() {
    const btn = document.getElementById('toggle-autosearch');
    if (state.settings.autoSearch) btn.classList.add('on');
    else btn.classList.remove('on');
  }

  /* ── File handling ─────────────────────────────────────── */
  function handleFiles(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      showToast('⚠️ Wybierz pliki graficzne (JPG, PNG, WEBP)', 'error');
      return;
    }

    imageFiles.forEach(addBookItem);
    renderStats();

    if (state.settings.autoSearch) {
      const newItems = state.books.filter(b => b.status === 'idle');
      processItems(newItems);
    }
  }

  function addBookItem(file) {
    const id = state.nextId++;
    const item = {
      id,
      file,
      imageUrl: URL.createObjectURL(file),
      status: 'idle',
      progress: 0,
      rawText: '',
      ocrTitle: '',
      ocrAuthor: '',
      bookData: null,
      candidates: [],
      detectedIsbn: '',
      editTitle: '',
      editAuthor: '',
      editDesc: '',
      editPages: '',
      editYear: '',
      editCondition: 'używana, stan dobry',
      error: '',
    };
    state.books.push(item);
    renderCard(item);
  }

  /* ── Processing pipeline ───────────────────────────────── */
  async function processAll() {
    const pending = state.books.filter(b => b.status === 'idle' || b.status === 'error');
    if (pending.length === 0) {
      showToast('ℹ️ Brak książek do przetworzenia', '');
      return;
    }
    processItems(pending);
  }

  async function processItems(items) {
    for (const item of items) {
      await processSingle(item);
    }
    renderStats();
  }

  async function processSingle(item) {
    try {
      // ── Step 1: OCR ──────────────────────────────────
      updateItemStatus(item, 'ocr', 10, 'Rozpoznawanie tekstu…');

      const ocrResult = await OCR.recognize(item.file, (p) => {
        updateItemProgress(item, 10 + Math.round(p * 50));
      });

      item.rawText   = ocrResult.rawText;
      item.ocrTitle  = ocrResult.title;
      item.ocrAuthor = ocrResult.author;

      // Pre-fill editable fields from OCR if empty
      if (!item.editTitle)  item.editTitle  = ocrResult.title;
      if (!item.editAuthor) item.editAuthor = ocrResult.author;

      updateCardOcrFields(item);
      updateItemProgress(item, 55);

      // ── Step 2: Book search ──────────────────────────
      updateItemStatus(item, 'searching', 60, 'Wyszukiwanie książki…');

      const searchTitle  = item.editTitle  || ocrResult.title;
      const searchAuthor = item.editAuthor || ocrResult.author;

      const lookup = await Books.searchWithCandidates(searchTitle, searchAuthor, item.rawText);
      const bookData = lookup.book;
      item.bookData = bookData;
      item.candidates = lookup.candidates || [];
      item.detectedIsbn = lookup.detectedIsbn || '';

      if (bookData) {
        console.log('[App] Book found:', { title: bookData.title, source: bookData.source });
        // Fill editable fields from API (don't overwrite user edits)
        if (!item.editTitle  || item.editTitle  === ocrResult.title)  item.editTitle  = bookData.title  || item.editTitle;
        if (!item.editAuthor || item.editAuthor === ocrResult.author) item.editAuthor = bookData.author || item.editAuthor;
        if (!item.editDesc)   item.editDesc  = bookData.description || '';
        if (!item.editPages)  item.editPages = bookData.pages || '';
        if (!item.editYear)   item.editYear  = bookData.year  || '';
      } else {
        console.warn('[App] No book data found for:', searchTitle, searchAuthor);
      }

      updateItemProgress(item, 90);

      // ── Step 3: Format description ───────────────────
      const formatted = generateDescription(item);
      item.formattedText = formatted;

      updateItemStatus(item, 'success', 100, '');
      renderCardBody(item);

    } catch (err) {
      console.error('[App] Error processing item', item.id, err);
      item.error = err.message || 'Nieznany błąd';
      updateItemStatus(item, 'error', 0, '');
      renderCardBody(item);
    }

    renderStats();
  }

  function generateDescription(item) {
    const bookData = item.bookData || {};
    const merged = {
      ...bookData,
      title:       item.editTitle  || bookData.title  || '',
      author:      item.editAuthor || bookData.author || '',
      description: item.editDesc  || bookData.description || '',
      pages:       item.editPages || bookData.pages || '',
      year:        item.editYear  || bookData.year  || '',
    };
    return Formatter.generateOLX(merged, state.settings.prefix, {
      condition: item.editCondition || '',
    });
  }

  /* ── DOM Updates ───────────────────────────────────────── */
  function updateItemStatus(item, status, progress, label) {
    item.status   = status;
    item.progress = progress;
    item.statusLabel = label;
    updateCardStatusUI(item);
  }

  function updateItemProgress(item, progress) {
    item.progress = progress;
    const fill = document.getElementById(`progress-${item.id}`);
    if (fill) fill.style.width = `${progress}%`;
  }

  function updateCardStatusUI(item) {
    const badge   = document.getElementById(`badge-${item.id}`);
    const progress = document.getElementById(`progress-wrap-${item.id}`);
    const fill    = document.getElementById(`progress-${item.id}`);
    const card    = document.getElementById(`card-${item.id}`);

    if (!badge) return;

    // Card border
    if (card) {
      card.className = `book-card status-${item.status}`;
    }

    // Badge
    const badgeDefs = {
      idle:      { cls: 'badge-idle',       icon: '⏳', label: 'Oczekuje' },
      ocr:       { cls: 'badge-processing', icon: 'spinner', label: item.statusLabel || 'OCR…' },
      searching: { cls: 'badge-processing', icon: 'spinner', label: item.statusLabel || 'Szukanie…' },
      success:   { cls: 'badge-success',    icon: '✅', label: 'Gotowe' },
      error:     { cls: 'badge-error',      icon: '❌', label: 'Błąd' },
    };

    const def = badgeDefs[item.status] || badgeDefs.idle;
    badge.className = `card-status-badge ${def.cls}`;

    if (def.icon === 'spinner') {
      badge.innerHTML = `<span class="badge-spinner"></span> ${def.label}`;
    } else {
      badge.innerHTML = `${def.icon} ${def.label}`;
    }

    // Progress bar
    if (progress) {
      progress.style.display = (item.status === 'ocr' || item.status === 'searching') ? 'block' : 'none';
    }
    if (fill) fill.style.width = `${item.progress}%`;
  }

  function updateCardOcrFields(item) {
    const titleEl  = document.getElementById(`field-title-${item.id}`);
    const authorEl = document.getElementById(`field-author-${item.id}`);
    if (titleEl && !titleEl.value)  titleEl.value  = item.editTitle;
    if (authorEl && !authorEl.value) authorEl.value = item.editAuthor;
  }

  /* ── Card rendering ────────────────────────────────────── */
  function renderCard(item) {
    const container = document.getElementById('cards-container');
    const empty = document.getElementById('empty-state');
    if (empty) empty.style.display = 'none';

    const card = document.createElement('div');
    card.id = `card-${item.id}`;
    card.className = 'book-card status-idle';
    card.innerHTML = buildCardHeaderHTML(item);
    container.appendChild(card);
  }

  function buildCardHeaderHTML(item) {
    return `
      <div class="card-header">
        <img
          class="card-thumb"
          src="${item.imageUrl}"
          alt="Okładka"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
        />
        <div class="card-thumb-placeholder" style="display:none">📚</div>

        <div class="card-meta">
          <div class="card-filename">${escHtml(item.file.name)}</div>
          <span id="badge-${item.id}" class="card-status-badge badge-idle">⏳ Oczekuje</span>

          <div id="progress-wrap-${item.id}" style="display:none" class="card-progress-bar">
            <div id="progress-${item.id}" class="card-progress-fill" style="width:0%"></div>
          </div>

          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px"
              onclick="App.retryItem(${item.id})">🔄 Re-OCR</button>
          </div>
        </div>

        <button class="card-remove" title="Usuń" onclick="App.removeItem(${item.id})">✕</button>
      </div>
      <div id="card-body-${item.id}" class="card-body" style="display:none"></div>
    `;
  }

  function renderCardBody(item) {
    const bodyEl = document.getElementById(`card-body-${item.id}`);
    if (!bodyEl) return;

    if (item.status === 'error') {
      bodyEl.style.display = 'block';
      bodyEl.innerHTML = `
        <div class="error-msg">
          ⚠️ <div><strong>Błąd przetwarzania</strong><br>${escHtml(item.error)}</div>
        </div>
        ${item.rawText ? `
          <details>
            <summary>Surowy tekst OCR</summary>
            <div class="ocr-raw">${escHtml(item.rawText)}</div>
          </details>
        ` : ''}
      `;
      return;
    }

    if (item.status !== 'success') {
      bodyEl.style.display = 'none';
      return;
    }

    const book = item.bookData || {};
    const formatted = generateDescription(item);
    item.formattedText = formatted;
    const candidates = Array.isArray(item.candidates) ? item.candidates : [];
    const hasCandidates = candidates.length > 1;
    const selectedCandidateIndex = candidates.findIndex(c =>
      c.title === book.title &&
      c.author === book.author &&
      (c.sourceUrl || '') === (book.sourceUrl || '')
    );

    bodyEl.style.display = 'block';
    bodyEl.innerHTML = `
      <div class="section-title">Dane książki</div>

      ${item.detectedIsbn ? `
        <div class="search-hint">🔢 Wykryto ISBN z OCR: <strong>${escHtml(item.detectedIsbn)}</strong></div>
      ` : ''}

      ${hasCandidates ? `
        <div class="candidate-box">
          <div class="field-label">Dopasowanie (wybierz właściwą książkę)</div>
          <div class="candidate-row">
            <select
              id="candidate-select-${item.id}"
              class="field-input"
              onchange="App.selectCandidate(${item.id}, this.value)"
            >
              ${candidates.map((c, idx) => `
                <option value="${idx}" ${idx === selectedCandidateIndex ? 'selected' : ''}>
                  ${escHtml(c.title || 'Bez tytułu')} — ${escHtml(c.author || 'Brak autora')} (${escHtml(c.source || 'API')})
                </option>
              `).join('')}
            </select>
            <button class="btn btn-ghost" type="button" onclick="App.selectCandidate(${item.id}, document.getElementById('candidate-select-${item.id}').value)">
              ✅ Zastosuj
            </button>
          </div>
        </div>
      ` : ''}

      <div class="card-fields">
        <div>
          <div class="field-label">Tytuł</div>
          <input
            id="field-title-${item.id}"
            class="field-input"
            type="text"
            value="${escHtml(item.editTitle)}"
            placeholder="Tytuł książki…"
            oninput="App.onFieldChange(${item.id},'editTitle',this.value)"
          />
        </div>
        <div>
          <div class="field-label">Autor</div>
          <input
            id="field-author-${item.id}"
            class="field-input"
            type="text"
            value="${escHtml(item.editAuthor)}"
            placeholder="Imię Nazwisko…"
            oninput="App.onFieldChange(${item.id},'editAuthor',this.value)"
          />
        </div>
        <div>
          <div class="field-label">Rok wydania</div>
          <input
            id="field-year-${item.id}"
            class="field-input"
            type="text"
            value="${escHtml(item.editYear)}"
            placeholder="np. 2021"
            oninput="App.onFieldChange(${item.id},'editYear',this.value)"
          />
        </div>
        <div>
          <div class="field-label">Liczba stron</div>
          <input
            id="field-pages-${item.id}"
            class="field-input"
            type="text"
            value="${escHtml(item.editPages)}"
            placeholder="np. 320"
            oninput="App.onFieldChange(${item.id},'editPages',this.value)"
          />
        </div>
        <div class="field-full">
          <div class="field-label">Stan egzemplarza</div>
          <select
            id="field-condition-${item.id}"
            class="field-input"
            onchange="App.onFieldChange(${item.id},'editCondition',this.value)"
          >
            <option value="nowa" ${item.editCondition==='nowa'?'selected':''}>Nowa</option>
            <option value="jak nowa" ${item.editCondition==='jak nowa'?'selected':''}>Jak nowa</option>
            <option value="używana, stan bardzo dobry" ${item.editCondition==='używana, stan bardzo dobry'?'selected':''}>Używana — bardzo dobry</option>
            <option value="używana, stan dobry" ${item.editCondition==='używana, stan dobry'?'selected':''}>Używana — dobry</option>
            <option value="używana, stan dostateczny" ${item.editCondition==='używana, stan dostateczny'?'selected':''}>Używana — dostateczny</option>
          </select>
        </div>
        <div class="field-full">
          <div class="field-label">Opis (edytowalny)</div>
          <textarea
            id="field-desc-${item.id}"
            class="field-textarea"
            rows="4"
            placeholder="Opis książki…"
            oninput="App.onFieldChange(${item.id},'editDesc',this.value)"
          >${escHtml(item.editDesc)}</textarea>
        </div>
      </div>

      ${book.sourceUrl ? `
        <div class="search-hint">
          📡 Źródło: <a href="${escHtml(book.sourceUrl)}" target="_blank" rel="noopener"
            style="color:var(--accent);text-decoration:none">${escHtml(book.source || 'API')}</a>
        </div>
      ` : `
        <div class="search-hint" style="color:var(--warning)">
          ⚠️ Nie znaleziono w bazie — wypełnij dane ręcznie
        </div>
      `}

      ${item.rawText ? `
        <details>
          <summary>Surowy tekst OCR</summary>
          <div class="ocr-raw">${escHtml(item.rawText.slice(0, 400))}</div>
        </details>
      ` : ''}

      <div class="section-title" style="margin-top:4px">Podgląd ogłoszenia OLX</div>

      <div class="preview-panel">
        <div class="preview-panel-header">
          <span class="preview-label">Gotowy tekst</span>
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px"
            onclick="App.copySingle(${item.id})">📋 Kopiuj</button>
        </div>
        <div id="preview-${item.id}" class="preview-text">${escHtml(formatted)}</div>
      </div>

      <div class="card-actions">
        <button class="btn btn-ghost" onclick="App.retryItem(${item.id})">🔄 Re-OCR</button>
        <button class="btn btn-ghost" onclick="App.searchOnly(${item.id})">🔍 Szukaj ponownie</button>
        <button class="btn btn-success" onclick="App.copySingle(${item.id})">📋 Kopiuj opis</button>
      </div>
    `;
  }

  /* ── Field change handler ──────────────────────────────── */
  function onFieldChange(id, field, value) {
    const item = findItem(id);
    if (!item) return;
    item[field] = value;

    // Re-generate and update preview in real time
    const formatted = generateDescription(item);
    item.formattedText = formatted;
    const previewEl = document.getElementById(`preview-${id}`);
    if (previewEl) previewEl.textContent = formatted;
  }

  /* ── Copy actions ──────────────────────────────────────── */
  async function copySingle(id) {
    const item = findItem(id);
    if (!item || !item.formattedText) return;
    await copyToClipboard(item.formattedText);
    showToast('📋 Skopiowano opis do schowka!', 'success');
  }

  async function copyAll() {
    const successful = state.books.filter(b => b.status === 'success' && b.formattedText);
    if (successful.length === 0) {
      showToast('ℹ️ Brak gotowych opisów do skopiowania', '');
      return;
    }
    const allText = successful.length === 1
      ? successful[0].formattedText
      : Formatter.generateBatch(
          successful.map(b => ({
            ...b.bookData,
            title:       b.editTitle  || b.bookData?.title  || '',
            author:      b.editAuthor || b.bookData?.author || '',
            description: b.editDesc   || b.bookData?.description || '',
            pages:       b.editPages  || b.bookData?.pages  || '',
            year:        b.editYear   || b.bookData?.year   || '',
            _condition:  b.editCondition || '',
          })),
          state.settings.prefix
        );

    await copyToClipboard(allText);
    showToast(`📋 Skopiowano ${successful.length} opis${successful.length === 1 ? '' : 'ów'}!`, 'success');
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  /* ── Item management ───────────────────────────────────── */
  function removeItem(id) {
    const item = findItem(id);
    if (item) URL.revokeObjectURL(item.imageUrl);
    state.books = state.books.filter(b => b.id !== id);
    const el = document.getElementById(`card-${id}`);
    if (el) {
      el.style.animation = 'none';
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 200);
    }
    if (state.books.length === 0) {
      document.getElementById('empty-state').style.display = 'flex';
    }
    renderStats();
  }

  async function retryItem(id) {
    const item = findItem(id);
    if (!item) return;
    item.status = 'idle';
    item.error = '';
    item.bookData = null;
    updateCardStatusUI(item);
    const bodyEl = document.getElementById(`card-body-${id}`);
    if (bodyEl) bodyEl.style.display = 'none';
    await processSingle(item);
  }

  /** Search only — uses current editTitle/editAuthor, skips OCR */
  async function searchOnly(id) {
    const item = findItem(id);
    if (!item) return;

    const searchTitle  = item.editTitle  || item.ocrTitle;
    const searchAuthor = item.editAuthor || item.ocrAuthor;

    if (!searchTitle && !searchAuthor) {
      showToast('✏️ Wpisz tytuł lub autora przed wyszukiwaniem', 'error');
      return;
    }

    try {
      updateItemStatus(item, 'searching', 60, 'Wyszukiwanie…');
      const bodyEl = document.getElementById(`card-body-${id}`);
      if (bodyEl) bodyEl.style.display = 'none';

      const lookup = await Books.searchWithCandidates(searchTitle, searchAuthor, item.rawText);
      const bookData = lookup.book;
      item.bookData = bookData;
      item.candidates = lookup.candidates || [];
      item.detectedIsbn = lookup.detectedIsbn || item.detectedIsbn || '';

      if (bookData) {
        if (!item.editDesc)  item.editDesc  = bookData.description || '';
        if (!item.editPages) item.editPages = bookData.pages || '';
        if (!item.editYear)  item.editYear  = bookData.year  || '';
        // Only overwrite title/author if user hasn't edited them yet
        if (item.editTitle  === item.ocrTitle)  item.editTitle  = bookData.title  || item.editTitle;
        if (item.editAuthor === item.ocrAuthor) item.editAuthor = bookData.author || item.editAuthor;
      }

      item.formattedText = generateDescription(item);
      updateItemStatus(item, 'success', 100, '');
      renderCardBody(item);
    } catch (err) {
      item.error = err.message;
      updateItemStatus(item, 'error', 0, '');
      renderCardBody(item);
    }
    renderStats();
  }

  async function selectCandidate(id, idxValue) {
    const item = findItem(id);
    if (!item || !Array.isArray(item.candidates) || item.candidates.length === 0) return;

    const idx = Number(idxValue);
    if (!Number.isInteger(idx) || idx < 0 || idx >= item.candidates.length) return;

    try {
      updateItemStatus(item, 'searching', 70, 'Pobieranie wybranego dopasowania…');
      const picked = item.candidates[idx];
      const hydrated = await Books.hydrateCandidate(
        picked,
        item.editTitle || item.ocrTitle,
        item.editAuthor || item.ocrAuthor
      );
      item.bookData = hydrated || picked;

      item.editTitle = item.bookData.title || item.editTitle;
      item.editAuthor = item.bookData.author || item.editAuthor;
      item.editYear = item.bookData.year || item.editYear;
      item.editPages = item.bookData.pages || item.editPages;
      item.editDesc = item.bookData.description || item.editDesc;

      item.formattedText = generateDescription(item);
      updateItemStatus(item, 'success', 100, '');
      renderCardBody(item);
      showToast('✅ Zastosowano wybrany wynik', 'success');
    } catch (err) {
      item.error = err.message || 'Błąd wyboru dopasowania';
      updateItemStatus(item, 'error', 0, '');
      renderCardBody(item);
    }
    renderStats();
  }

  function clearAll() {
    if (state.books.length === 0) return;
    if (!confirm('Usunąć wszystkie książki z listy?')) return;
    state.books.forEach(b => URL.revokeObjectURL(b.imageUrl));
    state.books = [];
    document.getElementById('cards-container').innerHTML = '';
    document.getElementById('empty-state').style.display = 'flex';
    renderStats();
  }

  /* ── Stats ─────────────────────────────────────────────── */
  function renderStats() {
    const total   = state.books.length;
    const done    = state.books.filter(b => b.status === 'success').length;
    const pending = state.books.filter(b => b.status === 'idle' || b.status === 'ocr' || b.status === 'searching').length;

    document.getElementById('stat-total').textContent   = total;
    document.getElementById('stat-done').textContent    = done;
    document.getElementById('stat-pending').textContent = pending;

    const copyBtn = document.getElementById('btn-copy-all');
    copyBtn.disabled = done === 0;
  }

  /* ── Helpers ───────────────────────────────────────────── */
  function findItem(id) { return state.books.find(b => b.id === id); }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Toast ─────────────────────────────────────────────── */
  function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast${type ? ' toast-' + type : ''}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  return {
    init,
    removeItem,
    retryItem,
    searchOnly,
    selectCandidate,
    copySingle,
    onFieldChange,
  };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', () => App.init());
