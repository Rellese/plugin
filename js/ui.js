/* ============================================================
   ReferenceSync — базовые UI-примитивы
   Каждая фабрика возвращает DOM-узел + методы управления
   состоянием. Разметка соответствует слоям из Figma.
   ============================================================ */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ------------------------------------------------------------
   Switch — 36×18, слоистая структура из switch.css
   ------------------------------------------------------------ */
export function createSwitch({ checked = false, onChange, label, id } = {}) {
  const root = el('div', 'rs-switch');
  root.setAttribute('role', 'switch');
  root.setAttribute('tabindex', '0');
  root.appendChild(el('div', 'rs-switch__knob'));
  if (id) root.id = id;

  let value = Boolean(checked);

  const apply = () => {
    root.classList.toggle('is-on', value);
    root.setAttribute('aria-checked', String(value));
  };

  const toggle = () => {
    if (root.classList.contains('is-disabled')) return;
    value = !value;
    apply();
    if (onChange) onChange(value);
  };

  root.addEventListener('click', toggle);
  root.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  });
  apply();

  const api = {
    node: root,
    get value() { return value; },
    set(next, silent) {
      value = Boolean(next);
      apply();
      if (!silent && onChange) onChange(value);
    },
    setDisabled(state) { root.classList.toggle('is-disabled', Boolean(state)); },
  };

  if (label === undefined) return api;

  /* Обёртка со подписью */
  const row = el('div', 'rs-switch-row');
  const text = el('span', 'rs-switch-row__label', label);
  text.addEventListener('click', toggle);
  row.append(root, text);
  api.row = row;
  api.labelNode = text;
  return api;
}

/* ------------------------------------------------------------
   Checkbox — 12×12 + галочка Vector 1
   ------------------------------------------------------------ */
export function createCheckbox({ checked = false, mixed = false, onChange, label } = {}) {
  const root = el('div', 'rs-check');
  root.setAttribute('role', 'checkbox');
  root.setAttribute('tabindex', '0');
  root.appendChild(el('div', 'rs-check__mark'));

  let value = Boolean(checked);
  let isMixed = Boolean(mixed);

  const apply = () => {
    root.classList.toggle('is-on', value && !isMixed);
    root.classList.toggle('is-mixed', isMixed);
    root.setAttribute('aria-checked', isMixed ? 'mixed' : String(value));
  };

  const toggle = () => {
    if (root.classList.contains('is-disabled')) return;
    value = isMixed ? true : !value;
    isMixed = false;
    apply();
    if (onChange) onChange(value);
  };

  root.addEventListener('click', (event) => {
    event.stopPropagation();
    toggle();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  });
  apply();

  const api = {
    node: root,
    get value() { return value; },
    set(next, silent) {
      value = Boolean(next);
      isMixed = false;
      apply();
      if (!silent && onChange) onChange(value);
    },
    setMixed(state) {
      isMixed = Boolean(state);
      if (isMixed) value = false;
      apply();
    },
  };

  if (label === undefined) return api;

  const row = el('div', 'rs-check-row');
  const text = el('span', 'rs-check-row__label', label);
  text.addEventListener('click', toggle);
  row.append(root, text);
  api.row = row;
  return api;
}

/* ------------------------------------------------------------
   Radio — 12×12 + точка Ellipse 7
   ------------------------------------------------------------ */
export function createRadio({ checked = false, label, onSelect } = {}) {
  const root = el('div', 'rs-radio');
  root.setAttribute('role', 'radio');
  root.setAttribute('tabindex', '0');
  root.appendChild(el('div', 'rs-radio__dot'));

  let value = Boolean(checked);
  const apply = () => {
    root.classList.toggle('is-on', value);
    root.setAttribute('aria-checked', String(value));
  };

  const select = () => {
    if (value) return;
    if (onSelect) onSelect();
  };

  root.addEventListener('click', select);
  root.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      select();
    }
  });
  apply();

  const api = {
    node: root,
    get value() { return value; },
    set(next) { value = Boolean(next); apply(); },
  };

  if (label === undefined) return api;

  const row = el('div', 'rs-radio-row');
  const text = el('span', 'rs-radio-row__label', label);
  text.addEventListener('click', select);
  row.append(root, text);
  api.row = row;
  return api;
}

/* Группа радиокнопок с общим состоянием */
export function createRadioGroup(items, { value, onChange } = {}) {
  const radios = new Map();
  let current = value ?? items[0]?.value;

  const apply = () => {
    radios.forEach((radio, key) => radio.set(key === current));
  };

  items.forEach((item) => {
    const radio = createRadio({
      label: item.label,
      checked: item.value === current,
      onSelect: () => {
        current = item.value;
        apply();
        if (onChange) onChange(current);
      },
    });
    radios.set(item.value, radio);
  });

  return {
    radios,
    get value() { return current; },
    set(next) { current = next; apply(); },
    rowOf(key) { return radios.get(key)?.row; },
    nodeOf(key) { return radios.get(key)?.node; },
  };
}

/* ------------------------------------------------------------
   Info — круглая иконка с подсказкой (300px тултип)
   ------------------------------------------------------------ */
export function createInfo(text, { accent = false } = {}) {
  const root = el('div', 'rs-info');
  root.appendChild(el('span', 'rs-info__glyph', 'i'));

  const tip = el('div', 'rs-tip' + (accent ? ' is-accent' : ''), text);
  document.body.appendChild(tip);

  const place = () => {
    const box = root.getBoundingClientRect();
    tip.classList.add('is-visible');
    const tipBox = tip.getBoundingClientRect();
    let left = box.left + box.width + 10;
    if (left + tipBox.width > window.innerWidth - 10) {
      left = box.left - tipBox.width - 10;
    }
    let top = box.top - 4;
    if (top + tipBox.height > window.innerHeight - 10) {
      top = window.innerHeight - tipBox.height - 10;
    }
    tip.style.left = `${Math.max(10, left)}px`;
    tip.style.top = `${Math.max(10, top)}px`;
  };

  root.addEventListener('mouseenter', place);
  root.addEventListener('mouseleave', () => tip.classList.remove('is-visible'));

  return { node: root, tip };
}

/* ------------------------------------------------------------
   Field — input field.css (366×36)
   ------------------------------------------------------------ */
export function createField({
  value = '',
  placeholder = '',
  at = false,
  chevron = false,
  readOnly = false,
  onInput,
  onCommit,
} = {}) {
  const root = el('div', 'rs-field');
  if (at) root.classList.add('has-at');
  if (chevron) root.classList.add('has-chevron');

  const body = el('div', 'rs-field__body');
  body.appendChild(el('span', 'rs-field__at', '@'));

  const input = document.createElement('input');
  input.className = 'rs-field__input';
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  if (readOnly) input.readOnly = true;
  body.appendChild(input);

  root.append(body, el('div', 'rs-field__chevron'));

  root.addEventListener('mousedown', (event) => {
    if (event.target !== input) {
      event.preventDefault();
      input.focus();
    }
  });
  input.addEventListener('focus', () => root.classList.add('is-focus'));
  input.addEventListener('blur', () => {
    root.classList.remove('is-focus');
    if (onCommit) onCommit(input.value);
  });
  input.addEventListener('input', () => { if (onInput) onInput(input.value); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });

  return {
    node: root,
    input,
    get value() { return input.value; },
    set(next) { input.value = next ?? ''; },
    setDisabled(state) { root.classList.toggle('is-disabled', Boolean(state)); },
  };
}

/* ------------------------------------------------------------
   Select — то же поле, но со выпадающим списком
   ------------------------------------------------------------ */
export function createSelect({ options, value, onChange } = {}) {
  const field = createField({ chevron: true, readOnly: true });
  field.node.classList.add('is-select');

  const menu = el('div', 'rs-select-menu');
  document.body.appendChild(menu);

  let current = value ?? options[0]?.value;

  const labelOf = (key) =>
    options.find((option) => option.value === key)?.label ?? '';

  const render = () => {
    field.set(labelOf(current));
    clear(menu);
    options.forEach((option) => {
      const item = el('button', 'rs-select-menu__item', option.label);
      if (option.value === current) item.classList.add('is-active');
      item.addEventListener('click', () => {
        current = option.value;
        render();
        close();
        if (onChange) onChange(current);
      });
      menu.appendChild(item);
    });
  };

  const close = () => {
    menu.classList.remove('is-open');
    document.removeEventListener('mousedown', outside, true);
  };

  const outside = (event) => {
    if (!menu.contains(event.target) && !field.node.contains(event.target)) {
      close();
    }
  };

  const open = () => {
    const box = field.node.getBoundingClientRect();
    menu.style.minWidth = `${box.width}px`;
    menu.classList.add('is-open');
    const menuBox = menu.getBoundingClientRect();
    let top = box.bottom + 4;
    if (top + menuBox.height > window.innerHeight - 10) {
      top = box.top - menuBox.height - 4;
    }
    menu.style.left = `${box.left}px`;
    menu.style.top = `${Math.max(10, top)}px`;
    document.addEventListener('mousedown', outside, true);
  };

  field.node.addEventListener('click', () => {
    if (field.node.classList.contains('is-disabled')) return;
    if (menu.classList.contains('is-open')) close();
    else open();
  });

  render();

  return {
    node: field.node,
    get value() { return current; },
    set(next) { current = next; render(); },
    setDisabled(state) { field.setDisabled(state); },
  };
}

/* ------------------------------------------------------------
   Spinner — Spinner.css (83×42) + два Stepper
   ------------------------------------------------------------ */
export function createSpinner({
  value = 1,
  min = 1,
  max = 999999999,
  width = 83,
  onChange,
} = {}) {
  const root = el('div', 'rs-spinner');
  root.style.width = `${width}px`;

  const field = el('div', 'rs-spinner__field');
  const input = document.createElement('input');
  input.className = 'rs-spinner__value';
  input.type = 'text';
  input.inputMode = 'numeric';
  input.value = String(value);
  field.appendChild(input);

  const steppers = el('div', 'rs-spinner__steppers');
  const up = el('div', 'rs-stepper');
  up.appendChild(el('div', 'rs-stepper__icon'));
  const down = el('div', 'rs-stepper is-down');
  down.appendChild(el('div', 'rs-stepper__icon'));
  steppers.append(up, down);

  root.append(field, steppers);

  let current = value;

  const apply = (next, silent) => {
    const clamped = Math.min(max, Math.max(min, Number.isFinite(next) ? next : min));
    current = clamped;
    input.value = String(clamped);
    up.classList.toggle('is-disabled', clamped >= max);
    down.classList.toggle('is-disabled', clamped <= min);
    if (!silent && onChange) onChange(clamped);
  };

  up.addEventListener('click', () => apply(current + 1));
  down.addEventListener('click', () => apply(current - 1));
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^\d]/g, '');
  });
  input.addEventListener('blur', () => apply(parseInt(input.value, 10)));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
    if (event.key === 'ArrowUp') { event.preventDefault(); apply(current + 1); }
    if (event.key === 'ArrowDown') { event.preventDefault(); apply(current - 1); }
  });

  apply(value, true);

  return {
    node: root,
    get value() { return current; },
    set(next) { apply(next, true); },
    setDisabled(state) {
      root.style.opacity = state ? '0.4' : '';
      root.style.pointerEvents = state ? 'none' : '';
    },
  };
}

/* ------------------------------------------------------------
   Search button — Search button.css, 5 слоёв свечения
   ------------------------------------------------------------ */
export function createGlassButton({ label, onClick, disabled = false } = {}) {
  const root = el('div', 'rs-glass');
  root.setAttribute('role', 'button');
  root.setAttribute('tabindex', '0');

  root.appendChild(el('div', 'rs-glass__base'));
  ['halo', 'wide', 'core', 'line', 'top'].forEach((kind) => {
    root.appendChild(el('div', `rs-glass__glow rs-glass__glow--${kind}`));
  });

  const plate = el('div', 'rs-glass__plate');
  const text = el('span', 'rs-glass__label', label);
  plate.appendChild(text);
  root.appendChild(plate);

  const fire = () => {
    if (root.classList.contains('is-disabled')) return;
    if (onClick) onClick();
  };
  root.addEventListener('click', fire);
  root.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      fire();
    }
  });

  root.classList.toggle('is-disabled', Boolean(disabled));

  return {
    node: root,
    setLabel(next) { text.textContent = next; },
    setDisabled(state) { root.classList.toggle('is-disabled', Boolean(state)); },
  };
}

/* ------------------------------------------------------------
   Social media button — 36×36 с иконкой
   ------------------------------------------------------------ */
export function createSocialButton({
  icon,
  title,
  active = false,
  locked = false,
  onClick,
} = {}) {
  const root = el('div', 'rs-soc');
  root.title = title;
  root.setAttribute('role', 'button');
  root.setAttribute('tabindex', locked ? '-1' : '0');

  root.appendChild(el('div', 'rs-soc__base'));
  ['halo', 'line', 'top'].forEach((kind) => {
    root.appendChild(el('div', `rs-soc__glow rs-soc__glow--${kind}`));
  });

  const plate = el('div', 'rs-soc__plate');
  const iconBox = el('div', 'rs-soc__icon');
  iconBox.innerHTML = icon || '';
  plate.appendChild(iconBox);
  root.appendChild(plate);

  root.classList.toggle('is-on', Boolean(active));
  root.classList.toggle('is-locked', Boolean(locked));

  root.addEventListener('click', () => {
    if (root.classList.contains('is-locked')) return;
    if (onClick) onClick();
  });

  return {
    node: root,
    setActive(state) { root.classList.toggle('is-on', Boolean(state)); },
  };
}

/* ------------------------------------------------------------
   Простые кнопки
   ------------------------------------------------------------ */
export function createButton({ label, onClick, className = 'rs-btn' } = {}) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => {
    if (node.classList.contains('is-disabled')) return;
    if (onClick) onClick();
  });
  return {
    node,
    setLabel(next) { node.textContent = next; },
    setDisabled(state) { node.classList.toggle('is-disabled', Boolean(state)); },
  };
}

export function createGhostButton(options) {
  return createButton({ ...options, className: 'rs-btn-ghost' });
}

/* ------------------------------------------------------------
   Кнопка редактирования ячейки
   ------------------------------------------------------------ */
export function createEditButton(onClick) {
  const node = el('button', 'rs-edit');
  node.type = 'button';
  node.title = 'Редактировать';
  node.appendChild(el('span', 'rs-edit__icon'));
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    if (onClick) onClick();
  });
  return node;
}
