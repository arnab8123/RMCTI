document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#login');
  const error = document.querySelector('#err');
  const toggle = document.querySelector('[data-toggle-password]');
  const password = document.querySelector('#login-password');

  // Password visibility toggle: keep this inside DOMContentLoaded so it works
  // consistently even when the login script is cached or loaded asynchronously.
  toggle?.addEventListener('click', () => {
    if (!password) return;
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    toggle.innerHTML = showing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18.5 18.5 0 0 1-3.4 3.9"></path><path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>';
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    toggle.title = showing ? 'Show password' : 'Hide password';
  });

  // A remembered token is stored only in localStorage; the password itself is
  // never stored. The backend keeps remembered tokens valid for 365 days by
  // default so the same device stays signed in across browser restarts.
  const savedToken = localStorage.getItem('rmcti_token');
  if (savedToken) {
    Api.get('/auth/me').then((user) => {
      location.href = user.role === 'admin'
        ? 'admin/dashboard.html'
        : user.role === 'teacher'
          ? 'teacher/dashboard.html'
          : 'student/dashboard.html';
    }).catch(() => {
      localStorage.removeItem('rmcti_token');
      localStorage.removeItem('rmcti_user');
    });
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const fd = new FormData(form);
      const remember = fd.get('remember') === '1';
      const payload = {
        username: String(fd.get('username') || ''),
        password: String(fd.get('password') || ''),
        remember
      };
      const data = await Api.post('/auth/login', payload);

      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('user', JSON.stringify(data.user));
      if (remember) {
        localStorage.setItem('rmcti_token', data.token);
        localStorage.setItem('rmcti_user', JSON.stringify(data.user));
      } else {
        localStorage.removeItem('rmcti_token');
        localStorage.removeItem('rmcti_user');
      }

      location.href = data.user.role === 'admin'
        ? 'admin/dashboard.html'
        : data.user.role === 'teacher'
          ? 'teacher/dashboard.html'
          : 'student/dashboard.html';
    } catch (err) {
      error.textContent = err.message || 'Login failed';
    } finally {
      button.disabled = false;
    }
  });
});
