(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'rmcti-theme';
  const LEGACY_KEYS = ['tuition-theme', 'theme'];
  const VALID_THEMES = new Set(['light', 'dark']);
  let channel = null;

  try {
    if ('BroadcastChannel' in window) channel = new BroadcastChannel('rmcti-theme-sync');
  } catch (_) {}

  function normalize(value) {
    if (value === 'dark' || value === 'dark-mode') return 'dark';
    if (value === 'light' || value === 'light-mode') return 'light';
    return null;
  }

  function readSavedTheme() {
    try {
      const canonical = normalize(localStorage.getItem(STORAGE_KEY));
      if (canonical) return canonical;
      for (const key of LEGACY_KEYS) {
        const legacy = normalize(localStorage.getItem(key));
        if (legacy) return legacy;
      }
    } catch (_) {}
    return null;
  }

  function updateControls(theme) {
    document.querySelectorAll('button[data-theme]').forEach((button) => {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      if (button.id === 'themeToggle') {
        button.innerHTML = theme === 'dark'
          ? '<i class="fas fa-sun text-yellow-300" aria-hidden="true"></i><span class="sr-only">Switch to light mode</span>'
          : '<i class="fas fa-moon text-blue-200" aria-hidden="true"></i><span class="sr-only">Switch to dark mode</span>';
        button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      } else if (button.classList.contains('login-theme-toggle')) {
        button.textContent = theme === 'dark' ? '☀' : '◐';
        button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      } else {
        const label = button.querySelector('[data-theme-label]');
        if (label) label.textContent = theme === 'dark' ? '☀ Light mode' : '◐ Dark mode';
        else if (!button.dataset.themeCustomLabel) {
          button.textContent = theme === 'dark' ? '☀ Light mode' : '◐ Dark mode';
        }
        button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      }
    });
  }

  function applyTheme(theme, persist = false, broadcast = false) {
    const value = VALID_THEMES.has(theme) ? theme : 'light';
    root.dataset.theme = value;
    if (document.body) {
      document.body.classList.toggle('dark-mode', value === 'dark');
      document.body.classList.toggle('light-mode', value === 'light');
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, value);
        // Keep old keys in sync for any older page scripts still in browser cache.
        localStorage.setItem('tuition-theme', value);
        localStorage.setItem('theme', value === 'dark' ? 'dark-mode' : 'light-mode');
      } catch (_) {}
    }
    updateControls(value);
    if (broadcast && channel) {
      try { channel.postMessage({ theme: value }); } catch (_) {}
    }
    return value;
  }

  function getInitialTheme() {
    const saved = readSavedTheme();
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true, true);
  }

  // Apply the saved theme as early as possible to avoid a light-theme flash.
  applyTheme(getInitialTheme(), false, false);

  function bindThemeControls() {
    // Event delegation also covers controls inserted after initial page load.
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-theme]') : null;
      if (!button) return;
      toggleTheme(event);
    });
    updateControls(root.dataset.theme || getInitialTheme());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(getInitialTheme(), false, false);
      bindThemeControls();
    }, { once: true });
  } else {
    bindThemeControls();
  }

  // Keep already-open tabs and windows synchronized with the same preference.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === 'tuition-theme' || event.key === 'theme') {
      const next = normalize(event.newValue);
      if (next) applyTheme(next, false, false);
    }
  });
  if (channel) {
    channel.addEventListener('message', (event) => {
      const next = normalize(event.data?.theme);
      if (next) applyTheme(next, true, false);
    });
  }

  window.applyTheme = (theme) => applyTheme(normalize(theme) || 'light', true, true);
  window.toggleTheme = toggleTheme;
})();
