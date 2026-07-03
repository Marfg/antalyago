import { createDocument, touchUpdatedAt, slugify, DRAFT_UI_STATUSES, VALID_BOARD_SIZES, VALID_SECTIONS, VALID_PROBLEM_TYPES, VALID_DIFFICULTIES } from './model/studioDocument.js';
import { validateDocument, canSaveDraft } from './model/validation.js';
import { OUTPUT_CAPABILITIES } from './adapters/capabilities.js';
import { createBoardRenderer } from './boardRenderer.js';

// ── Durum ────────────────────────────────────────────────────────────
const state = {
  doc: null,
  savedDoc: null,
  idLocked: false,     // ilk kayıt sonrası true
  dirty: false,
  autosaveTimer: null,
  csrfToken: null,
  documents: [],
  activeTab: 'validation',
  validation: { valid: false, errors: [], warnings: [] },
  saveStatus: 'saved', // 'saved' | 'dirty' | 'saving' | 'error'
};

const renderer = createBoardRenderer();

// ── CSRF ─────────────────────────────────────────────────────────────
function getCsrfToken() {
  return document.querySelector('meta[name="studio-token"]')?.content ?? '';
}

// ── API istemcisi ─────────────────────────────────────────────────────
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (method !== 'GET') headers['X-Studio-Token'] = state.csrfToken;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  return { ok: res.ok, status: res.status, data };
}

// ── DOM referansları ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {
  docTitle:     $('toolbar-doc-title'),
  saveStatus:   $('toolbar-save-status'),
  btnNew:       $('btn-new'),
  btnSave:      $('btn-save'),
  btnSaveAs:    $('btn-save-as'),
  btnValidate:  $('btn-validate'),
  btnJsonPreview: $('btn-json-preview'),
  libraryList:  $('library-list'),
  librarySearch: $('library-search'),
  boardWrap:    $('board-wrap'),
  boardNoDoc:   $('board-no-doc'),
  inspectorBody: $('inspector-body'),
  inspectorNoDoc: $('inspector-no-doc'),
  bottomPanel:  $('bottom-panel'),
  jsonPreview:  $('json-preview'),
  validationList: $('validation-list'),
  tabValidation: $('tab-validation'),
  tabJson:      $('tab-json'),
  tabOutputs:   $('tab-outputs'),
  panelValidation: $('panel-validation'),
  panelJson:    $('panel-json'),
  panelOutputs: $('panel-outputs'),
  tabBadge:     $('tab-validation-badge'),
  liveRegion:   $('live-region'),
  // Inspector form
  fldId:        $('fld-id'),
  fldTitle:     $('fld-title'),
  fldSlug:      $('fld-slug'),
  fldSummary:   $('fld-summary'),
  fldStatus:    $('fld-status'),
  fldSize:      $('fld-size'),
  fldTurn:      $('fld-turn'),
  fldSection:   $('fld-section'),
  fldLesson:    $('fld-lesson'),
  fldType:      $('fld-type'),
  fldDifficulty: $('fld-difficulty'),
  fldAuthor:    $('fld-author'),
  fldIdError:   $('fld-id-error'),
};

// ── Durumu güncelle (arayüz yansıması) ───────────────────────────────
function setSaveStatus(status, msg) {
  state.saveStatus = status;
  const label = { saved: 'Kaydedildi', dirty: 'Kaydedilmemiş değişiklik', saving: 'Kaydediliyor…', error: msg ?? 'Yazma hatası' }[status] ?? '';
  el.saveStatus.textContent = label;
  el.saveStatus.className = 'studio-toolbar__save-status' + (status === 'dirty' ? ' is-dirty' : status === 'error' ? ' is-error' : '');
}

function announce(msg) {
  el.liveRegion.textContent = '';
  requestAnimationFrame(() => { el.liveRegion.textContent = msg; });
}

function updateDocTitle() {
  el.docTitle.textContent = state.doc ? (state.doc.title || '(başlıksız)') : '';
}

function renderBoard() {
  if (!state.doc) {
    el.boardNoDoc.style.display = 'flex';
    renderer.clear(el.boardWrap);
    return;
  }
  el.boardNoDoc.style.display = 'none';
  renderer.render(el.boardWrap, state.doc.board);
}

function renderValidation() {
  const { errors, warnings, valid } = state.validation;
  const items = [];
  if (errors.length === 0 && warnings.length === 0) {
    items.push(`<li class="studio-validation__item studio-validation__item--ok"><span class="studio-validation__icon">✓</span> Doğrulama geçti.</li>`);
  }
  for (const e of errors) {
    items.push(`<li class="studio-validation__item studio-validation__item--error"><span class="studio-validation__icon">✕</span>${e}</li>`);
  }
  for (const w of warnings) {
    items.push(`<li class="studio-validation__item studio-validation__item--warning"><span class="studio-validation__icon">⚠</span>${w}</li>`);
  }
  el.validationList.innerHTML = `<ul class="studio-validation__list">${items.join('')}</ul>`;
  const badgeCount = errors.length;
  if (badgeCount > 0) {
    el.tabBadge.textContent = String(badgeCount);
    el.tabBadge.style.display = 'inline-block';
  } else {
    el.tabBadge.style.display = 'none';
  }
}

function renderJsonPreview() {
  if (!state.doc) { el.jsonPreview.textContent = ''; return; }
  try { el.jsonPreview.textContent = JSON.stringify(state.doc, null, 2); }
  catch { el.jsonPreview.textContent = '(JSON üretilemedi)'; }
}

function renderOutputs() {
  const html = Object.entries(OUTPUT_CAPABILITIES).map(([key, cap]) =>
    `<div class="studio-output-item">
      <span class="studio-output-item__phase">Faz ${cap.phase}</span>
      <span class="studio-output-item__desc"><strong>${key}:</strong> ${cap.description}</span>
    </div>`
  ).join('');
  $('outputs-list').innerHTML = html;
}

function renderLibrary() {
  const q = el.librarySearch.value.toLowerCase();
  const docs = state.documents.filter(d =>
    !q || (d.title ?? '').toLowerCase().includes(q) || (d.id ?? '').includes(q)
  );
  if (docs.length === 0) {
    el.libraryList.innerHTML = `<p class="studio-library__empty">Henüz stüdyo belgesi yok.<br>Yeni bir formasyon oluşturarak başla.</p>`;
    return;
  }
  el.libraryList.innerHTML = docs.map(d => {
    const active = state.doc?.id === d.id ? ' is-active' : '';
    const date = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('tr-TR') : '';
    return `<div class="studio-doc-card${active}" role="button" tabindex="0" data-id="${d.id}" aria-label="${d.title || d.id} belgesini aç">
      <div class="studio-doc-card__title">${d.title || '(başlıksız)'}</div>
      <div class="studio-doc-card__meta">
        <span class="studio-doc-card__id">${d.id}</span>
        <span class="studio-badge studio-badge--${d.boardSize}">${d.boardSize}×${d.boardSize}</span>
        <span class="studio-badge studio-badge--${d.status}">${d.status}</span>
        ${date ? `<span style="font-size:10px;color:var(--text-muted)">${date}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  el.libraryList.querySelectorAll('[data-id]').forEach(card => {
    const open = () => confirmAndOpenDoc(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function renderInspector() {
  if (!state.doc) {
    el.inspectorBody.style.display = 'none';
    el.inspectorNoDoc.style.display = 'block';
    return;
  }
  el.inspectorBody.style.display = 'flex';
  el.inspectorNoDoc.style.display = 'none';
  const d = state.doc;
  el.fldId.value = d.id ?? '';
  el.fldId.disabled = state.idLocked;
  el.fldTitle.value = d.title ?? '';
  el.fldSlug.value = d.slug ?? '';
  el.fldSummary.value = d.summary ?? '';
  el.fldStatus.value = d.status ?? 'draft';
  el.fldSize.value = String(d.board?.size ?? 9);
  el.fldTurn.value = d.board?.turn ?? 'black';
  el.fldSection.value = d.curriculum?.section ?? '';
  el.fldLesson.value = d.curriculum?.lesson ?? '';
  el.fldType.value = d.classification?.problemType ?? 'tsumego';
  el.fldDifficulty.value = d.classification?.difficulty ?? 'beginner';
  el.fldAuthor.value = d.audit?.author ?? '';
}

function refreshAll() {
  updateDocTitle();
  renderBoard();
  state.validation = state.doc ? validateDocument(state.doc) : { valid: false, errors: [], warnings: [] };
  renderValidation();
  renderJsonPreview();
  renderInspector();
}

// ── Belge yükleme ─────────────────────────────────────────────────────
async function loadDocumentList() {
  const res = await api('GET', '/api/documents');
  if (res.ok) {
    state.documents = res.data.documents ?? [];
    renderLibrary();
  }
}

async function openDoc(id) {
  const res = await api('GET', `/api/documents/${encodeURIComponent(id)}`);
  if (!res.ok) { alert(`Belge açılamadı: ${res.data.error ?? 'bilinmeyen hata'}`); return; }
  state.doc = res.data;
  state.savedDoc = JSON.stringify(res.data);
  state.idLocked = true;
  state.dirty = false;
  setSaveStatus('saved');
  refreshAll();
  renderLibrary();
  announce(`${state.doc.title || id} açıldı`);
  setActiveTab('validation');
}

function confirmAndOpenDoc(id) {
  if (state.dirty) {
    if (!confirm('Kaydedilmemiş değişiklikler var. Yine de başka belge açılsın mı?')) return;
  }
  openDoc(id);
}

// ── Belge değişikliği ─────────────────────────────────────────────────
function updateField(key, value) {
  if (!state.doc) return;
  const path = key.split('.');
  let target = state.doc;
  for (let i = 0; i < path.length - 1; i++) {
    if (!target[path[i]] || typeof target[path[i]] !== 'object') target[path[i]] = {};
    target = target[path[i]];
  }
  target[path[path.length - 1]] = value;
  markDirty();
}

function markDirty() {
  state.dirty = true;
  setSaveStatus('dirty');
  state.doc = touchUpdatedAt(state.doc);
  state.validation = validateDocument(state.doc);
  renderValidation();
  renderJsonPreview();
  updateDocTitle();
  scheduleAutosave();
}

// ── Autosave ──────────────────────────────────────────────────────────
function scheduleAutosave() {
  if (!state.idLocked) return; // ilk kayıt öncesi autosave yok
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(autosave, 3000);
}

async function autosave() {
  if (!state.doc || !state.idLocked || !state.dirty) return;
  if (!canSaveDraft(state.validation)) return; // hatalı belgeyi autosave etme
  try {
    setSaveStatus('saving');
    const res = await api('PUT', `/api/documents/${encodeURIComponent(state.doc.id)}`, state.doc);
    if (res.ok) {
      state.savedDoc = JSON.stringify(state.doc);
      state.dirty = false;
      setSaveStatus('saved');
      await loadDocumentList();
    } else {
      setSaveStatus('error', res.data.error);
    }
  } catch (err) {
    setSaveStatus('error', err.message);
  }
}

// ── Kayıt ─────────────────────────────────────────────────────────────
async function saveDocument() {
  if (!state.doc) return;
  const result = validateDocument(state.doc);
  if (!canSaveDraft(result)) {
    state.validation = result;
    renderValidation();
    setActiveTab('validation');
    announce(`${result.errors.length} doğrulama hatası`);
    return;
  }
  try {
    setSaveStatus('saving');
    clearTimeout(state.autosaveTimer);
    let res;
    if (!state.idLocked) {
      res = await api('POST', '/api/documents', state.doc);
      if (res.status === 409) {
        alert(`"${state.doc.id}" kimliğiyle belge zaten var. Farklı bir kimlik girin.`);
        setSaveStatus('error', '409 Çakışma');
        return;
      }
      if (res.ok) state.idLocked = true;
    } else {
      res = await api('PUT', `/api/documents/${encodeURIComponent(state.doc.id)}`, state.doc);
    }
    if (res.ok) {
      state.savedDoc = JSON.stringify(state.doc);
      state.dirty = false;
      setSaveStatus('saved');
      await loadDocumentList();
      announce('Belge kaydedildi');
    } else {
      setSaveStatus('error', res.data.error);
      announce(`Kayıt hatası: ${res.data.error}`);
    }
  } catch (err) {
    setSaveStatus('error', err.message);
  }
}

// ── Yeni belge ────────────────────────────────────────────────────────
function showNewDocModal() {
  if (state.dirty) {
    if (!confirm('Kaydedilmemiş değişiklikler var. Yeni belge oluşturulsun mu?')) return;
  }
  const existing = document.querySelector('.studio-modal-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'studio-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'modal-title');

  backdrop.innerHTML = `
    <div class="studio-modal">
      <h2 class="studio-modal__title" id="modal-title">Yeni Belge</h2>
      <div class="studio-field">
        <label class="studio-field__label" for="modal-id">Kimlik (ID) <span class="required">*</span></label>
        <input id="modal-id" class="studio-input" type="text" placeholder="b2-merdiven-0042" autocomplete="off" aria-required="true" aria-describedby="modal-id-hint modal-id-error">
        <span id="modal-id-hint" class="studio-field__hint">Küçük harf, rakam ve tire. Örn: b1-capture-0001</span>
        <span id="modal-id-error" class="studio-field__error" role="alert"></span>
      </div>
      <div class="studio-field">
        <label class="studio-field__label" for="modal-title-input">Başlık <span class="required">*</span></label>
        <input id="modal-title-input" class="studio-input" type="text" placeholder="Merdiven yönünü belirleme" autocomplete="off" aria-required="true">
      </div>
      <div class="studio-field">
        <label class="studio-field__label" for="modal-size">Tahta Boyutu</label>
        <select id="modal-size" class="studio-select">
          <option value="9">9×9</option>
          <option value="13">13×13</option>
          <option value="19">19×19</option>
        </select>
      </div>
      <div class="studio-modal__actions">
        <button id="modal-cancel" class="studio-btn">İptal</button>
        <button id="modal-create" class="studio-btn studio-btn--primary">Oluştur</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const idInput = backdrop.querySelector('#modal-id');
  const titleInput = backdrop.querySelector('#modal-title-input');
  const sizeInput = backdrop.querySelector('#modal-size');
  const idError = backdrop.querySelector('#modal-id-error');
  const idField = idInput.closest('.studio-field');
  const cancelBtn = backdrop.querySelector('#modal-cancel');
  const createBtn = backdrop.querySelector('#modal-create');

  // ID slug önerisi başlıktan
  titleInput.addEventListener('input', () => {
    if (!idInput.value) idInput.value = slugify(titleInput.value).slice(0, 48);
  });

  function closeModal() {
    backdrop.remove();
    el.btnNew.focus();
  }

  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const focusable = [...backdrop.querySelectorAll('button, input, select')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  const SAFE_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  createBtn.addEventListener('click', async () => {
    const id = idInput.value.trim();
    const title = titleInput.value.trim();
    const size = parseInt(sizeInput.value, 10);
    let hasError = false;

    if (!id || !SAFE_ID.test(id)) {
      idError.textContent = 'Geçersiz kimlik formatı.';
      idField.classList.add('has-error');
      idInput.setAttribute('aria-invalid', 'true');
      hasError = true;
    } else {
      idField.classList.remove('has-error');
      idInput.removeAttribute('aria-invalid');
      idError.textContent = '';
    }
    if (!title) { titleInput.focus(); return; }
    if (hasError) { idInput.focus(); return; }

    const doc = createDocument({ id, title, slug: slugify(title), board: { size, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } });
    state.doc = doc;
    state.idLocked = false;
    state.dirty = true;
    state.savedDoc = null;
    setSaveStatus('dirty');
    closeModal();
    refreshAll();
    renderLibrary();
    announce(`Yeni belge oluşturuldu: ${title}`);
    setActiveTab('validation');
  });

  requestAnimationFrame(() => idInput.focus());
}

// ── Sekmeler ──────────────────────────────────────────────────────────
function setActiveTab(tab) {
  state.activeTab = tab;
  ['validation', 'json', 'outputs'].forEach(t => {
    const tabEl = $(`tab-${t}`);
    const panelEl = $(`panel-${t}`);
    if (tabEl) tabEl.classList.toggle('is-active', t === tab);
    if (panelEl) panelEl.classList.toggle('is-active', t === tab);
  });
  if (tab === 'json') renderJsonPreview();
}

// ── Inspector form olay dinleyicileri ─────────────────────────────────
function bindInspector() {
  const bind = (el, key, transform) => {
    if (!el) return;
    el.addEventListener('change', () => {
      const val = transform ? transform(el.value) : el.value;
      updateField(key, val);
    });
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.addEventListener('input', () => {
        const val = transform ? transform(el.value) : el.value;
        updateField(key, val);
        if (key === 'title' && !state.idLocked && !el_fldId_touched) {
          el.fldSlug && (el.fldSlug.value = slugify(el.fldTitle?.value ?? ''));
          updateField('slug', slugify(el.fldTitle?.value ?? ''));
        }
      });
    }
  };

  let el_fldId_touched = false;
  if (el.fldId) {
    el.fldId.addEventListener('input', () => {
      el_fldId_touched = true;
      updateField('id', el.fldId.value.trim());
    });
  }

  bind(el.fldTitle, 'title');
  bind(el.fldSlug, 'slug');
  bind(el.fldSummary, 'summary');
  bind(el.fldStatus, 'status');
  bind(el.fldSize, 'board.size', v => parseInt(v, 10));
  bind(el.fldTurn, 'board.turn');
  bind(el.fldSection, 'curriculum.section');
  bind(el.fldLesson, 'curriculum.lesson');
  bind(el.fldType, 'classification.problemType');
  bind(el.fldDifficulty, 'classification.difficulty');
  bind(el.fldAuthor, 'audit.author');

  // Boyut değişiminde tahtayı yeniden çiz
  if (el.fldSize) el.fldSize.addEventListener('change', () => renderBoard());
}

// ── Klavye kısayolları ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.key === 'n') { e.preventDefault(); showNewDocModal(); }
  if (e.key === 's' && !e.shiftKey) { e.preventDefault(); saveDocument(); }
  if (e.key === 's' && e.shiftKey) { e.preventDefault(); /* Farklı Kaydet — Faz B */ }
});

// Kaydedilmemiş değişiklik uyarısı
window.addEventListener('beforeunload', e => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ── Başlatma ──────────────────────────────────────────────────────────
async function init() {
  state.csrfToken = getCsrfToken();
  if (!state.csrfToken) {
    console.error('CSRF token bulunamadı — stüdyo doğrudan dosya:// üzerinden mi açılıyor?');
  }

  el.btnNew.addEventListener('click', showNewDocModal);
  el.btnSave.addEventListener('click', saveDocument);
  el.btnValidate.addEventListener('click', () => {
    if (state.doc) { state.validation = validateDocument(state.doc); renderValidation(); }
    setActiveTab('validation');
  });
  el.btnJsonPreview.addEventListener('click', () => { renderJsonPreview(); setActiveTab('json'); });

  el.librarySearch.addEventListener('input', renderLibrary);

  el.tabValidation.addEventListener('click', () => setActiveTab('validation'));
  el.tabJson.addEventListener('click', () => setActiveTab('json'));
  el.tabOutputs.addEventListener('click', () => setActiveTab('outputs'));

  const copyBtn = $('btn-copy-json');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.jsonPreview.textContent); announce('JSON panoya kopyalandı'); }
    catch { announce('Kopyalama başarısız'); }
  });

  bindInspector();
  renderOutputs();
  setActiveTab('validation');
  renderLibrary();
  await loadDocumentList();
}

document.addEventListener('DOMContentLoaded', init);
