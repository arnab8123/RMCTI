(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'tuition-theme';
  const VALID_THEMES = new Set(['dark', 'white', 'rmcti']);
  const THEMES = {
    dark: { label: 'Dark', icon: '◐' },
    white: { label: 'White', icon: '○' },
    rmcti: { label: 'RMCTI', icon: '◆' }
  };

  function applyTheme(theme) {
    const value = VALID_THEMES.has(theme) ? theme : 'white';
    root.dataset.theme = value;
    localStorage.setItem(STORAGE_KEY, value);
    document.body?.setAttribute('data-theme', value);

    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-theme-label]').forEach((el) => {
      el.textContent = THEMES[value]?.label || 'White';
    });
  }

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (VALID_THEMES.has(saved)) return saved;
    return 'white';
  }

  function buildThemeControl(button) {
    if (button.dataset.themeBuilt === '1') return;
    button.dataset.themeBuilt = '1';

    const wrap = document.createElement('div');
    wrap.className = 'theme-switcher';
    wrap.setAttribute('aria-label', 'Choose color theme');
    wrap.innerHTML = `
      <div class="theme-switcher-title"><span>Theme</span><small data-theme-label>White</small></div>
      <div class="theme-options">
        ${Object.entries(THEMES).map(([key, meta]) => `
          <button type="button" class="theme-option" data-theme-option="${key}" aria-label="${meta.label} theme" title="${meta.label} theme">
            <span class="theme-option-dot theme-dot-${key}">${meta.icon}</span>
            <span>${meta.label}</span>
          </button>`).join('')}
      </div>`;

    button.replaceWith(wrap);
    wrap.querySelectorAll('[data-theme-option]').forEach((option) => {
      option.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyTheme(option.dataset.themeOption);
      });
    });
  }

  applyTheme(getInitialTheme());

  function bindThemeButtons() {
    document.querySelectorAll('button[data-theme]').forEach(buildThemeControl);
    applyTheme(root.dataset.theme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindThemeButtons, { once: true });
  } else {
    bindThemeButtons();
  }

  window.applyTheme = applyTheme;
  window.toggleTheme = () => applyTheme(root.dataset.theme === 'dark' ? 'white' : 'dark');
})();
