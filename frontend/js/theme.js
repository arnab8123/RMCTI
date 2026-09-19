(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'tuition-theme';
  const VALID_THEMES = new Set(['light', 'dark']);

  function applyTheme(theme) {
    const value = VALID_THEMES.has(theme) ? theme : 'light';
    root.dataset.theme = value;
    localStorage.setItem(STORAGE_KEY, value);

    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = value === 'dark' ? '☀ Light mode' : '◐ Dark mode';
    });
  }

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.has(saved)) return saved;

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function toggleTheme(event) {
    // IMPORTANT: the <html> element receives data-theme="light/dark".
    // Never use a generic [data-theme] delegated selector here, because
    // every element is a descendant of <html> and would toggle the theme.
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  applyTheme(getInitialTheme());

  // Bind ONLY to the actual theme-control buttons.
  // No document-level click handler: ordinary clicks/touches must never
  // be interpreted as a theme action.
  function bindThemeButtons() {
    document.querySelectorAll('button[data-theme]').forEach((button) => {
      if (button.dataset.themeBound === '1') return;
      button.type = 'button';
      button.dataset.themeBound = '1';
      button.addEventListener('click', toggleTheme);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindThemeButtons, { once: true });
  } else {
    bindThemeButtons();
  }

  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;
})();
