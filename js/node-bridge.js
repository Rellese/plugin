/* ============================================================
   ReferenceSync — доступ к Node.js внутри Eagle
   Eagle-плагин работает в Chromium с включённым nodeIntegration,
   поэтому доступны child_process / fs / path / os.

   Модуль изолирует эти вызовы, чтобы интерфейс можно было
   открыть и в обычном браузере (для проверки дизайна) —
   в этом случае возвращается заглушка с available === false.
   ============================================================ */

function tryRequire(name) {
  try {
    if (typeof window !== 'undefined' && typeof window.require === 'function') {
      return window.require(name);
    }
    if (typeof require === 'function') return require(name);
  } catch (error) {
    return null;
  }
  return null;
}

export const nodeApi = (() => {
  const childProcess = tryRequire('child_process');
  const fs = tryRequire('fs');
  const path = tryRequire('path');
  const os = tryRequire('os');

  return {
    available: Boolean(childProcess && fs && path && os),
    childProcess,
    fs,
    path,
    os,
  };
})();

export const eagleApi = (() => {
  if (typeof window !== 'undefined' && window.eagle) return window.eagle;
  return null;
})();

/* ------------------------------------------------------------
   Пути плагина
   ------------------------------------------------------------ */
export function pluginRoot() {
  if (eagleApi?.plugin?.path) return eagleApi.plugin.path;
  if (nodeApi.available) return nodeApi.path.resolve('.');
  return '.';
}

export function workRoot() {
  if (!nodeApi.available) return null;
  const { path, os, fs } = nodeApi;
  const base = path.join(os.homedir(), '.reference-sync');
  ensureDir(base);
  return base;
}

export function ensureDir(dir) {
  if (!nodeApi.available) return null;
  const { fs } = nodeApi;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* ------------------------------------------------------------
   Запуск внешней команды с потоковым чтением stdout
   Возвращает { code, stdout, stderr }.
   ------------------------------------------------------------ */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (!nodeApi.available) {
      reject(new Error('Node.js API недоступен: плагин запущен вне Eagle'));
      return;
    }

    const {
      onStdout,
      onStderr,
      cwd,
      env,
      timeout,
      signal,
    } = options;

    let child;
    try {
      child = nodeApi.childProcess.spawn(command, args, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const finish = (fn, payload) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(payload);
    };

    if (timeout) {
      timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
        finish(reject, new Error(`Команда превысила лимит времени: ${command}`));
      }, timeout);
    }

    if (signal) {
      const abort = () => {
        try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
      };
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (onStdout) onStdout(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (onStderr) onStderr(chunk);
    });

    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => finish(resolve, { code, stdout, stderr }));
  });
}

/* ------------------------------------------------------------
   Поиск исполняемого файла (gallery-dl / python)
   ------------------------------------------------------------ */
export async function whichExecutable(names) {
  if (!nodeApi.available) return null;
  const list = Array.isArray(names) ? names : [names];
  const isWindows = process.platform === 'win32';
  const probe = isWindows ? 'where' : 'which';

  for (const name of list) {
    try {
      const result = await runCommand(probe, [name], { timeout: 8000 });
      if (result.code === 0) {
        const first = result.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
        if (first) return first;
      }
    } catch (_) { /* пробуем следующее имя */ }
  }

  /* Резервные пути установки для macOS/Linux */
  const fallbacks = isWindows ? [] : [
    '/opt/homebrew/bin/gallery-dl',
    '/usr/local/bin/gallery-dl',
    `${nodeApi.os.homedir()}/.local/bin/gallery-dl`,
    `${nodeApi.os.homedir()}/Library/Python/3.11/bin/gallery-dl`,
  ];
  for (const candidate of fallbacks) {
    if (list.some((name) => candidate.endsWith(name)) &&
        nodeApi.fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/* ------------------------------------------------------------
   Файловые помощники
   ------------------------------------------------------------ */
export function readJson(file, fallback = null) {
  if (!nodeApi.available) return fallback;
  try {
    return JSON.parse(nodeApi.fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

export function writeJson(file, data) {
  if (!nodeApi.available) return false;
  try {
    ensureDir(nodeApi.path.dirname(file));
    nodeApi.fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}
