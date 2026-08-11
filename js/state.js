/* ============================================================
   ReferenceSync — состояние приложения и хранение настроек
   ============================================================ */

import { SEARCH_MODES } from './instagram.js';

const STORAGE_KEY = 'reference-sync.settings.v1';

export const defaultSettings = {
  platform: 'instagram',
  source: 'browser',          // browser | meta
  username: '',
  browser: 'chrome',
  speed: 'safe',
  searchMode: SEARCH_MODES.SMART,
  recentLimit: 50,
  folderSearch: false,
  extraFilters: false,
  filterPhoto: true,
  filterVideo: true,
  filterCarousel: true,
  authorInclude: '',
  authorExclude: '',
  thumbnails: true,
  numberingEnabled: true,
  numberingDestination: 'name',
  numberingMarker: 'instpoporder-',
  numberingStart: 1,
  counterOne: 'global',
  counterTwo: 'carousel',
  descriptionEnabled: true,
  descriptionDestination: 'description',
  descriptionPlacement: 'start',
  extraDescription: '',
  language: 'ru',
};

export const state = {
  settings: { ...defaultSettings },
  /* Найденные публикации */
  posts: [],
  /* Выбранные postId */
  selected: new Set(),
  /* Правки пользователя: postId → { name, description } */
  edits: new Map(),
  /* Сгенерированные имена: postId → { name, description, ... } */
  generated: new Map(),
  /* История правок для Cmd/Ctrl+Z */
  undoStack: [],
  redoStack: [],
  /* Коллекции Instagram, выбранные пользователем */
  collections: [],
  /* Уже импортированные ранее publikacii (для режима «только новые») */
  knownPostIds: new Set(),
  /* Текущая операция */
  busy: false,
  abortController: null,
  eagleAvailable: false,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.keys(defaultSettings).forEach((key) => {
      if (parsed[key] !== undefined) state.settings[key] = parsed[key];
    });
  } catch (_) { /* настройки повреждены — используем значения по умолчанию */ }
}

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch (_) { /* локальное хранилище недоступно */ }
}

export function setSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
}

/* Список публикаций после применения фильтров */
export function visiblePosts() {
  const s = state.settings;
  if (!s.extraFilters) return state.posts;

  const include = s.authorInclude.trim().toLowerCase()
    .split(/[,\s]+/).filter(Boolean);
  const exclude = s.authorExclude.trim().toLowerCase()
    .split(/[,\s]+/).filter(Boolean);

  return state.posts.filter((post) => {
    const isVideo = post.type.toLowerCase().includes('видео');
    const isCarousel = post.componentCount > 1;
    const isPhoto = !isVideo && !isCarousel;

    if (isPhoto && !s.filterPhoto) return false;
    if (isVideo && !s.filterVideo) return false;
    if (isCarousel && !s.filterCarousel) return false;

    const author = post.plainUsername.toLowerCase();
    if (include.length && !include.some((name) =>
      author.includes(name.replace(/^@/, '')))) return false;
    if (exclude.length && exclude.some((name) =>
      author.includes(name.replace(/^@/, '')))) return false;

    return true;
  });
}

/* Значение ячейки с учётом правок пользователя */
export function cellValue(postId, field) {
  const edit = state.edits.get(postId);
  if (edit && edit[field] !== undefined) return edit[field];
  return state.generated.get(postId)?.[field] ?? '';
}

export function isEdited(postId, field) {
  const edit = state.edits.get(postId);
  return Boolean(edit && edit[field] !== undefined);
}

/* Правка ячейки с записью в историю (для Undo/Redo) */
export function applyEdit(postId, field, value) {
  const previous = state.edits.get(postId)?.[field];
  const generated = state.generated.get(postId)?.[field] ?? '';

  /* Возврат к сгенерированному значению снимает правку */
  if (value === generated) {
    removeEdit(postId, field, { record: true, previous });
    return;
  }

  const edit = state.edits.get(postId) || {};
  edit[field] = value;
  state.edits.set(postId, edit);

  state.undoStack.push({ postId, field, from: previous, to: value });
  state.redoStack.length = 0;
}

export function removeEdit(postId, field, { record = true, previous } = {}) {
  const edit = state.edits.get(postId);
  if (!edit) return;
  const from = previous !== undefined ? previous : edit[field];
  delete edit[field];
  if (!Object.keys(edit).length) state.edits.delete(postId);
  if (record) {
    state.undoStack.push({ postId, field, from, to: undefined });
    state.redoStack.length = 0;
  }
}

function setRaw(postId, field, value) {
  if (value === undefined) {
    const edit = state.edits.get(postId);
    if (edit) {
      delete edit[field];
      if (!Object.keys(edit).length) state.edits.delete(postId);
    }
    return;
  }
  const edit = state.edits.get(postId) || {};
  edit[field] = value;
  state.edits.set(postId, edit);
}

export function undoEdit() {
  const action = state.undoStack.pop();
  if (!action) return false;
  setRaw(action.postId, action.field, action.from);
  state.redoStack.push(action);
  return true;
}

export function redoEdit() {
  const action = state.redoStack.pop();
  if (!action) return false;
  setRaw(action.postId, action.field, action.to);
  state.undoStack.push(action);
  return true;
}

export function resetAllEdits() {
  state.edits.clear();
  state.undoStack.length = 0;
  state.redoStack.length = 0;
}

export function hasEdits() {
  return state.edits.size > 0;
}
