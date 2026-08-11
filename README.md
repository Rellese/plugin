# ReferenceSync — плагин Eagle

Перенос приложения с Python (PyQt) на JavaScript в виде плагина Eagle,
с чистовым дизайном из Figma.

## Установка

1. Eagle → **Плагины** → **Панель разработчика** → **Импортировать локальный проект**
2. Указать папку `plugin/`
3. Открыть плагин из списка

### Требуется gallery-dl

Движок добычи данных тот же, что в Python-версии:

```bash
pip install gallery-dl
```

Плагин ищет `gallery-dl` в `PATH`, а также в `/opt/homebrew/bin`,
`/usr/local/bin`, `~/.local/bin`.

## Что работает

**Дизайн** — перенесён из `docs/design/`:
- все 6 блоков экрана с геометрией Figma;
- компоненты со всеми состояниями (enable / hovered / pressed / disable):
  свитч, чекбокс, радио, поле ввода, спиннер со степперами, Info-подсказки,
  кнопка поиска и кнопки соцсетей со слоями свечения, кнопка правки, языки;
- 7 SVG-иконок соцсетей, извлечённых из исходного спрайта;
- шрифты IBM Plex Mono, Manrope, CommitMono.

**Сценарий Instagram**:
- поиск сохранённых публикаций через `gallery-dl --cookies-from-browser`
  (пароль не запрашивается и не хранится);
- три режима: «только новые», «все сохранённые», «последние N»;
- профили скорости safe / balanced (`--sleep-request`);
- нормализация постов, определение карусели/видео, превью наименьшего размера;
- таблица результатов: выбор строк, миниатюры, правка имени и описания
  на месте, Undo/Redo по Cmd/Ctrl+Z, сброс правок;
- генерация имён и нумерация (`instpoporder-N` / `instpoporder-N-K`),
  включая выбор «Название / Описание / Название и описание»;
- скачивание во временную папку `~/.reference-sync/staging/`;
- импорт в Eagle по одному элементу в хронологическом порядке
  (через API плагина, с запасным вариантом `localhost:41595`);
- технический журнал с сокрытием sessionid / csrftoken.

## Структура

```
plugin/
├── manifest.json
├── index.html
├── js/
│   ├── main.js          сборка экрана, сценарий, таблица
│   ├── panels.js         6 блоков интерфейса
│   ├── ui.js             компоненты со состояниями
│   ├── state.js          настройки, правки, Undo/Redo
│   ├── instagram.js      discover / normalize / download
│   ├── eagle-import.js   импорт и генерация имён
│   └── node-bridge.js    доступ к Node.js внутри Eagle
├── styles/
│   ├── tokens.css        цвета, градиенты, тени, шрифты
│   ├── components.css    компоненты и их состояния
│   └── screen.css        раскладка экрана
└── assets/  fonts, icons, logo.png
```

## Соответствие Python-модулям

| JavaScript | Python |
|---|---|
| `instagram.js → discoverSaved` | `app/instagram_discover.py` |
| `instagram.js → normalizePost` | `app/instagram_normalize.py` |
| `instagram.js → downloadPosts` | `app/instagram_download_staging.py` |
| `instagram.js → browserCookieSpec` | `app/browser_cookie_source.py` |
| `eagle-import.js → importToEagle` | `app/eagle_import_staging.py` |
| `eagle-import.js → buildNames` | `reference_sync_gui.refresh_generated_names` |

## Не реализовано

- Разбор архива Meta (интерфейс есть, парсера нет).
- Список конкретных коллекций Instagram: пока доступна только общая лента
  (`ALL_MEDIA_AUTO_COLLECTION`). Нужен запрос к
  `instagram.com/api/v1/collections/list/`.
- Pinterest и остальные соцсети — кнопки заблокированы.
- Анимированный сегментный прогресс поиска и импорта.
- Дерево папок Eagle при импорте (`eagle_folder_mapper.py`).
- Конструктор дополнительных счётчиков («Первое/второе число» пока
  влияют только на настройки, применяется сквозная нумерация).
- Локализация: интерфейс на русском, переключатель языков не переводит.
- Виртуализация таблицы для 2000+ строк.

## Проверка дизайна без Eagle

```bash
npx http-server plugin -p 3000
```

В браузере поиск и импорт недоступны (нет Node.js API), но виден весь
дизайн. Наполнить таблицу тестовыми данными: `window.__rs.setPosts([...])`.
