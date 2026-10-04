document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#login');
  const savedToken = localStorage.getItem('rmcti_token');
  if (savedToken) {
    Api.get('/auth/me').then((user) => {
      location.href = user.role === 'admin'
        ? 'admin/dashboard.html'
        : user.role === 'teacher'
          ? 'teacher/dashboard.html'
          : 'student/dashboard.html';
    }).catch(() => {});
  }

  const error = document.querySelector('#err');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const fd = new FormData(form);
      const remember = fd.get('remember') === '1';
      const payload = { username: String(fd.get('username') || ''), password: String(fd.get('password') || ''), remember };
      const data = await Api.post('/auth/login', payload);
      sessionStorage.token = data.token;
      sessionStorage.user = JSON.stringify(data.user);
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


  const toggle = document.querySelector('[data-toggle-password]');
  const password = document.querySelector('#login-password');
  toggle?.addEventListener('click', () => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? '◉' : '◌';
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    toggle.title = showing ? 'Show password' : 'Hide password';
  });
