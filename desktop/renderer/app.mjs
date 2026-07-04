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

const boardRenderer = createBoardRenderer('svg');
const boardAdapter = createStudioBoardAdapter(BoardState);
const api = globalThis.studioAPI ?? createOfflineApi();

const elements = {
  workspaceTitle: document.getElementById('studio-workspace-title'),
  workspacePath: document.getElementById('studio-workspace-path'),
  workspaceBanner: document.querySelector('[data-workspace-banner]'),
  libraryList: document.querySelector('[data-library-list]'),
  libraryEmpty: document.querySelector('[data-library-empty]'),
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
  treeList: document.querySelector('[data-move-tree-list]'),
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
};

const state = {
  settings: null,
  documents: [],
  activeDocument: null,
  contentProducerMode: true,
  workspaceFolder: null,
  needsWorkspaceSelection: false,
  selectedNodeId: 'root',
  treeZoom: 1,
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
  renderWorkspace();
  renderActiveDocument();
}

function applyBootState(boot) {
  state.settings = boot?.settings ?? null;
  state.documents = Array.isArray(boot?.documents) ? boot.documents : createOfflineDocuments();
  state.activeDocument = ensureMoveTreeDocument(boot?.activeDocument ?? state.documents[0] ?? createEmptyDocument());
  state.contentProducerMode = boot?.settings?.contentProducerMode ?? true;
  state.needsWorkspaceSelection = boot?.needsWorkspaceSelection ?? false;
  state.workspaceFolder = boot?.settings?.workspaceFolder ?? null;
  state.selectedNodeId = state.activeDocument.activeNodeId ?? 'root';
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

  elements.actionNew.addEventListener('click', async () => {
    if (typeof api.newDocument !== 'function') {
      return;
    }
    const next = await api.newDocument();
    if (next?.document) {
      setActiveDocument(next.document);
    }
  });

  elements.actionOpen.addEventListener('click', async () => {
    if (typeof api.openDocument !== 'function') {
      return;
    }
    const next = await api.openDocument();
    if (next?.document) {
      setActiveDocument(next.document);
    }
  });

  elements.actionSave.addEventListener('click', async () => {
    if (typeof api.saveDocument !== 'function') {
      return;
    }
    syncDocumentFromSelection();
    const result = await api.saveDocument(state.activeDocument);
    if (result?.document) {
      setActiveDocument(result.document, { keepSelection: true });
    }
  });

  elements.actionSaveAs.addEventListener('click', async () => {
    if (typeof api.saveDocumentAs !== 'function') {
      return;
    }
    syncDocumentFromSelection();
    const result = await api.saveDocumentAs(state.activeDocument);
    if (result?.document) {
      setActiveDocument(result.document, { keepSelection: true });
    }
  });

  elements.treeViewport.addEventListener('click', event => {
    const button = event.target.closest('[data-node-id]');
    if (!button) return;
    setActiveNode(button.dataset.nodeId, { focus: false });
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
}

function setActiveDocument(document, { keepSelection = false } = {}) {
  state.activeDocument = ensureMoveTreeDocument(document);
  if (!keepSelection) {
    state.selectedNodeId = state.activeDocument.activeNodeId ?? 'root';
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
  const boardState = rebuildBoardState(doc.moveTree.root, state.selectedNodeId);
  doc.board = boardAdapter.toDocumentBoard(boardState);
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

  elements.libraryList.replaceChildren(...state.documents.map(renderLibraryItem));
  elements.timelineSummary.textContent = state.documents.length
    ? `${state.documents.length} belge yüklendi; son belge ${state.activeDocument?.title ?? 'belirlenmedi'}.`
    : 'Yeni belge ve doğrulama notları burada toplanır.';
}

function renderLibraryItem(item) {
  const li = document.createElement('li');
  li.className = 'library-item';
  li.innerHTML = `
    <p class="library-item__title">${escapeHtml(item.title ?? 'Başlıksız belge')}</p>
    <p class="library-item__meta">${escapeHtml(item.status ?? 'taslak')} · ${item.boardSize ?? '9'}×${item.boardSize ?? '9'}</p>
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
  boardRenderer.render(elements.board, boardAdapter.toDocumentBoard(boardState));
  renderMoveTree(doc.moveTree);
  renderSelectedNodeMetadata();
  renderTreeStatus(buildTreeStatus());
  elements.boardCaption.textContent = validation.valid
    ? 'Hamle ağacı seçili düğüme göre tahtayı yeniden kurar; teknik JSON ve doğrulama ayrıntıları sağ panelde gizli tutulur.'
    : `Belge doğrulaması: ${validation.errors.length} hata, ${validation.warnings.length} uyarı.`;
}

function renderMoveTree(moveTree) {
  const root = moveTree.root;
  const path = getMovePath(root, state.selectedNodeId);
  const mainlineIds = getMainlineIdSet(root);
  elements.treeSummary.textContent = `Hamle ağacı · ${countTreeNodes(root)} düğüm · ${countTreeBranches(root)} dal`;

  elements.treePath.replaceChildren(...path.map((node, index) => renderPathNode(node, index, path.length)));
  elements.treeCanvas.style.transform = `scale(${state.treeZoom.toFixed(2)})`;
  elements.treeCanvas.style.transformOrigin = 'top left';

  elements.treeList.replaceChildren(renderTreeBranch(root, mainlineIds, 0));

  const activeNode = findMoveNode(root, state.selectedNodeId) ?? root;
  elements.treeViewport.setAttribute('aria-activedescendant', `move-node-${activeNode.id}`);
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

function renderTreeBranch(node, mainlineIds, depth) {
  const item = document.createElement('li');
  item.className = 'move-tree-item';
  item.id = `move-node-${node.id}`;
  if (node.id === state.selectedNodeId) item.classList.add('is-active');
  if (mainlineIds.has(node.id)) item.classList.add('is-mainline');

  const header = document.createElement('div');
  header.className = 'move-tree-item__header';

  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'move-tree-item__select';
  select.dataset.nodeId = node.id;
  select.textContent = formatNodeLabel(node, depth);
  select.setAttribute('aria-pressed', String(node.id === state.selectedNodeId));
  header.appendChild(select);

  const meta = document.createElement('span');
  meta.className = 'move-tree-item__meta';
  meta.textContent = node.id === 'root'
    ? 'Başlangıç formasyonu'
    : `${humanizeMove(node.move)}${node.comment ? ` · ${node.comment}` : ''}`;
  header.appendChild(meta);

  item.appendChild(header);

  if (node.annotations?.length) {
    const note = document.createElement('p');
    note.className = 'move-tree-item__note';
    note.textContent = node.annotations
      .map(a => typeof a === 'object' ? (a.type ?? 'annotation') : String(a))
      .join(' · ');
    item.appendChild(note);
  }

  if (node.children?.length) {
    const list = document.createElement('ol');
    list.className = 'move-tree-children';
    for (const child of node.children) {
      list.appendChild(renderTreeBranch(child, mainlineIds, depth + 1));
    }
    item.appendChild(list);
  }

  return item;
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
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node) return;
  setMoveNodeComment(doc.moveTree.root, node.id, elements.treeComment.value);
  // Annotations alanı görüntüleme amaçlıdır; typed annotation'lar
  // ayrılmış editörden eklenir. String yazımı kabul edilmez.
  syncDocumentFromSelection();
  renderActiveDocument();
}

function addTreeMoveFromForm() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
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
  renderTreeStatus(`Hamle eklendi: ${humanizeMove(result.node.move)}.`);
}

function requestDeleteSelectedVariant() {
  const doc = state.activeDocument;
  if (!doc?.moveTree?.root) return;
  const node = findMoveNode(doc.moveTree.root, state.selectedNodeId);
  if (!node || node.id === 'root') return;
  const label = humanizeMove(node.move);
  if (!window.confirm(`Bu varyantı silmek istiyor musunuz?\n${label}`)) {
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
    title: 'Yeni içerik taslağı',
    slug: 'content-producer-draft',
    summary: 'Tahta-merkezli içerik üretimi için başlangıç taslağı.',
    status: 'draft',
    board: {
      size: 9,
      turn: 'black',
      ko: null,
      stones: [
        { x: 2, y: 2, color: 'black' },
        { x: 6, y: 6, color: 'white' },
      ],
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

function formatNodeLabel(node, depth) {
  if (node.id === 'root') {
    return 'Başlangıç formasyonu';
  }
  const move = humanizeMove(node.move);
  const branch = depth === 1 ? 'Ana dal' : `Dal ${depth}`;
  return `${branch} · ${move}`;
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
