export const THEME_KEY = 'antalyago-theme';

export const isTheme = value => value === 'light' || value === 'dark';

export const resolveTheme = (saved, dark) =>
  isTheme(saved) ? saved : dark === true ? 'dark' : 'light';

export function safeStoredTheme(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(THEME_KEY) ?? null;
  } catch {
    return null;
  }
}

export function persistTheme(theme, storage = globalThis.localStorage) {
  if (!isTheme(theme)) {
    return false;
  }

  try {
    storage?.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

const icons =
  '<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>' +
  '<svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function themeText(theme) {
  return theme === 'dark' ? 'Gündüz' : 'Gece';
}

function themeLabel(theme) {
  return theme === 'dark' ? 'Gündüz temasına geç' : 'Gece temasına geç';
}

export function syncControls(theme, root = document) {
  const dark = theme === 'dark';

  root.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', themeLabel(theme));
    button.innerHTML = icons + '<span class="theme-toggle__text">' + themeText(theme) + '</span>';
  });
}

export function applyTheme(
  theme,
  { root = document, storage = globalThis.localStorage, persist = false } = {}
) {
  const next = isTheme(theme) ? theme : 'light';
  root.documentElement.dataset.theme = next;

  if (persist) {
    persistTheme(next, storage);
  }

  syncControls(next, root);
  return next;
}

export function initTheme({
  root = document,
  storage = globalThis.localStorage,
  media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
} = {}) {
  const theme = resolveTheme(safeStoredTheme(storage), media?.matches === true);
  applyTheme(theme, { root });

  root.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-theme-toggle]');

    if (!toggle) {
      return;
    }

    applyTheme(root.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', {
      root,
      storage,
      persist: true
    });
  });

  requestAnimationFrame(() => {
    root.documentElement.classList.add('theme-ready');
  });

  return theme;
}

function initNav() {
  const button = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-site-nav]');

  if (!button || !nav) {
    return;
  }

  const close = () => {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  button.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');

    nav.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      close();
      button.focus();
    }
  });

  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !button.contains(event.target)) {
      close();
    }
  });

  nav.addEventListener('click', event => {
    if (event.target.closest('a')) {
      close();
    }
  });
}

if (typeof document !== 'undefined') {
  initTheme();
  initNav();

  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY && isTheme(event.newValue)) {
      applyTheme(event.newValue);
    }
  });
}
