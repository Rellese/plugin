/* ============================================================
   ReferenceSync — движок Instagram

   Перенос с Python:
     app/instagram_discover.py         → discoverSaved()
     app/instagram_normalize.py        → normalizePost()
     app/instagram_download_staging.py → downloadPosts()
     app/browser_cookie_source.py      → browserCookieSpec()

   Как в Python-версии, добычей данных занимается gallery-dl:
   плагин вызывает его как внешний процесс и разбирает
   --dump-json. Cookies берутся из браузера, где выполнен вход
   (--cookies-from-browser), пароль Instagram нигде не хранится.
   ============================================================ */

import {
  nodeApi,
  runCommand,
  whichExecutable,
  ensureDir,
  workRoot,
} from './node-bridge.js';

const IMAGE_EXTENSIONS = new Set(
  ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'],
);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v']);

/* Режимы поиска — совпадают с Python (recent / smart / full) */
export const SEARCH_MODES = {
  SMART: 'smart',
  FULL: 'full',
  RECENT: 'recent',
};

/* Профили скорости — app/instagram_download_staging.py */
const SPEED_PROFILES = {
  safe: { sleepRequest: '2.0-4.0', retries: 3 },
  balanced: { sleepRequest: '1.0-2.0', retries: 2 },
};

/* ------------------------------------------------------------
   Cookies из браузера. Перенос browser_cookie_source.py:
   Яндекс.Браузер выдаётся gallery-dl как chromium-профиль,
   потому что напрямую он не поддерживается.
   ------------------------------------------------------------ */
export function browserCookieSpec(browser) {
  const name = String(browser || '').trim().toLowerCase();

  const aliases = {
    'google chrome': 'chrome',
    'google-chrome': 'chrome',
    'яндекс': 'yandex',
    'яндекс.браузер': 'yandex',
    'yandex browser': 'yandex',
  };
  const normalized = aliases[name] || name;

  if (normalized !== 'yandex') return normalized;

  const profile = findYandexProfile();
  return profile ? `chrome:${profile}` : 'chrome';
}

function findYandexProfile() {
  if (!nodeApi.available) return null;
  const { fs, path, os } = nodeApi;

  let root;
  if (process.platform === 'darwin') {
    root = path.join(os.homedir(), 'Library', 'Application Support',
      'Yandex', 'YandexBrowser');
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) return null;
    root = path.join(localAppData, 'Yandex', 'YandexBrowser', 'User Data');
  } else {
    root = path.join(os.homedir(), '.config', 'yandex-browser');
  }

  if (!fs.existsSync(root)) return null;

  const hasCookies = (dir) =>
    fs.existsSync(path.join(dir, 'Cookies')) ||
    fs.existsSync(path.join(dir, 'Network', 'Cookies'));

  const candidates = [];
  const defaultProfile = path.join(root, 'Default');
  if (fs.existsSync(defaultProfile)) candidates.push(defaultProfile);

  try {
    fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory() || entry.name === 'Default') return;
      const dir = path.join(root, entry.name);
      if (entry.name.startsWith('Profile ') ||
          fs.existsSync(path.join(dir, 'Preferences'))) {
        candidates.push(dir);
      }
    });
  } catch (_) { /* каталог недоступен */ }

  const withCookies = candidates.filter(hasCookies);
  if (!withCookies.length) return null;

  /* Берём профиль с самой свежей базой cookies */
  return withCookies
    .map((dir) => {
      let mtime = 0;
      [path.join(dir, 'Cookies'), path.join(dir, 'Network', 'Cookies')]
        .forEach((file) => {
          try { mtime = Math.max(mtime, fs.statSync(file).mtimeMs); }
          catch (_) { /* нет файла */ }
        });
      return { dir, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].dir;
}

/* ------------------------------------------------------------
   Разбор потока JSON от gallery-dl.
   Перенос parse_json_stream() + collect_metadata():
   вывод может быть одним документом, потоком значений или JSONL.
   ------------------------------------------------------------ */
export function parseJsonStream(text) {
  const values = [];
  let position = 0;

  while (position < text.length) {
    while (position < text.length && /\s/.test(text[position])) position += 1;
    if (position >= text.length) break;

    const char = text[position];
    if (char !== '{' && char !== '[') {
      const newline = text.indexOf('\n', position);
      if (newline === -1) break;
      position = newline + 1;
      continue;
    }

    const end = matchBracket(text, position);
    if (end === -1) break;

    try {
      values.push(JSON.parse(text.slice(position, end + 1)));
    } catch (_) { /* повреждённый фрагмент пропускаем */ }
    position = end + 1;
  }

  return values;
}

/* Поиск закрывающей скобки с учётом строк и экранирования */
function matchBracket(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/* Рекурсивно собирает записи постов из любой вложенности */
export function collectPostRecords(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectPostRecords(child, output));
    return output;
  }
  if (value && typeof value === 'object') {
    const hasId = value.post_id || value.post_shortcode ||
      value.shortcode || value.pk;
    if (hasId) output.push(value);
    Object.values(value).forEach((child) => collectPostRecords(child, output));
  }
  return output;
}

/* ------------------------------------------------------------
   Нормализация. Перенос instagram_normalize.py
   ------------------------------------------------------------ */
function textValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const result = String(value).trim();
    if (result) return result;
  }
  return '';
}

function mediaTypeOf(component) {
  const declared = textValue(component.media_type, component.type).toLowerCase();
  if (declared.includes('video')) return 'video';
  if (declared.includes('image') || declared.includes('photo')) return 'image';

  const extension = textValue(component.extension).toLowerCase().replace(/^\./, '');
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  return 'unknown';
}

export function canonicalUrl(postId, shortcode, url) {
  const normalized = textValue(url);
  if (normalized) return `${normalized.replace(/\/+$/, '')}/`;
  if (shortcode) return `https://www.instagram.com/p/${shortcode}/`;
  return `https://www.instagram.com/p/id:${postId}/`;
}

/* Достаёт самый маленький превью-кадр из метаданных Instagram.
   Перенос gallery_dl_extractors/instagram_small_preview.py —
   превью не скачивается отдельно, берётся уже готовый URL. */
function smallestPreview(record) {
  const versions = record.image_versions2;
  const candidates = versions?.candidates;
  if (!Array.isArray(candidates)) {
    return textValue(record.preview_url, record.display_url, record.thumbnail);
  }

  const valid = candidates
    .filter((item) => item && item.url && item.width > 0 && item.height > 0)
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));

  return valid.length ? valid[0].url
    : textValue(record.preview_url, record.display_url);
}

/* Собирает компоненты карусели */
function normalizeComponents(record, postId) {
  let raw = record.component_items;
  if (!Array.isArray(raw)) raw = record.components;

  /* Карусель Instagram приходит как carousel_media */
  if (!Array.isArray(raw) && Array.isArray(record.carousel_media)) {
    raw = record.carousel_media.map((item, index) => ({
      media_id: textValue(item.id, item.pk, `${postId}:${index + 1}`),
      component_index: index + 1,
      media_type: item.video_versions ? 'video' : 'image',
      extension: item.video_versions ? 'mp4' : 'jpg',
      preview_url: smallestPreview(item),
      source_url: item.video_versions?.[0]?.url ||
        item.image_versions2?.candidates?.[0]?.url,
    }));
  }

  const mediaIds = Array.isArray(record.media_ids) ? record.media_ids : [];

  if (!Array.isArray(raw) || !raw.length) {
    if (mediaIds.length) {
      raw = mediaIds.map((mediaId, index) => ({
        media_id: mediaId,
        component_index: index + 1,
      }));
    } else {
      /* Одиночная публикация */
      raw = [{
        media_id: textValue(record.media_id, record.pk, `${postId}:1`),
        component_index: 1,
        media_type: record.video_versions || record.video_url ? 'video' : 'image',
        extension: textValue(record.extension) ||
          (record.video_versions || record.video_url ? 'mp4' : 'jpg'),
        preview_url: smallestPreview(record),
        source_url: textValue(
          record.video_versions?.[0]?.url,
          record.video_url,
          record.display_url,
          record.url,
        ),
      }];
    }
  }

  const seen = new Set();
  const normalized = [];

  raw.forEach((component, fallbackIndex) => {
    if (!component || typeof component !== 'object') return;

    const index = Number.parseInt(component.component_index, 10) > 0
      ? Number.parseInt(component.component_index, 10)
      : fallbackIndex + 1;

    const mediaId = textValue(
      component.media_id,
      mediaIds[index - 1],
      `${postId}:${index}`,
    );

    const identity = `${mediaId}#${index}`;
    if (seen.has(identity)) return;
    seen.add(identity);

    const extension = textValue(component.extension)
      .toLowerCase().replace(/^\./, '') || null;

    normalized.push({
      sourceMediaId: mediaId,
      index,
      mediaType: mediaTypeOf(component),
      url: textValue(component.source_url, component.preview_url, component.url) || null,
      previewUrl: textValue(component.preview_url, component.url) || null,
      extension,
      width: component.preview_width ?? component.width ?? null,
      height: component.preview_height ?? component.height ?? null,
    });
  });

  normalized.sort((a, b) => a.index - b.index ||
    String(a.sourceMediaId).localeCompare(String(b.sourceMediaId)));

  return normalized;
}

/* Итоговая нормализованная публикация для интерфейса */
export function normalizePost(record, options = {}) {
  const {
    accountUsername = '',
    collectionId = 'saved',
    collectionName = 'Saved',
  } = options;

  const postId = textValue(
    record.post_id, record.external_id, record.pk, record.id,
  );
  if (!postId) return null;

  const username = textValue(
    record.username, record.owner_username,
    record.user?.username, record.owner?.username,
    accountUsername,
  ).replace(/^@/, '');

  const shortcode = textValue(record.post_shortcode, record.shortcode, record.code);
  const url = canonicalUrl(postId, shortcode,
    textValue(record.post_url, record.canonical_url));

  const components = normalizeComponents(record, postId);
  const videoCount = components.filter((item) => item.mediaType === 'video').length;

  /* Тип публикации для таблицы */
  let type = 'Фото';
  if (components.length > 1) type = videoCount ? 'Карусель, видео' : 'Карусель';
  else if (videoCount) type = 'Видео';

  const description = textValue(
    record.description,
    record.caption?.text,
    typeof record.caption === 'string' ? record.caption : '',
    record.title,
  );

  const takenAt = Number(
    record.taken_at ?? record.taken_at_timestamp ?? record.date ?? 0,
  ) || null;

  return {
    postId,
    shortcode,
    url,
    username: username ? `@${username}` : '@unknown',
    plainUsername: username,
    type,
    componentCount: components.length,
    structure: components.length > 1
      ? `${components.length} элем.`
      : '1 элем.',
    components,
    selectedComponents: components.map((item) => item.index),
    description,
    previewUrl: components[0]?.previewUrl || smallestPreview(record) || '',
    takenAt,
    collectionId,
    collectionName,
    containers: [{
      platform: 'instagram',
      kind: 'COLLECTION',
      id: collectionId,
      name: collectionName,
    }],
  };
}

/* ------------------------------------------------------------
   Поиск сохранённых публикаций.
   Перенос instagram_discover.py: тот же набор аргументов
   gallery-dl, включая --simulate --dump-json и --post-range
   только для режима «последние N».
   ------------------------------------------------------------ */
export async function discoverSaved({
  username,
  browser = 'chrome',
  searchMode = SEARCH_MODES.SMART,
  limit = 50,
  speedProfile = 'safe',
  collections = [],
  knownPostIds = new Set(),
  onProgress,
  onLog,
  signal,
} = {}) {
  const cleanUser = String(username || '').trim().replace(/^@/, '');
  if (!cleanUser) throw new Error('Не указан Instagram-аккаунт');
  if (!/^[A-Za-z0-9._]+$/.test(cleanUser)) {
    throw new Error(`Некорректное имя аккаунта: ${cleanUser}`);
  }

  const galleryDl = await whichExecutable(['gallery-dl', 'gallery-dl.exe']);
  if (!galleryDl) {
    throw new Error(
      'gallery-dl не найден. Установите его командой: pip install gallery-dl',
    );
  }

  const cookieSpec = browserCookieSpec(browser);
  const profile = SPEED_PROFILES[speedProfile] || SPEED_PROFILES.safe;

  /* Целевые адреса: общая лента или выбранные коллекции.
     Контракт из docs/CONTEXT.md сохранён. */
  const savedUrl = `https://www.instagram.com/${cleanUser}/saved/all-posts/`;
  const targets = collections.length
    ? collections.map((entry) => ({
      id: entry.id,
      name: entry.name || entry.id,
      url: entry.id === 'ALL_MEDIA_AUTO_COLLECTION'
        ? savedUrl
        : `https://www.instagram.com/${cleanUser}/saved/collection/${entry.id}/`,
    }))
    : [{ id: 'saved', name: 'Saved', url: savedUrl }];

  const posts = [];
  const seenIds = new Set();
  let stoppedEarly = false;

  for (const target of targets) {
    if (signal?.aborted) break;

    const args = [
      '--config-ignore',
      '--no-input',
      '--cookies-from-browser', cookieSpec,
      '--simulate',
      '--dump-json',
      '--retries', String(profile.retries),
      '--http-timeout', '30',
      '--sleep-request', profile.sleepRequest,
    ];

    /* Только режим «последние N» ограничивает выборку.
       smart и full используют курсорную пагинацию gallery-dl. */
    if (searchMode === SEARCH_MODES.RECENT && limit > 0) {
      args.push('--post-range', `1-${limit}`);
    }

    args.push(target.url);

    if (onLog) {
      onLog(`gallery-dl: ${target.name} (${target.url})`);
    }

    let buffer = '';
    let discovered = 0;

    const result = await runCommand(galleryDl, args, {
      signal,
      onStdout: (chunk) => {
        buffer += chunk;
        /* Прогресс по мере поступления записей */
        const matches = chunk.match(/"post_id"|"shortcode"|"pk"/g);
        if (matches && onProgress) {
          discovered += matches.length;
          onProgress({
            stage: 'discover',
            collection: target.name,
            approximate: discovered,
          });
        }
      },
      onStderr: (chunk) => {
        const line = redact(chunk).trim();
        if (line && onLog) onLog(line);
      },
    });

    const records = collectPostRecords(parseJsonStream(buffer));

    for (const record of records) {
      const post = normalizePost(record, {
        accountUsername: cleanUser,
        collectionId: target.id,
        collectionName: target.name,
      });
      if (!post) continue;
      if (seenIds.has(post.postId)) continue;

      /* Режим «только новые»: останавливаемся на первой
         уже известной публикации (перенос smart-логики). */
      if (searchMode === SEARCH_MODES.SMART && knownPostIds.has(post.postId)) {
        stoppedEarly = true;
        break;
      }

      seenIds.add(post.postId);
      posts.push(post);
    }

    if (result.code !== 0 && !posts.length) {
      throw new Error(classifyFailure(result, browser));
    }
    if (stoppedEarly) break;
  }

  /* Хронологический порядок: от старых к новым — так посты
     ложатся в Eagle в правильной последовательности. */
  posts.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));

  return { posts, stoppedEarly, savedUrl };
}

/* Диагностика ошибок. Перенос classify_failure() */
function classifyFailure(result, browser) {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();

  if (text.includes('could not find') && text.includes('cookies')) {
    return `Не удалось прочитать cookies из браузера «${browser}». ` +
      'Убедитесь, что в нём выполнен вход в Instagram.';
  }
  if (text.includes('database is locked') || text.includes('permissionerror')) {
    return `Файл cookies занят браузером «${browser}». Закройте браузер и повторите.`;
  }
  if (text.includes('login required') || text.includes('checkpoint') ||
      text.includes('challenge')) {
    return 'Instagram требует повторный вход. Откройте instagram.com в браузере, ' +
      'войдите в аккаунт и повторите поиск.';
  }
  if (text.includes('429') || text.includes('rate limit')) {
    return 'Instagram ограничил частоту запросов. Подождите и включите ' +
      'безопасный режим скорости.';
  }
  return `gallery-dl завершился с кодом ${result.code}. ` +
    'Подробности в техническом журнале.';
}

/* Убирает секреты из логов. Перенос redact() */
export function redact(text) {
  return String(text)
    .replace(/(sessionid\s*[=:]\s*)[^;\s,"']+/gi, '$1<REDACTED>')
    .replace(/(csrftoken\s*[=:]\s*)[^;\s,"']+/gi, '$1<REDACTED>')
    .replace(/(ds_user_id\s*[=:]\s*)[^;\s,"']+/gi, '$1<REDACTED>');
}

/* ------------------------------------------------------------
   Скачивание выбранных публикаций во временную папку.
   Перенос instagram_download_staging.py: файлы сначала
   складываются на диск, и только потом отдаются в Eagle.
   ------------------------------------------------------------ */
export async function downloadPosts({
  posts,
  browser = 'chrome',
  speedProfile = 'safe',
  onProgress,
  onLog,
  signal,
} = {}) {
  if (!nodeApi.available) {
    throw new Error('Скачивание доступно только внутри Eagle');
  }

  const galleryDl = await whichExecutable(['gallery-dl', 'gallery-dl.exe']);
  if (!galleryDl) throw new Error('gallery-dl не найден');

  const { path, fs } = nodeApi;
  const stagingRoot = ensureDir(path.join(workRoot(), 'staging',
    `job-${Date.now()}`));

  const cookieSpec = browserCookieSpec(browser);
  const profile = SPEED_PROFILES[speedProfile] || SPEED_PROFILES.safe;

  const results = [];

  for (let index = 0; index < posts.length; index += 1) {
    if (signal?.aborted) break;

    const post = posts[index];
    const postDir = ensureDir(path.join(stagingRoot, post.postId));

    if (onProgress) {
      onProgress({
        stage: 'download',
        current: index + 1,
        total: posts.length,
        post,
      });
    }

    const args = [
      '--config-ignore',
      '--no-input',
      '--cookies-from-browser', cookieSpec,
      '--retries', String(profile.retries),
      '--http-timeout', '60',
      '--sleep-request', profile.sleepRequest,
      '--dest', postDir,
      '--filename', '{num}.{extension}',
      '--directory', '',
      post.url,
    ];

    let error = null;
    try {
      const result = await runCommand(galleryDl, args, {
        signal,
        onStderr: (chunk) => {
          const line = redact(chunk).trim();
          if (line && onLog) onLog(line);
        },
      });
      if (result.code !== 0) error = classifyFailure(result, browser);
    } catch (runError) {
      error = runError.message;
    }

    /* Собираем скачанные файлы в порядке компонентов */
    let files = [];
    try {
      files = fs.readdirSync(postDir)
        .filter((name) => !name.startsWith('.'))
        .map((name) => path.join(postDir, name))
        .filter((file) => {
          try { return fs.statSync(file).size > 0; }
          catch (_) { return false; }
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch (_) { /* папка пуста */ }

    if (!files.length && !error) {
      error = 'gallery-dl не вернул файлов для этой публикации';
    }

    results.push({ post, files, error });
    if (error && onLog) onLog(`Ошибка: ${post.url} — ${error}`);
  }

  return { stagingRoot, results };
}
