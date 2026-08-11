/* ============================================================
   ReferenceSync — сборка панелей интерфейса
   Соответствие блокам Figma:
     buildTitlebar  → «Кнопка верхнего меню»
     buildHeader    → «1 блок»
     buildSocial    → «2 блок»
     buildSettings  → «3 блок 1-2 шаг»
     buildStatus    → «4 блок»
     buildResults   → «5 блок»
     buildNaming    → «6 блок»
     buildFooter    → Simple button + Search button
   ============================================================ */

import {
  el, clear,
  createSwitch, createCheckbox, createRadioGroup, createInfo,
  createField, createSelect, createSpinner, createGlassButton,
  createSocialButton, createButton, createGhostButton, createEditButton,
} from './ui.js';

import { state, setSetting } from './state.js';
import { SEARCH_MODES } from './instagram.js';

/* Тексты подсказок — из components/Подсказка*.css */
const TIP_FOLDERS =
  'При включении этого режима ReferenceSync сначала даст список доступных ' +
  'досок, коллекций и разделов. Выберите нужные коллекции и нажмите ' +
  '"Продолжить". После этого выбранный режим поиска будет применён только ' +
  'к содержимому отмеченных коллекций. Если режим выключен, поиск ' +
  'выполняется по общему списку всех сохранённых публикаций.';

const TIP_SPEED =
  'Влияет на скорость поиска и скачивания файлов. При количестве >1000 ' +
  'файлов рекомендуется выбирать безопасный режим иначе есть шанс ' +
  'срабатывания защиты от спама';

const TIP_ACCOUNT =
  'Имя пользователя Instagram без символа @. Используется вход, уже ' +
  'выполненный в выбранном браузере — пароль не запрашивается и не хранится.';

const TIP_BROWSER =
  'ReferenceSync читает cookies выбранного браузера. В нём должен быть ' +
  'выполнен вход в Instagram. Браузер лучше закрыть перед поиском.';

const TIP_NUMBERING =
  'К имени файла добавляется сквозной номер. Он задаёт порядок публикаций ' +
  'в Eagle, поэтому нумерация продолжается между запусками.';

const TIP_DESCRIPTION =
  'Описание из публикации переносится в поле «Аннотация» Eagle. ' +
  'Дополнительный текст добавляется ко всем выбранным публикациям.';

/* Соцсети: instagram и pinterest — рабочие, остальные заготовки */
const PLATFORMS = [
  { id: 'instagram', title: 'Instagram', icon: 'instagram', ready: true },
  { id: 'pinterest', title: 'Pinterest', icon: 'pinterest', ready: false },
  { id: 'dribbble', title: 'Dribbble', icon: 'dribbble', ready: false },
  { id: 'behance', title: 'Behance', icon: 'behance', ready: false },
  { id: 'vimeo', title: 'Vimeo', icon: 'vimeo', ready: false },
  { id: 'x', title: 'X', icon: 'x', ready: false },
  { id: 'layers', title: 'Layers.to', icon: 'layers', ready: false },
];

const LANGUAGES = ['EN', 'FR', 'РУ', '中文', 'ES'];

/* Загруженные SVG иконки: name → разметка */
let iconCache = {};

export async function loadIcons() {
  const names = PLATFORMS.map((item) => item.icon);
  await Promise.all(names.map(async (name) => {
    try {
      const response = await fetch(`assets/icons/${name}.svg`);
      iconCache[name] = await response.text();
    } catch (_) {
      iconCache[name] = '';
    }
  }));
}

/* ============================================================
   Кнопка верхнего меню
   ============================================================ */
export function buildTitlebar({ onClose }) {
  const root = el('div', 'rs-titlebar');
  const close = el('div', 'rs-titlebar__dot rs-titlebar__dot--close');
  close.title = 'Закрыть';
  const min = el('div', 'rs-titlebar__dot rs-titlebar__dot--min');
  min.title = 'Свернуть';
  const max = el('div', 'rs-titlebar__dot rs-titlebar__dot--max');
  max.title = 'Полный экран';

  close.addEventListener('click', () => { if (onClose) onClose(); });
  root.append(close, min, max);
  return root;
}

/* ============================================================
   1 блок — шапка
   ============================================================ */
export function buildHeader({ version = 'Beta v.1.2', onLanguage }) {
  const root = el('div', 'rs-header');

  const left = el('div', 'rs-header__left');
  left.append(
    el('div', 'rs-header__title', 'ReferenceSync'),
    el('div', 'rs-header__subtitle',
      'Сохраняйте референсы из социальных сетей в Eagle'),
  );

  const right = el('div', 'rs-header__right');
  right.appendChild(el('div', 'rs-header__version', version));

  const lang = el('div', 'rs-lang');
  LANGUAGES.forEach((code) => {
    const item = el('button', 'rs-lang__item', code);
    if (code === 'РУ') item.classList.add('is-active');
    item.addEventListener('click', () => {
      lang.querySelectorAll('.rs-lang__item')
        .forEach((node) => node.classList.remove('is-active'));
      item.classList.add('is-active');
      if (onLanguage) onLanguage(code);
    });
    lang.appendChild(item);
  });
  right.appendChild(lang);

  root.append(left, right);
  return root;
}

/* ============================================================
   2 блок — переключатели соцсетей
   ============================================================ */
export function buildSocial({ onSelect }) {
  const root = el('div', 'rs-social');
  const list = el('div', 'rs-social__list');

  const buttons = new Map();
  PLATFORMS.forEach((platform) => {
    const button = createSocialButton({
      icon: iconCache[platform.icon],
      title: platform.ready ? platform.title
        : `${platform.title} — подключим позже`,
      active: platform.id === state.settings.platform,
      locked: !platform.ready,
      onClick: () => {
        buttons.forEach((entry, id) => entry.setActive(id === platform.id));
        value.textContent = platform.title;
        if (onSelect) onSelect(platform.id);
      },
    });
    buttons.set(platform.id, button);
    list.appendChild(button.node);
  });

  const meta = el('div', 'rs-social__meta');
  const value = el('div', 'rs-social__value',
    PLATFORMS.find((p) => p.id === state.settings.platform)?.title || 'Instagram');
  meta.append(el('div', 'rs-social__caption', 'Выбранная соц. сеть'), value);

  root.append(list, meta);
  return root;
}

/* ============================================================
   3 блок — настройки поиска (шаг 1 и шаг 2)
   ============================================================ */
export function buildSettings({ onChange, onFolderSearch }) {
  const root = el('div', 'rs-panel');
  const body = el('div', 'rs-panel__body rs-scroll');

  const s = state.settings;

  /* ---------- Шаг 1: выбор источника ---------- */
  const step1 = el('div', 'rs-step');
  step1.appendChild(el('div', 'rs-step__title', 'Шаг 1 — выбор анализа'));

  const sourceGroup = createRadioGroup([
    { value: 'browser', label: 'Через авторизованный браузер' },
    { value: 'meta', label: 'Из архива Meta' },
  ], {
    value: s.source,
    onChange: (value) => {
      setSetting('source', value);
      browserBlock.style.display = value === 'browser' ? '' : 'none';
      metaHint.style.display = value === 'meta' ? '' : 'none';
      if (onChange) onChange('source', value);
    },
  });

  const sourceList = el('div', 'rs-step__group');
  sourceList.append(
    sourceGroup.rowOf('browser'),
    sourceGroup.rowOf('meta'),
  );
  step1.appendChild(sourceList);

  const metaHint = el('div', 'rs-hint',
    'Интерфейс готов. Разбор архива Meta подключим следующим этапом.');
  metaHint.style.display = s.source === 'meta' ? '' : 'none';
  step1.appendChild(metaHint);

  /* ---------- Настройки браузера ---------- */
  const browserBlock = el('div', 'rs-step');
  browserBlock.style.display = s.source === 'browser' ? '' : 'none';

  /* Instagram-аккаунт */
  const accountRow = el('div', 'rs-step__row');
  const accountLabel = el('div', 'rs-field-label');
  accountLabel.append(
    el('span', null, 'Instagram-аккаунт'),
    createInfo(TIP_ACCOUNT).node,
  );
  const accountField = createField({
    value: s.username,
    placeholder: 'имя пользователя',
    at: true,
    onCommit: (value) => {
      const clean = value.trim().replace(/^@/, '');
      accountField.set(clean);
      setSetting('username', clean);
      if (onChange) onChange('username', clean);
    },
  });
  accountRow.append(accountLabel, accountField.node);

  /* Браузер */
  const browserRow = el('div', 'rs-step__row');
  const browserLabel = el('div', 'rs-field-label');
  browserLabel.append(
    el('span', null, 'Браузер с выполненным входом'),
    createInfo(TIP_BROWSER).node,
  );
  const browserSelect = createSelect({
    options: [
      { value: 'chrome', label: 'Google Chrome' },
      { value: 'yandex', label: 'Яндекс.Браузер' },
      { value: 'safari', label: 'Safari' },
      { value: 'firefox', label: 'Firefox' },
      { value: 'edge', label: 'Microsoft Edge' },
    ],
    value: s.browser,
    onChange: (value) => {
      setSetting('browser', value);
      if (onChange) onChange('browser', value);
    },
  });
  browserRow.append(browserLabel, browserSelect.node);
  const browserHint = el('div', 'rs-hint',
    'ReferenceSync использует существующий вход в браузере. ' +
    'Пароль Instagram не запрашивается.');

  /* Скорость загрузки */
  const speedRow = el('div', 'rs-step__row');
  const speedLabel = el('div', 'rs-field-label');
  speedLabel.append(
    el('span', null, 'Скорость загрузки'),
    createInfo(TIP_SPEED).node,
  );
  const speedSelect = createSelect({
    options: [
      { value: 'safe', label: 'Безопасная — медленнее, меньше риск блокировки' },
      { value: 'balanced', label: 'Сбалансированная — немного быстрее' },
    ],
    value: s.speed,
    onChange: (value) => {
      setSetting('speed', value);
      if (onChange) onChange('speed', value);
    },
  });
  speedRow.append(speedLabel, speedSelect.node);

  browserBlock.append(accountRow, browserRow, browserHint, speedRow);

  /* ---------- Шаг 2: тип поиска ---------- */
  const step2 = el('div', 'rs-step');
  step2.appendChild(el('div', 'rs-step__title', 'Шаг 2 — тип поиска'));

  const recentSpinner = createSpinner({
    value: s.recentLimit,
    min: 1,
    max: 500,
    onChange: (value) => {
      setSetting('recentLimit', value);
      if (onChange) onChange('recentLimit', value);
    },
  });

  const modeGroup = createRadioGroup([
    { value: SEARCH_MODES.SMART, label: 'Найти только новые' },
    { value: SEARCH_MODES.FULL, label: 'Проверить все сохранённые' },
    { value: SEARCH_MODES.RECENT, label: 'Проверить только последние' },
  ], {
    value: s.searchMode,
    onChange: (value) => {
      setSetting('searchMode', value);
      recentSpinner.setDisabled(value !== SEARCH_MODES.RECENT);
      if (onChange) onChange('searchMode', value);
    },
  });

  const modes = el('div', 'rs-step__group');

  const modeSmart = el('div', 'rs-mode');
  modeSmart.append(
    modeGroup.rowOf(SEARCH_MODES.SMART),
    el('div', 'rs-hint',
      'Основной режим. Программа идёт от новых публикаций к старым ' +
      'и ищет границу предыдущей синхронизации.'),
  );

  const modeFull = el('div', 'rs-mode');
  modeFull.append(
    modeGroup.rowOf(SEARCH_MODES.FULL),
    el('div', 'rs-hint',
      'Полный анализ всего раздела Saved без ограничения по количеству. ' +
      'Подходит для первого переноса.'),
  );

  const modeRecent = el('div', 'rs-mode');
  const recentHead = el('div', 'rs-mode__head');
  const recentSpinnerBox = el('div', 'rs-mode__spinner');
  recentSpinnerBox.appendChild(recentSpinner.node);
  recentHead.append(modeGroup.rowOf(SEARCH_MODES.RECENT), recentSpinnerBox);
  modeRecent.append(
    recentHead,
    el('div', 'rs-hint',
      'Дополнительный режим для быстрой проверки или тестирования.'),
  );
  recentSpinner.setDisabled(s.searchMode !== SEARCH_MODES.RECENT);

  modes.append(modeSmart, modeFull, modeRecent);
  step2.appendChild(modes);

  /* Тумблер «Искать в выбранных папках» */
  const folderSwitch = createSwitch({
    checked: s.folderSearch,
    label: 'Искать в выбранных папках',
    onChange: (value) => {
      setSetting('folderSearch', value);
      if (value && onFolderSearch) onFolderSearch();
      if (onChange) onChange('folderSearch', value);
    },
  });
  const folderRow = el('div', 'rs-switch-row');
  folderRow.append(
    folderSwitch.node,
    folderSwitch.labelNode,
    createInfo(TIP_FOLDERS, { accent: true }).node,
  );
  step2.appendChild(folderRow);

  /* ---------- Дополнительные фильтры ---------- */
  const step3 = el('div', 'rs-step');

  const filtersBody = el('div', 'rs-step__group');
  filtersBody.style.display = s.extraFilters ? '' : 'none';

  const filterSwitch = createSwitch({
    checked: s.extraFilters,
    label: 'Дополнительные фильтры',
    onChange: (value) => {
      setSetting('extraFilters', value);
      filtersBody.style.display = value ? '' : 'none';
      if (onChange) onChange('extraFilters', value);
    },
  });
  const filterRow = el('div', 'rs-switch-row');
  filterRow.append(filterSwitch.node, filterSwitch.labelNode);
  step3.appendChild(filterRow);

  /* Фильтрация файлов */
  step3.appendChild(filtersBody);
  filtersBody.appendChild(el('div', 'rs-step__title', 'Фильтрация файлов'));

  const typeRow = el('div', 'rs-filter-row');
  [
    ['filterPhoto', 'Фотографии'],
    ['filterVideo', 'Видео'],
    ['filterCarousel', 'Карусели'],
  ].forEach(([key, label]) => {
    const box = createCheckbox({
      checked: s[key],
      label,
      onChange: (value) => {
        setSetting(key, value);
        if (onChange) onChange(key, value);
      },
    });
    typeRow.appendChild(box.row);
  });
  filtersBody.appendChild(typeRow);

  /* Фильтрация авторов */
  filtersBody.appendChild(el('div', 'rs-step__title', 'Фильтрация авторов'));

  const includeRow = el('div', 'rs-step__row');
  includeRow.append(
    el('div', 'rs-field-label', 'Только эти авторы:'),
    createField({
      value: s.authorInclude,
      placeholder: 'через запятую',
      at: true,
      onCommit: (value) => {
        setSetting('authorInclude', value);
        if (onChange) onChange('authorInclude', value);
      },
    }).node,
  );

  const excludeRow = el('div', 'rs-step__row');
  excludeRow.append(
    el('div', 'rs-field-label', 'Исключить авторов:'),
    createField({
      value: s.authorExclude,
      placeholder: 'через запятую',
      at: true,
      onCommit: (value) => {
        setSetting('authorExclude', value);
        if (onChange) onChange('authorExclude', value);
      },
    }).node,
  );
  filtersBody.append(includeRow, excludeRow);

  body.append(
    step1,
    browserBlock,
    el('div', 'rs-divider'),
    step2,
    el('div', 'rs-divider'),
    step3,
  );
  root.appendChild(body);

  return {
    node: root,
    setUsername(value) { accountField.set(value); },
  };
}

/* ============================================================
   4 блок — статус
   ============================================================ */
export function buildStatus() {
  const root = el('div', 'rs-status');
  const text = el('div', 'rs-status__text', 'Готов к работе');
  const hint = el('div', 'rs-status__hint', 'Заполните шаг 1 и нажмите «Начать поиск»');
  root.append(text, hint);

  return {
    node: root,
    set(message, hintMessage, busy = false) {
      text.textContent = message;
      if (hintMessage !== undefined && hintMessage !== null) {
        hint.textContent = hintMessage;
      }
      root.classList.toggle('is-busy', Boolean(busy));
    },
  };
}

/* ============================================================
   5 блок — таблица результатов
   ============================================================ */
export function buildResults({ onClear, onToggleAll, onThumbnails, onRowToggle,
  onEdit, onResetAll }) {
  const root = el('div', 'rs-results');

  /* Шапка */
  const head = el('div', 'rs-results__head');

  const titleRow = el('div', 'rs-results__title-row');
  const title = el('div', 'rs-results__title', 'Найденные публикации');
  const clearButton = createGhostButton({
    label: 'Очистить список',
    onClick: () => { if (onClear) onClear(); },
  });
  const resetAllButton = createGhostButton({
    label: 'Сбросить правки',
    onClick: () => { if (onResetAll) onResetAll(); },
  });
  resetAllButton.node.style.display = 'none';

  const titleActions = el('div', 'rs-social__list');
  titleActions.append(resetAllButton.node, clearButton.node);
  titleRow.append(title, titleActions);

  /* Настройки: миниатюры + выбрать всё */
  const tools = el('div', 'rs-results__tools');

  const thumbSwitch = createSwitch({
    checked: state.settings.thumbnails,
    label: 'Миниатюры',
    onChange: (value) => {
      setSetting('thumbnails', value);
      if (onThumbnails) onThumbnails(value);
    },
  });
  const thumbRow = el('div', 'rs-switch-row');
  thumbRow.append(thumbSwitch.node, thumbSwitch.labelNode);

  const selectAll = createCheckbox({
    checked: false,
    label: 'Выбрать всё',
    onChange: (value) => { if (onToggleAll) onToggleAll(value); },
  });

  tools.append(thumbRow, selectAll.row);
  head.append(titleRow, tools);

  /* Таблица */
  const table = el('div', 'rs-table');

  const header = el('div', 'rs-table__header');
  const headerGrid = el('div', 'rs-table__grid');
  ['', 'Автор', 'Тип', 'Структура', 'Название в Eagle', 'Описание в Eagle']
    .forEach((label) => headerGrid.appendChild(el('div', 'rs-table__col', label)));
  header.appendChild(headerGrid);

  const body = el('div', 'rs-table__body rs-scroll');
  table.append(header, body);

  root.append(head, table);

  return {
    node: root,
    body,
    title,
    selectAll,
    clearButton,
    resetAllButton,
    setTitle(count, total) {
      title.textContent = total
        ? `Найденные публикации — ${count} из ${total}`
        : 'Найденные публикации';
    },
  };
}

/* ============================================================
   6 блок — нумерация и описание
   ============================================================ */
export function buildNaming({ onChange }) {
  const root = el('div', 'rs-naming');
  const body = el('div', 'rs-naming__body rs-scroll');
  const s = state.settings;

  body.appendChild(el('div', 'rs-naming__title', 'Нумерация и описание'));

  /* ---------- Тумблер нумерации ---------- */
  const numberingSwitch = createSwitch({
    checked: s.numberingEnabled,
    label: 'Использовать нумерацию',
    onChange: (value) => {
      setSetting('numberingEnabled', value);
      numberingGrid.style.display = value ? '' : 'none';
      if (onChange) onChange();
    },
  });
  const numberingRow = el('div', 'rs-switch-row');
  numberingRow.append(
    numberingSwitch.node,
    numberingSwitch.labelNode,
    createInfo(TIP_NUMBERING).node,
  );
  body.appendChild(numberingRow);

  /* ---------- Настройки нумерации ---------- */
  const numberingGrid = el('div', 'rs-naming__grid');
  numberingGrid.style.display = s.numberingEnabled ? '' : 'none';

  const cell = (label, control) => {
    const box = el('div', 'rs-naming__cell');
    box.append(el('div', 'rs-naming__label', label), control);
    return box;
  };

  const destinationSelect = createSelect({
    options: [
      { value: 'name', label: 'Название' },
      { value: 'description', label: 'Описание' },
      { value: 'both', label: 'Название и описание' },
    ],
    value: s.numberingDestination,
    onChange: (value) => {
      setSetting('numberingDestination', value);
      if (onChange) onChange();
    },
  });

  const markerField = createField({
    value: s.numberingMarker,
    placeholder: 'instpoporder-',
    onCommit: (value) => {
      setSetting('numberingMarker', value);
      if (onChange) onChange();
    },
  });

  const startSpinner = createSpinner({
    value: s.numberingStart,
    min: 1,
    width: 110,
    onChange: (value) => {
      setSetting('numberingStart', value);
      if (onChange) onChange();
    },
  });

  const counterOne = createSelect({
    options: [
      { value: 'global', label: 'Общий номер публикации' },
      { value: 'batch', label: 'Номер в текущей загрузке' },
      { value: 'author', label: 'Номер публикации автора' },
      { value: 'type', label: 'Номер публикации этого типа' },
    ],
    value: s.counterOne,
    onChange: (value) => setSetting('counterOne', value),
  });

  const counterTwo = createSelect({
    options: [
      { value: 'carousel', label: 'Номер элемента карусели' },
      { value: 'none', label: 'Не использовать' },
      { value: 'author', label: 'Номер публикации автора' },
      { value: 'type', label: 'Номер публикации этого типа' },
    ],
    value: s.counterTwo,
    onChange: (value) => setSetting('counterTwo', value),
  });

  numberingGrid.append(
    cell('Добавлять в:', destinationSelect.node),
    cell('Текст перед номером:', markerField.node),
    cell('Начальная цифра нумерации:', startSpinner.node),
    cell('Первое число:', counterOne.node),
    cell('Второе число:', counterTwo.node),
  );
  body.appendChild(numberingGrid);

  body.appendChild(el('div', 'rs-divider'));

  /* ---------- Тумблер описания ---------- */
  const descriptionSwitch = createSwitch({
    checked: s.descriptionEnabled,
    label: 'Добавить описание',
    onChange: (value) => {
      setSetting('descriptionEnabled', value);
      descriptionGrid.style.display = value ? '' : 'none';
      if (onChange) onChange();
    },
  });
  const descriptionRow = el('div', 'rs-switch-row');
  descriptionRow.append(
    descriptionSwitch.node,
    descriptionSwitch.labelNode,
    createInfo(TIP_DESCRIPTION).node,
  );
  body.appendChild(descriptionRow);

  const descriptionGrid = el('div', 'rs-naming__grid');
  descriptionGrid.style.display = s.descriptionEnabled ? '' : 'none';

  const descriptionDestination = createSelect({
    options: [
      { value: 'description', label: 'Описание' },
      { value: 'name', label: 'Название' },
      { value: 'both', label: 'Название и описание' },
    ],
    value: s.descriptionDestination,
    onChange: (value) => {
      setSetting('descriptionDestination', value);
      if (onChange) onChange();
    },
  });

  const placementGroup = createRadioGroup([
    { value: 'start', label: 'Начало списка' },
    { value: 'end', label: 'Конец списка' },
  ], {
    value: s.descriptionPlacement,
    onChange: (value) => {
      setSetting('descriptionPlacement', value);
      if (onChange) onChange();
    },
  });
  const placementBox = el('div', 'rs-filter-row');
  placementBox.append(
    placementGroup.rowOf('start'),
    placementGroup.rowOf('end'),
  );

  const extraField = createField({
    value: s.extraDescription,
    placeholder: 'Необязательный текст для выбранных публикаций',
    onCommit: (value) => {
      setSetting('extraDescription', value);
      if (onChange) onChange();
    },
  });

  descriptionGrid.append(
    cell('Добавлять в:', descriptionDestination.node),
    cell('Куда добавлять?', placementBox),
    cell('Дополнительное описание:', extraField.node),
  );
  body.appendChild(descriptionGrid);

  root.appendChild(body);
  return { node: root };
}

/* ============================================================
   Нижняя полоса: журнал + кнопка действия
   ============================================================ */
export function buildFooter({ onLog, onAction }) {
  const root = el('div', 'rs-footer');

  const left = el('div', 'rs-footer__left');
  const logButton = createButton({
    label: 'Показать технический журнал',
    onClick: () => { if (onLog) onLog(); },
  });
  left.appendChild(logButton.node);

  const right = el('div', 'rs-footer__right');
  const action = createGlassButton({
    label: 'Начать поиск',
    onClick: () => { if (onAction) onAction(); },
  });
  const actionBox = el('div', 'rs-footer__action');
  actionBox.appendChild(action.node);
  right.appendChild(actionBox);

  root.append(left, right);
  return { node: root, action, logButton };
}

/* ============================================================
   Журнал
   ============================================================ */
export function buildLog() {
  const root = el('div', 'rs-log');
  const list = el('div', 'rs-log__list rs-scroll');
  root.appendChild(list);

  return {
    node: root,
    add(message, kind = '') {
      const time = new Date().toLocaleTimeString('ru-RU');
      const line = el('div',
        `rs-log__line${kind ? ` rs-log__line--${kind}` : ''}`,
        `[${time}] ${message}`);
      list.appendChild(line);
      list.scrollTop = list.scrollHeight;
      /* Не даём журналу расти бесконечно */
      while (list.childElementCount > 500) list.removeChild(list.firstChild);
    },
    toggle() { root.classList.toggle('is-open'); return root.classList.contains('is-open'); },
    clear() { clear(list); },
  };
}

/* ============================================================
   Модальное окно выбора коллекций
   ============================================================ */
export function buildCollectionModal({ onConfirm, onCancel }) {
  const root = el('div', 'rs-modal');
  const box = el('div', 'rs-modal__box');
  const title = el('div', 'rs-modal__title', 'Выберите коллекции');
  const list = el('div', 'rs-modal__list rs-scroll');
  const foot = el('div', 'rs-modal__foot');

  const cancel = createGhostButton({
    label: 'Отмена',
    onClick: () => { if (onCancel) onCancel(); },
  });
  const confirm = createGhostButton({
    label: 'Продолжить',
    onClick: () => { if (onConfirm) onConfirm(); },
  });

  foot.append(cancel.node, confirm.node);
  box.append(title, list, foot);
  root.appendChild(box);

  return { node: root, list, title, confirm };
}
