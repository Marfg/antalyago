import { createBoardRenderer } from '../../studio/boardRenderer.js';
import { createDocument } from '../../studio/model/studioDocument.js';
import { validateDocument } from '../../studio/model/validation.js';
import {
  addChildMove,
  createBoardStateFromSnapshot,
  deleteMoveNode,
  ensureMoveTreeDocument,
  findMoveNode,
  getMovePath,
  rebuildBoardState,
  serializeMainlineMoves,
  setMoveNodeAnnotations,
  setMoveNodeComment,
  setPreferredChild,
} from '../../studio/model/moveTree.js';
import { BoardState } from '../../core/boardState.js';
import { createStudioBoardAdapter } from '../ipc/studioBoardAdapter.js';
import { initTheme } from '../../core/theme.js';

const VALID_MODES = new Set(['review', 'move', 'setup', 'marker']);

const boardRenderer = createBoardRenderer('svg');
const boardAdapter = createStudioBoardAdapter(BoardState);
const api = globalThis.studioAPI ?? createOfflineApi();

const elements = {
  workspaceTitle: document.getElementById('studio-workspace-title'),
  workspacePath: document.getElementById('studio-workspace-path'),
  workspaceBanner: document.querySelector('[data-workspace-banner]'),
  libraryList: document.querySelector('[data-library-list]'),
  libraryEmpty: document.querySelector('[data-library-empty]'),
  candidateList: document.querySelector('[data-candidate-list]'),
  candidateEmpty: document.querySelector('[data-candidate-empty]'),
  candidateSummaryNote: document.querySelector('[data-candidate-summary-note]'),
  candidatePreviewPanel: document.querySelector('[data-candidate-preview-panel]'),
  candidateStatus: document.querySelector('[data-candidate-status]'),
  candidateReadonlyMessage: document.querySelector('[data-candidate-readonly-message]'),
  candidateTitle: document.querySelector('[data-candidate-title]'),
  candidateId: document.querySelector('[data-candidate-id]'),
  candidateStatusLabel: document.querySelector('[data-candidate-status-label]'),
  candidateCurriculum: document.querySelector('[data-candidate-curriculum]'),
  candidateSource: document.querySelector('[data-candidate-source]'),
  candidateRights: document.querySelector('[data-candidate-rights]'),
  candidateWork: document.querySelector('[data-candidate-work]'),
  candidateReadonlyBanner: document.querySelector('[data-candidate-readonly-banner]'),
  board: document.getElementById('studio-board'),
  boardCaption: document.getElementById('studio-board-caption'),
  docTitle: document.querySelector('[data-doc-title]'),
  docStatus: document.querySelector('[data-doc-status]'),
  docSection: document.querySelector('[data-doc-section]'),
  docSummary: document.querySelector('[data-doc-summary]'),
  contentMode: document.querySelector('[data-content-mode]'),
  technicalDetails: document.querySelector('[data-technical-details]'),
  technicalJson: document.querySelector('[data-technical-json]'),
  timelineSummary: document.querySelector('[data-timeline-summary]'),
  producerToggle: document.querySelector('[data-producer-toggle]'),
  workspacePicker: document.querySelector('[data-workspace-picker]'),
  actionNew: document.querySelector('[data-action-new]'),
  actionOpen: document.querySelector('[data-action-open]'),
  actionSave: document.querySelector('[data-action-save]'),
  actionSaveAs: document.querySelector('[data-action-save-as]'),
  treeSummary: document.querySelector('[data-move-tree-summary]'),
  treePath: document.querySelector('[data-move-tree-path]'),
  treeViewport: document.querySelector('[data-move-tree-viewport]'),
  treeCanvas: document.querySelector('[data-move-tree-canvas]'),
  treeStatus: document.querySelector('[data-move-tree-status]'),
  treeZoomOut: document.querySelector('[data-move-tree-zoom-out]'),
  treeZoomIn: document.querySelector('[data-move-tree-zoom-in]'),
  treeZoomReset: document.querySelector('[data-move-tree-zoom-reset]'),
  treePrev: document.querySelector('[data-move-tree-prev]'),
  treeNext: document.querySelector('[data-move-tree-next]'),
  treePromote: document.querySelector('[data-move-tree-promote]'),
  treeDelete: document.querySelector('[data-move-tree-delete]'),
  treeAdd: document.querySelector('[data-move-tree-add]'),
  treeColor: document.querySelector('[data-move-tree-color]'),
  treeX: document.querySelector('[data-move-tree-x]'),
  treeY: document.querySelector('[data-move-tree-y]'),
  treeComment: document.querySelector('[data-move-tree-comment]'),
  treeAnnotations: document.querySelector('[data-move-tree-annotations]'),
  modeBtns: Array.from(document.querySelectorAll('[data-mode-toolbar] [data-mode]')),
};

const state = {
  settings: null,
  documents: [],
  candidates: [],
  candidateMap: new Map(),
  activeCandidateId: null,
  activeCandidate: null,
  candidateMode: null,
  activeDocumentPath: null,
  activeDocument: null,
  contentProducerMode: true,
  workspaceFolder: null,
  needsWorkspaceSelection: false,
  selectedNodeId: 'root',
  treeZoom: 1,
  activeMode: 'review',
};

initTheme({ root: document });
bootstrap().catch(error => {
  console.error(error);
  showOfflineError(error);
});

async function bootstrap() {
  const boot = typeof api.boot === 'function' ? await api.boot() : createOfflineBootState();
  applyBootState(boot);
  wireActions();
  await loadCandidateLibrary();
  renderWorkspace();
  renderActiveDocument();
}

function applyBootState(boot) {
  state.settings = boot?.settings ?? null;
  state.documents = Array.isArray(boot?.documents) ? boot.documents : createOfflineDocuments();
  state.activeDocument = ensureMoveTreeDocument(boot?.activeDocument ?? state.documents[0] ?? createEmptyDocument());
  state.activeDocumentPath = boot?.activeDocumentPath ?? null;
  state.contentProducerMode = boot?.settings?.contentProducerMode ?? true;
  state.needsWorkspaceSelection = boot?.needsWorkspaceSelection ?? false;
  state.workspaceFolder = boot?.settings?.workspaceFolder ?? null;
  state.selectedNodeId = state.activeDocument.activeNodeId ?? 'root';
  state.activeCandidateId = null;
  state.activeCandidate = null;
  state.candidateMode = null;
}

async function loadCandidateLibrary() {
  if (typeof api.listCandidates !== 'function') {
    state.candidates = [];
    state.candidateMap = new Map();
    return;
  }

  const result = await api.listCandidates();
  if (!result || result.ok === false) {
    state.candidates = [];
    state.candidateMap = new Map();
    renderCandidatePanel(result?.error ?? 'Problem adayları yüklenemedi.');
    return;
  }

  const items = Array.isArray(result.items) ? result.items : [];
  state.candidates = items;
  state.candidateMap = new Map(items.filter(item => item?.candidateId).map(item => [item.candidateId, item]));
}

function isCandidatePreviewMode() {
  return Boolean(state.activeCandidateId && state.candidateMode === 'preview');
}

function isCandidateWorkingMode() {
  return Boolean(state.activeCandidateId && state.candidateMode === 'working');
}

function setCandidateSession(candidate, document, { readOnly = true } = {}) {
  state.activeCandidateId = candidate?.candidateId ?? null;
  state.activeCandidate = candidate ?? null;
  state.candidateMode = readOnly ? 'preview' : 'working';
  if (readOnly) state.activeMode = 'review';
  state.activeDocument = ensureMoveTreeDocument(document ?? createEmptyDocument());
  state.activeDocumentPath = null;
  state.selectedNodeId = state.activeDocument.activeNodeId ?? 'root';
  syncDocumentFromSelection();
  renderWorkspace();
  renderActiveDocument();
}

function clearCandidateSession() {
  state.activeCandidateId = null;
  state.activeCandidate = null;
  state.candidateMode = null;
}

function renderCandidatePanel(message = '') {
  const items = state.candidates ?? [];
  elements.candidateEmpty.hidden = items.length > 0;
  elements.candidateSummaryNote.textContent = message || `Adaylar salt-okunur önizleme olarak listelenir. ${items.length} aday yüklendi.`;
  elements.candidateList.replaceChildren(...items.map(renderCandidateItem));
  renderCandidateDetails();
}

function renderCandidateItem(item) {
  const li = document.createElement('li');
  li.className = 'candidate-item';

  const card = document.createElement(item.canOpen ? 'button' : 'div');
  card.className = `candidate-card${item.candidateId && item.candidateId === state.activeCandidateId ? ' is-active' : ''}${item.valid === false ? ' is-broken' : ''}`;
  if (item.canOpen) {
    card.type = 'button';
    card.dataset.candidateId = item.candidateId;
    card.addEventListener('click', async () => openCandidatePreview(item.candidateId));
  } else {
    card.setAttribute('aria-disabled', 'true');
  }

  const badgeClass = item.valid === false ? 'is-warning' : item.status === 'promoted' ? 'is-success' : item.status === 'rejected' ? 'is-muted' : 'is-warning';
  const title = item.title || item.candidateId || 'Bozuk aday dosyası';
  const statusLabel = item.statusLabel || 'Hatalı dosya';
  const reviewText = item.reviewRequired ? 'İnceleme gerekli' : 'İnceleme gerekmez';
  const rightsText = item.canPublish ? 'Yayınlanabilir' : item.needsRightsReview ? 'Yayın hakkı inceleme bekliyor' : 'Yayın kapalı';

  card.innerHTML = `
    <div class="candidate-card__top">
      <strong class="candidate-card__title">${escapeHtml(title)}</strong>
      <span class="candidate-card__badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
    </div>
    <p class="candidate-card__id">Candidate ID: ${escapeHtml(item.candidateId ?? '—')}</p>
    <p class="candidate-card__meta">${escapeHtml(item.curriculumSection || '—')} · ${escapeHtml(item.curriculumLesson || '—')}</p>
    <p class="candidate-card__source">Kaynak: ${escapeHtml(item.sourceSummary || '—')}</p>
    <p class="candidate-card__rights">${escapeHtml(reviewText)} · ${escapeHtml(rightsText)}</p>
    ${item.parseError ? `<p class="candidate-card__meta">Hata: ${escapeHtml(item.parseError)}</p>` : ''}
  `;

  li.appendChild(card);
  return li;
}

function renderCandidateDetails() {
  const candidate = state.activeCandidate;
  const panelVisible = Boolean(candidate);
  elements.candidatePreviewPanel.hidden = !panelVisible;
  if (!panelVisible) {
    elements.candidateStatus.textContent = 'Henüz aday seçilmedi.';
    elements.candidateReadonlyMessage.hidden = true;
    elements.candidateTitle.textContent = '—';
    elements.candidateId.textContent = '—';
    elements.candidateStatusLabel.textContent = '—';
    elements.candidateCurriculum.textContent = '—';
    elements.candidateSource.textContent = '—';
    elements.candidateRights.textContent = '—';
    elements.candidateWork.textContent = 'Studio belgesi olarak çalış';
    elements.candidateWork.disabled = true;
    elements.candidateReadonlyBanner.hidden = true;
    return;
  }

  const modeText = isCandidatePreviewMode() ? 'Salt-okunur önizleme' : 'Çalışma belgesi';
  const readOnlyText = isCandidatePreviewMode()
    ? candidate.readOnlyNotice || 'Bu görünüm salt-okunur bir aday önizlemesidir.'
    : 'Aday ayrı bir çalışma belgesi olarak açıldı.';

  elements.candidateStatus.textContent = `${modeText} · ${candidate.boardSize}×${candidate.boardSize}`;
  elements.candidateReadonlyMessage.hidden = false;
  elements.candidateReadonlyMessage.textContent = readOnlyText;
  elements.candidateTitle.textContent = candidate.title || '—';
  elements.candidateId.textContent = candidate.candidateId || '—';
  elements.candidateStatusLabel.textContent = candidate.statusLabel || '—';
  elements.candidateCurriculum.textContent = `${candidate.curriculumSection || '—'} · ${candidate.curriculumLesson || '—'} · ${candidate.curriculumSkill || '—'}`;
  elements.candidateSource.textContent = candidate.sourceSummary || '—';
  elements.candidateRights.textContent = `${candidate.reviewRequired ? 'İnceleme gerekli' : 'İnceleme gerekmez'} · ${candidate.rightsSummary || '—'}`;
  elements.candidateWork.textContent = isCandidatePreviewMode() ? 'Studio belgesi olarak çalış' : 'Çalışma belgesi açık';
  elements.candidateWork.disabled = isCandidateWorkingMode();
  elements.candidateReadonlyBanner.hidden = !isCandidatePreviewMode();
  elements.candidateReadonlyBanner.textContent = isCandidatePreviewMode()
    ? 'Bu görünüm salt-okunur bir aday önizlemesidir.'
    : 'Aday ayrı bir çalışma belgesi olarak açık.';
}

function syncCandidateEditability() {
  const readOnly = isCandidatePreviewMode();
  for (const element of [
    elements.treeColor,
    elements.treeX,
    elements.treeY,
    elements.treeComment,
    elements.treeAnnotations,
    elements.treeAdd,
    elements.treeDelete,
    elements.treePromote,
  ]) {
    if (element) element.disabled = readOnly;
  }
  if (elements.actionSave) {
    elements.actionSave.title = state.activeDocumentPath ? 'Belgeyi kaydet' : 'Bu belge ilk kez Farklı Kaydet ile kaydedilir.';
  }
  if (elements.treeStatus && readOnly) {
    elements.treeStatus.textContent = 'Aday önizlemesi salt-okunur; düzenleme için Studio belgesi olarak çalış seçin.';
  }
}

async function openCandidatePreview(candidateId) {
  if (typeof api.openCandidatePreview !== 'function') return;
  const result = await api.openCandidatePreview(candidateId);
  if (!result || result.ok === false || !result.document) {
    renderTreeStatus(result?.error ?? 'Aday önizlemesi açılamadı.');
    return;
  }
  setCandidateSession(result.summary ?? result.candidate, result.document, { readOnly: true });
}

async function openCandidateWorkingDocument(candidateId) {
  if (typeof api.openCandidateDocument !== 'function') return;
  const result = await api.openCandidateDocument(candidateId);
  if (!result || result.ok === false || !result.document) {
    renderTreeStatus(result?.error ?? 'Aday çalışma belgesi açılamadı.');
    return;
  }
  setCandidateSession(result.summary ?? result.candidate, result.document, { readOnly: false });
}

function renderCandidateState() {
  renderCandidateDetails();
  syncCandidateEditability();
  renderModeSelector();
}

function setActiveMode(mode) {
  state.activeMode = VALID_MODES.has(mode) ? mode : 'review';
  renderModeSelector();
}

function renderModeSelector() {
  const readOnly = isCandidatePreviewMode();
  document.body.setAttribute('data-studio-mode', state.activeMode);
  for (const btn of elements.modeBtns) {
    const m = btn.dataset.mode;
    btn.setAttribute('aria-pressed', String(m === state.activeMode));
    btn.disabled = readOnly && m !== 'review';
  }
}

function wireActions() {
  elements.producerToggle.addEventListener('click', async () => {
    state.contentProducerMode = !state.contentProducerMode;
    elements.contentMode.value = state.contentProducerMode ? 'producer' : 'editor';
    if (typeof api.setContentProducerMode === 'function') {
      await api.setContentProducerMode(state.contentProducerMode);
    }
    renderWorkspace();
  });

  elements.contentMode.addEventListener('change', async event => {
    state.contentProducerMode = event.target.value === 'producer';
    if (typeof api.setContentProducerMode === 'function') {
      await api.setContentProducerMode(state.contentProducerMode);
    }
    renderWorkspace();
  });

  elements.libraryList.addEventListener('click', event => {
    const li = event.target.closest('[data-doc-index]');
    if (!li) return;
    const idx = Number(li.dataset.docIndex);
    const doc = state.documents[idx];
    if (doc) {
      clearCandidateSession();
      setActiveDocument(doc);
    }
  });
  elements.libraryList.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const li = event.target.closest('[data-doc-index]');
    if (!li) return;
    event.preventDefault();
    li.click();
  });

  elements.workspacePicker.addEventListener('click', async () => {
    if (typeof api.chooseWorkspaceFolder !== 'function') {
      return;
    }
    const result = await api.chooseWorkspaceFolder();
    if (result?.workspaceFolder) {
      state.workspaceFolder = result.workspaceFolder;
      state.settings = { ...(state.settings ?? {}), workspaceFolder: result.workspaceFolder };
      renderWorkspace();
    }
  });

  elements.candidateWork.addEventListener('click', async () => {
    if (!state.activeCandidateId || typeof api.openCandidateDocument !== 'function') {
      return;
    }
    await openCandidateWorkingDocument(state.activeCandidateId);
  });

  elements.actionNew.addEventListener('click', async () => {
    if (typeof api.newDocument !== 'function') {
      return;
    }
    clearCandidateSession();
    const next = await api.newDocument();
    if (next?.document) {
      setActiveDocument(next.document, { filePath: next.filePath ?? null });
      renderTreeStatus('Yeni belge oluşturuldu.');
    }
  });

  elements.actionOpen.addEventListener('click', async () => {
    if (typeof api.openDocument !== 'function') {
      return;
    }
    clearCandidateSession();
    const next = await api.openDocument();
    if (next?.canceled) {
      renderTreeStatus('Açma iptal edildi.');
      return;
    }
    if (next?.document) {
      setActiveDocument(next.document, { filePath: next.filePath ?? null });
      renderTreeStatus(`Açıldı: ${next.document.title || 'belge'}`);
    }
  });

  elements.actionSave.addEventListener('click', async () => {
    syncDocumentFromSelection();
    if (!state.activeDocumentPath && typeof api.saveDocumentAs === 'function') {
      const result = await api.saveDocumentAs(state.activeDocument);
      if (result?.canceled) { renderTreeStatus('Kaydetme iptal edildi.'); return; }
      if (result?.document) {
        setActiveDocument(result.document, { keepSelection: true, filePath: result.filePath ?? null, preserveCandidateSession: isCandidateWorkingMode() });
        renderTreeStatus('Farklı kaydedildi.');
      }
      return;
    }
    if (typeof api.saveDocument !== 'function') {
      return;
    }
    const result = await api.saveDocument(state.activeDocument);
    if (result?.canceled) { renderTreeStatus('Kaydetme iptal edildi.'); return; }
    if (result?.document) {
      setActiveDocument(result.document, { keepSelection: true, filePath: result.filePath ?? null, preserveCandidateSession: isCandidateWorkingMode() });
      renderTreeStatus('Kaydedildi.');
    }
  });

  elements.actionSaveAs.addEventListener('click', async () => {
    if (typeof api.saveDocumentAs !== 'function') {
      return;
    }
    syncDocumentFromSelection();
    const result = await api.saveDocumentAs(state.activeDocument);
    if (result?.canceled) { renderTreeStatus('Kaydetme iptal edildi.'); return; }
    if (result?.document) {
      setActiveDocument(result.document, { keepSelection: true, filePath: result.filePath ?? null, preserveCandidateSession: isCandidateWorkingMode() });
      renderTreeStatus('Farklı kaydedildi.');
    }
  });

  elements.treeViewport.addEventListener('click', event => {
    const button = event.target.closest('[data-node-id]');
    if (!button) return;
    setActiveNode(button.dataset.nodeId, { focus: false });
  });

  elements.treePath.addEventListener('click', event => {
    const chip = event.target.closest('[data-node-id]');
    if (!chip) return;
    setActiveNode(chip.dataset.nodeId, { focus: false });
  });

  elements.treeViewport.addEventListener('keydown', event => {
    if (!state.activeDocument?.moveTree?.root) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      goToParentNode();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      goToPreferredChild();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveNode('root', { focus: true });
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveNode(findDeepestPreferredNode(state.activeDocument.moveTree.root)?.id ?? state.selectedNodeId, { focus: true });
    } else if (event.key === 'Delete') {
      event.preventDefault();
      requestDeleteSelectedVariant();
    }
  });

  elements.treeZoomOut.addEventListener('click', () => setTreeZoom(state.treeZoom - 0.1));
  elements.treeZoomIn.addEventListener('click', () => setTreeZoom(state.treeZoom + 0.1));
  elements.treeZoomReset.addEventListener('click', () => setTreeZoom(1));
  elements.treePrev.addEventListener('click', () => goToParentNode());
  elements.treeNext.addEventListener('click', () => goToPreferredChild());
  elements.treePromote.addEventListener('click', () => promoteSelectedNode());
  elements.treeDelete.addEventListener('click', () => requestDeleteSelectedVariant());
  elements.treeAdd.addEventListener('click', () => addTreeMoveFromForm());

  elements.treeColor.addEventListener('change', () => renderTreeStatus('Hamle rengi seçildi.'));
  elements.treeX.addEventListener('input', () => renderTreeStatus('Hamle koordinatı hazır.'));
  elements.treeY.addEventListener('input', () => renderTreeStatus('Hamle koordinatı hazır.'));
  elements.treeComment.addEventListener('input', () => updateSelectedNodeMetadata());
  elements.treeAnnotations.addEventListener('input', () => updateSelectedNodeMetadata());

  for (const btn of elements.modeBtns) {
    btn.addEventListener('click', () => setActiveMode(btn.dataset.mode));
  }

  elements.board.addEventListener('click', addMoveFromBoardClick);
  elements.board.addEventListener('click', addStoneFromSetupClick);
  elements.board.addEventListener('click', addMarkerFromBoardClick);
}
function setActiveDocument(document, { keepSelection = false, filePath = null, preserveCandidateSession = false } = {}) {
  if (!preserveCandidateSession) {
    clearCandidateSession();
  }
  state.activeDocument = ensureMoveTreeDocument(document);
  state.activeDocumentPath = filePath;
  if (!keepSelection) {
    state.selectedNodeId = state.activeDocument.activeNodeId ?? 'root';
    state.activeMode = 'review';
  } else {
    state.selectedNodeId = state.activeDocument.activeNodeId ?? state.selectedNodeId ?? 'root';
  }
  syncDocumentFromSelection();
  renderWorkspace();
  renderActiveDocument();
}

function syncDocumentFromSelection() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;

  doc.activeNodeId = state.selectedNodeId;
  doc.moveTree.activeNodeId = state.selectedNodeId;
  const boardState = rebuildBoardState(doc.moveTree.root, state.selectedNodeId);
  doc.board = boardAdapter.mergeDocumentBoard(doc.board, boardAdapter.toDocumentBoard(boardState));
  doc.moves = serializeMainlineMoves(doc.moveTree.root);
  state.activeDocument = doc;
}

function renderWorkspace() {
  elements.workspaceTitle.textContent = state.needsWorkspaceSelection ? 'İlk açılış: proje klasörü seçin' : 'Tahta-merkezli çalışma alanı';
  elements.workspacePath.textContent = state.workspaceFolder ?? 'Belgeler\\AntalyaGo Studio önerilir';
  elements.workspaceBanner.hidden = !state.needsWorkspaceSelection;
  elements.libraryEmpty.hidden = state.documents.length > 0;
  elements.contentMode.value = state.contentProducerMode ? 'producer' : 'editor';
  elements.producerToggle.textContent = state.contentProducerMode ? 'İçerik Üretici modu açık' : 'İçerik Üretici modu';
  elements.producerToggle.setAttribute('aria-pressed', String(state.contentProducerMode));

  elements.libraryList.replaceChildren(...state.documents.map((doc, idx) => renderLibraryItem(doc, idx)));
  renderCandidatePanel();
  elements.timelineSummary.textContent = state.documents.length
    ? `${state.documents.length} belge yüklendi; son belge ${state.activeDocument?.title ?? 'belirlenmedi'}.`
    : 'Yeni belge ve doğrulama notları burada toplanır.';
}
function renderLibraryItem(item, index) {
  const li = document.createElement('li');
  const isActive = item.id === state.activeDocument?.id;
  li.className = 'library-item' + (isActive ? ' is-active' : '');
  li.dataset.docIndex = String(index);
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '0');
  const size = item.board?.size ?? item.boardSize ?? 9;
  li.innerHTML = `
    <p class="library-item__title">${escapeHtml(item.title ?? 'Başlıksız belge')}</p>
    <p class="library-item__meta">${escapeHtml(item.status ?? 'taslak')} · ${size}×${size}</p>
  `;
  return li;
}

function renderActiveDocument() {
  const doc = ensureMoveTreeDocument(state.activeDocument ?? createEmptyDocument());
  const validation = validateDocument(doc);
  state.activeDocument = doc;
  const tree = doc.moveTree;
  if (!tree?.root) {
    elements.boardCaption.textContent = 'Hamle ağacı yüklenemedi.';
    return;
  }

  if (!findMoveNode(tree.root, state.selectedNodeId)) {
    state.selectedNodeId = tree.activeNodeId ?? 'root';
  }

  syncDocumentFromSelection();

  elements.docTitle.value = doc.title ?? '';
  elements.docStatus.value = doc.status ?? '';
  elements.docSection.value = doc.curriculum?.section ?? '';
  elements.docSummary.value = doc.summary ?? '';
  elements.technicalJson.textContent = JSON.stringify({ document: doc, validation }, null, 2);
  elements.technicalDetails.open = false;

  const boardState = boardAdapter.fromMoveTree(doc.moveTree, state.selectedNodeId);
  const renderBoard = { ...boardAdapter.toDocumentBoard(boardState), markers: doc.board?.markers ?? [] };
  boardRenderer.render(elements.board, renderBoard);
  renderMoveTree(doc.moveTree);
  renderSelectedNodeMetadata();
  renderTreeStatus(buildTreeStatus());
  renderCandidateState();
  const candidateCaption = isCandidatePreviewMode()
    ? 'Bu görünüm salt-okunur bir aday önizlemesidir. İlk kayıt Farklı Kaydet ile yapılır.'
    : isCandidateWorkingMode()
      ? 'Aday ayrı bir çalışma belgesi olarak açık. İlk kayıt Farklı Kaydet ile yapılır.'
      : null;
  elements.boardCaption.textContent = candidateCaption || (validation.valid
    ? 'Hamle ağacı seçili düğüme göre tahtayı yeniden kurar; teknik JSON ve doğrulama ayrıntıları sağ panelde gizli tutulur.'
    : `Belge doğrulaması: ${validation.errors.length} hata, ${validation.warnings.length} uyarı.`);
  renderModeSelector();
}
function renderMoveTree(moveTree) {
  const root = moveTree.root;
  const path = getMovePath(root, state.selectedNodeId);
  const mainlineIds = getMainlineIdSet(root);
  const activePathIds = new Set(path.map(n => n.id));
  elements.treeSummary.textContent = `Hamle ağacı · ${countTreeNodes(root)} düğüm · ${countTreeBranches(root)} dal`;

  elements.treePath.replaceChildren(...path.map((node, index) => renderPathNode(node, index, path.length)));
  elements.treeCanvas.style.transform = `scale(${state.treeZoom.toFixed(2)})`;
  elements.treeCanvas.style.transformOrigin = 'top left';

  elements.treeCanvas.replaceChildren(buildMoveTreeSvg(root, mainlineIds, activePathIds));

  const activeNode = findMoveNode(root, state.selectedNodeId) ?? root;
  elements.treeViewport.setAttribute('aria-activedescendant', `tree-node-${activeNode.id}`);

  // Aktif node görünür alana kaydır
  requestAnimationFrame(() => {
    const activeEl = elements.treeCanvas.querySelector('[aria-current="true"]');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function buildMoveTreeSvg(root, mainlineIds, activePathIds) {
  const R  = 13;   // node yarıçapı
  const CW = 44;   // sütun genişliği
  const RH = 50;   // satır yüksekliği
  const P  = 14;   // kenar boşluğu
  const ns = 'http://www.w3.org/2000/svg';

  // 1. Düzen: her düğüme (sütun, satır) ata
  const pos = new Map();
  let mC = 0, mR = 0;

  function layout(node, c, r) {
    pos.set(node.id, { c, r });
    mC = Math.max(mC, c);
    mR = Math.max(mR, r);
    if (!node.children?.length) return r;
    const pref = node.children.find(n => n.id === node.preferredChildId) ?? node.children[0];
    const rest = node.children.filter(n => n !== pref);
    let bot = layout(pref, c + 1, r);
    for (const ch of rest) bot = layout(ch, c + 1, bot + 1);
    return bot;
  }
  layout(root, 0, 0);

  // 2. Derinlik haritası (hamle numaraları için)
  const dep = new Map();
  const bfsQ = [[root, 0]];
  while (bfsQ.length) {
    const [n, d] = bfsQ.shift();
    dep.set(n.id, d);
    for (const ch of n.children ?? []) bfsQ.push([ch, d + 1]);
  }

  // 3. SVG oluştur
  const W = P * 2 + (mC + 1) * CW;
  const H = P * 2 + (mR + 1) * RH;

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('class', 'move-tree-svg');
  svg.setAttribute('aria-hidden', 'true');

  const eL  = document.createElementNS(ns, 'g');
  eL.setAttribute('class', 'tree-edges');
  const eLp = document.createElementNS(ns, 'g');
  eLp.setAttribute('class', 'tree-edges tree-edges--active-path');
  const nL  = document.createElementNS(ns, 'g');
  nL.setAttribute('class', 'tree-nodes');

  const stk = [root];
  while (stk.length) {
    const node = stk.pop();
    const p = pos.get(node.id);
    if (!p) continue;

    const cx = P + p.c * CW + R;
    const cy = P + p.r * RH + R;
    const active = node.id === state.selectedNodeId;
    const main = mainlineIds.has(node.id);
    const onActivePath = activePathIds?.has(node.id) ?? false;

    // Kenar (parent'tan bu düğüme)
    if (node.parentId) {
      const pp = pos.get(node.parentId);
      if (pp) {
        const px = P + pp.c * CW + R;
        const py = P + pp.r * RH + R;
        const d = pp.r === p.r
          ? `M${px},${py} L${cx},${cy}`
          : `M${px},${py} H${px + Math.round(CW * 0.5)} V${cy} H${cx}`;
        const ep = document.createElementNS(ns, 'path');
        ep.setAttribute('d', d);
        const isActivePath = onActivePath && (activePathIds?.has(node.parentId) ?? false);
        ep.setAttribute('class', `tree-edge ${isActivePath ? 'tree-edge--active-path' : main ? 'tree-edge--main' : 'tree-edge--var'}`);
        (isActivePath ? eLp : eL).appendChild(ep);
      }
    }

    // Düğüm grubu
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', `tree-node${active ? ' is-active' : ''}${main ? ' is-mainline' : ''}`);
    g.setAttribute('data-node-id', node.id);
    g.id = `tree-node-${node.id}`;
    if (active) g.setAttribute('aria-current', 'true');

    // Tooltip (screen reader + hover)
    const ttl = document.createElementNS(ns, 'title');
    ttl.textContent = node.id === 'root'
      ? 'Başlangıç pozisyonu'
      : `${dep.get(node.id) ?? 0}. hamle — ${humanizeMove(node.move)}`;
    g.appendChild(ttl);

    // Aktif halka
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('cx', cx);
    ring.setAttribute('cy', cy);
    ring.setAttribute('r', R + 5);
    ring.setAttribute('class', 'tree-node__ring');
    g.appendChild(ring);

    // Taş çemberi
    const st = document.createElementNS(ns, 'circle');
    st.setAttribute('cx', cx);
    st.setAttribute('cy', cy);
    st.setAttribute('r', R);
    let sc = 'tree-node__stone';
    if (node.id === 'root')         sc += ' tree-node__stone--root';
    else if (node.move?.pass)       sc += ` tree-node__stone--pass tree-node__stone--${node.move.color || 'black'}`;
    else                            sc += ` tree-node__stone--${node.move?.color || 'black'}`;
    st.setAttribute('class', sc);
    g.appendChild(st);

    // Etiket
    const tx = document.createElementNS(ns, 'text');
    tx.setAttribute('x', cx);
    tx.setAttribute('y', cy);
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('dominant-baseline', 'central');
    const lc = ['tree-node__label'];
    if (node.move?.color === 'white') lc.push('tree-node__label--white');
    if (node.move?.pass)              lc.push('tree-node__label--pass');
    tx.setAttribute('class', lc.join(' '));
    tx.textContent = node.id === 'root' ? '●' : node.move?.pass ? 'Pas' : String(dep.get(node.id) ?? 0);
    g.appendChild(tx);

    nL.appendChild(g);
    for (const ch of [...(node.children ?? [])].reverse()) stk.push(ch);
  }

  svg.appendChild(eL);
  svg.appendChild(eLp);
  svg.appendChild(nL);
  return svg;
}

function renderPathNode(node, index, total) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'move-tree-chip';
  if (node.id === state.selectedNodeId) button.classList.add('is-active');
  button.dataset.nodeId = node.id;
  button.textContent = formatPathLabel(node, index, total);
  button.setAttribute('aria-pressed', String(node.id === state.selectedNodeId));
  return button;
}

function renderSelectedNodeMetadata() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId) ?? doc.moveTree.root;
  elements.treeComment.value = node.comment ?? '';
  elements.treeAnnotations.value = Array.isArray(node.annotations) && node.annotations.length > 0
    ? node.annotations.map(a => typeof a === 'object' ? (a.type ?? 'annotation') : String(a)).join(', ')
    : '';
  const boardState = rebuildBoardState(doc.moveTree.root, state.selectedNodeId);
  elements.treeColor.value = boardState.turn;
  elements.treeX.value = node.move?.x ?? '';
  elements.treeY.value = node.move?.y ?? '';
  elements.treeDelete.disabled = node.id === 'root';
  elements.treePromote.disabled = node.id === 'root';
}

function renderTreeStatus(message) {
  elements.treeStatus.textContent = message;
}

function buildTreeStatus() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return 'Hamle ağacı hazır değil.';
  const path = getMovePath(doc.moveTree.root, state.selectedNodeId);
  const node = path[path.length - 1] ?? doc.moveTree.root;
  const label = node.id === 'root' ? 'Kök' : formatMoveNumber(path.length - 1);
  return node.id === 'root'
    ? 'Kök formasyon seçili.'
    : `${label} · ${humanizeMove(node.move)} seçili.`;
}

function updateSelectedNodeMetadata() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) {
    renderTreeStatus('Aday önizlemesi salt-okunur.');
    return;
  }
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node) return;
  setMoveNodeComment(doc.moveTree.root, node.id, elements.treeComment.value);
  // Annotations alanı görüntüleme amaçlıdır; typed annotation'lar
  // ayrılmış editörden eklenir. String yazımı kabul edilmez.
  syncDocumentFromSelection();
  renderActiveDocument();
}
function boardClickCoord(event, boardEl, size) {
  const svg = boardEl.querySelector('svg');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const VBOX = 360, PAD = 24, GRID = 312;
  const svgX = (event.clientX - rect.left) / rect.width  * VBOX;
  const svgY = (event.clientY - rect.top)  / rect.height * VBOX;
  const cellSize = GRID / (size - 1);
  const gx = Math.round((svgX - PAD) / cellSize);
  const gy = Math.round((svgY - PAD) / cellSize);
  if (gx < 0 || gx >= size || gy < 0 || gy >= size) return null;
  return { x: gx, y: gy };
}

function addMoveFromBoardClick(event) {
  if (state.activeMode !== 'move') return;
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) return;
  const boardState = rebuildBoardState(doc.moveTree.root, state.selectedNodeId);
  const coord = boardClickCoord(event, elements.board, boardState.size);
  if (!coord) return;
  const parent = findMoveNode(doc.moveTree.root, state.selectedNodeId) ?? doc.moveTree.root;
  const result = addChildMove(doc.moveTree.root, parent.id, { color: boardState.turn, x: coord.x, y: coord.y });
  if (!result.ok || !result.node) {
    renderTreeStatus(moveErrorMessage(result.reason));
    return;
  }
  doc.moveTree.activeNodeId = result.node.id;
  state.selectedNodeId = result.node.id;
  syncDocumentFromSelection();
  renderActiveDocument();
  renderTreeStatus(`Hamle eklendi: ${humanizeMove(result.node.move)}`);
}

function cycleSetupStone(formation, x, y) {
  if (!formation) return;
  if (!Array.isArray(formation.stones)) formation.stones = [];
  const idx = formation.stones.findIndex(s => s.x === x && s.y === y);
  if (idx === -1) {
    formation.stones.push({ x, y, color: 'black' });
  } else if (formation.stones[idx].color === 'black') {
    formation.stones[idx] = { x, y, color: 'white' };
  } else {
    formation.stones.splice(idx, 1);
  }
}

function addStoneFromSetupClick(event) {
  if (state.activeMode !== 'setup') return;
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) return;
  const formation = doc.moveTree.root.formation;
  if (!formation) return;
  const coord = boardClickCoord(event, elements.board, formation.size ?? 9);
  if (!coord) return;
  cycleSetupStone(formation, coord.x, coord.y);
  syncDocumentFromSelection();
  renderActiveDocument();
  const stone = formation.stones.find(s => s.x === coord.x && s.y === coord.y);
  const label = stone ? (stone.color === 'black' ? 'Siyah taş' : 'Beyaz taş') : 'Taş kaldırıldı';
  renderTreeStatus(`Kurulum: ${label} (${coord.x},${coord.y})`);
}

function toggleBoardMarker(board, x, y) {
  if (!board) return;
  if (!Array.isArray(board.markers)) board.markers = [];
  const idx = board.markers.findIndex(m => m.x === x && m.y === y);
  if (idx === -1) {
    board.markers.push({ x, y, type: 'circle' });
  } else {
    board.markers.splice(idx, 1);
  }
}

function addMarkerFromBoardClick(event) {
  if (state.activeMode !== 'marker') return;
  const doc = state.activeDocument;
  if (!doc?.board) return;
  if (isCandidatePreviewMode()) return;
  const size = doc.board.size ?? 9;
  const coord = boardClickCoord(event, elements.board, size);
  if (!coord) return;
  toggleBoardMarker(doc.board, coord.x, coord.y);
  renderActiveDocument();
  const exists = doc.board.markers?.some(m => m.x === coord.x && m.y === coord.y);
  renderTreeStatus(`İşaret: ${exists ? 'Eklendi' : 'Kaldırıldı'} (${coord.x},${coord.y})`);
}

function addTreeMoveFromForm() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) {
    renderTreeStatus('Aday önizlemesi salt-okunur.');
    return;
  }
  const parent = findMoveNode(doc.moveTree.root, state.selectedNodeId) ?? doc.moveTree.root;
  const move = {
    color: elements.treeColor.value === 'white' ? 'white' : 'black',
    x: Number(elements.treeX.value),
    y: Number(elements.treeY.value),
  };
  const result = addChildMove(doc.moveTree.root, parent.id, move, {
    comment: elements.treeComment.value.trim(),
    annotations: parseAnnotations(elements.treeAnnotations.value),
    preferred: !parent.preferredChildId,
  });

  if (!result.ok || !result.node) {
    renderTreeStatus(moveErrorMessage(result.reason));
    return;
  }

  doc.moveTree.activeNodeId = result.node.id;
  state.selectedNodeId = result.node.id;
  syncDocumentFromSelection();
  renderActiveDocument();
  renderTreeStatus(`Hamle eklendi: ${humanizeMove(result.node.move)}`);
}
function requestDeleteSelectedVariant() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) {
    renderTreeStatus('Aday önizlemesi salt-okunur.');
    return;
  }
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node || node.id === 'root') return;
  const label = humanizeMove(node.move);
  if (!window.confirm(`Bu varyantı silmek istiyor musunuz?\\n${label}`)) {
    return;
  }
  const result = deleteMoveNode(doc.moveTree.root, node.id);
  if (!result.ok) {
    renderTreeStatus(moveErrorMessage(result.reason));
    return;
  }
  state.selectedNodeId = node.parentId ?? 'root';
  doc.moveTree.activeNodeId = state.selectedNodeId;
  syncDocumentFromSelection();
  renderActiveDocument();
  renderTreeStatus('Varyant silindi.');
}
function promoteSelectedNode() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (isCandidatePreviewMode()) {
    renderTreeStatus('Aday önizlemesi salt-okunur.');
    return;
  }
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node || node.id === 'root') return;
  const parent = findMoveNode(doc.moveTree.root, node.parentId);
  if (!parent) return;
  const changed = setPreferredChild(doc.moveTree.root, parent.id, node.id);
  if (!changed) return;
  syncDocumentFromSelection();
  renderActiveDocument();
  renderTreeStatus('Ana dal güncellendi.');
}
function goToParentNode() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node?.parentId) return;
  setActiveNode(node.parentId, { focus: true });
}

function goToPreferredChild() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  const child = node?.children?.find(entry => entry.id === node.preferredChildId) ?? node?.children?.[0] ?? null;
  if (!child) return;
  setActiveNode(child.id, { focus: true });
}

function setActiveNode(nodeId, { focus = false } = {}) {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  if (!findMoveNode(doc.moveTree.root, nodeId)) return;
  state.selectedNodeId = nodeId;
  doc.activeNodeId = nodeId;
  syncDocumentFromSelection();
  renderActiveDocument();
  if (focus) {
    elements.treeViewport.focus({ preventScroll: true });
  }
}

function setTreeZoom(nextZoom) {
  state.treeZoom = Math.max(0.8, Math.min(1.4, Number(nextZoom.toFixed(2))));
  elements.treeCanvas.style.transform = `scale(${state.treeZoom})`;
  renderTreeStatus(`Yakınlaştırma: %${Math.round(state.treeZoom * 100)}`);
}

function createEmptyDocument() {
  return createDocument({
    id: 'content-producer-draft',
    title: 'Yeni belge',
    slug: 'content-producer-draft',
    status: 'draft',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
}

function createOfflineDocuments() {
  const base = createEmptyDocument();
  const second = createDocument({
    id: 'rulebook-lesson',
    title: 'Temel kural anlatımı',
    slug: 'rulebook-lesson',
    summary: 'Yerel masaüstü kabuğunda tahta, kütüphane ve denetçi yerleşimi.',
    status: 'review',
    board: {
      size: 9,
      turn: 'white',
      ko: null,
      stones: [
        { x: 4, y: 4, color: 'black' },
        { x: 4, y: 5, color: 'white' },
      ],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
  const third = createDocument({
    id: 'board-adapter-check',
    title: 'StudioBoardAdapter doğrulaması',
    slug: 'board-adapter-check',
    summary: 'BoardState ve RuleEngine sınırlarının hazırlanması.',
    status: 'draft',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [
        { x: 1, y: 7, color: 'black' },
        { x: 7, y: 1, color: 'white' },
      ],
      markers: [],
      regions: [],
      viewport: null,
    },
  });
  return [base, second, third];
}

function createOfflineBootState() {
  const documents = createOfflineDocuments();
  return {
    settings: {
      workspaceFolder: null,
      contentProducerMode: true,
    },
    documents,
    activeDocument: documents[0],
  };
}

function createOfflineApi() {
  const boot = createOfflineBootState();
  return {
    boot: async () => boot,
    setContentProducerMode: async enabled => ({ enabled }),
    chooseWorkspaceFolder: async () => ({ workspaceFolder: 'C:\\Users\\Ekim\\Documents\\AntalyaGo Studio' }),
    newDocument: async () => ({ document: createEmptyDocument() }),
    openDocument: async () => ({ document: createOfflineDocuments()[1] }),
    saveDocument: async document => ({ document }),
    saveDocumentAs: async document => ({ document }),
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function parseAnnotations(value) {
  return String(value ?? '')
    .split(/[\n,;]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function formatMoveNumber(index) {
  return `${index}. hamle`;
}

function formatPathLabel(node, index, total) {
  if (node.id === 'root') {
    return 'Kök';
  }
  const move = humanizeMove(node.move);
  const position = `${index}/${Math.max(total - 1, 1)}`;
  return `${position} · ${move}`;
}

function humanizeMove(move) {
  if (!move) return 'hamle yok';
  const color = move.color === 'white' ? 'Beyaz' : 'Siyah';
  if (move.pass) return `${color} Pas`;
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const column = letters[move.x] ?? String(move.x);
  const row = Number.isInteger(move.y) ? `${move.y + 1}` : '?';
  return `${color} ${column}${row}`;
}

function getMainlineIdSet(root) {
  const ids = new Set(['root']);
  let cursor = root;
  while (cursor?.preferredChildId) {
    const child = cursor.children.find(entry => entry.id === cursor.preferredChildId);
    if (!child || ids.has(child.id)) break;
    ids.add(child.id);
    cursor = child;
  }
  return ids;
}

function countTreeNodes(root) {
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    count++;
    for (const child of node.children ?? []) stack.push(child);
  }
  return count;
}

function countTreeBranches(root) {
  let branches = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if ((node.children?.length ?? 0) > 1) branches += node.children.length - 1;
    for (const child of node.children ?? []) stack.push(child);
  }
  return branches;
}

function findDeepestPreferredNode(root) {
  let cursor = root;
  while (cursor?.preferredChildId) {
    const child = cursor.children.find(entry => entry.id === cursor.preferredChildId);
    if (!child) break;
    cursor = child;
  }
  return cursor ?? root;
}

function moveErrorMessage(reason) {
  switch (reason) {
    case 'PARENT_NOT_FOUND': return 'Seçili düğüm bulunamadı.';
    case 'NODE_NOT_FOUND': return 'Silinecek düğüm bulunamadı.';
    case 'ROOT_NOT_DELETABLE': return 'Kök düğüm silinemez.';
    case 'OCCUPIED': return 'Bu kesişim zaten dolu.';
    case 'KO': return 'Ko noktası seçildi.';
    case 'SUICIDE': return 'Bu hamle yasadışı; taşın nefesi kalmıyor.';
    case 'OUT_OF_BOUNDS': return 'Hamle tahta dışına çıkıyor.';
    default: return 'Hamle eklenemedi.';
  }
}

function showOfflineError(error) {
  elements.workspaceTitle.textContent = 'Studio yüklenemedi';
  elements.workspacePath.textContent = error?.message ?? String(error);
  elements.libraryList.replaceChildren();
  elements.boardCaption.textContent = 'Renderer başlatılamadı.';
}
