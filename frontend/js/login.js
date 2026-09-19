document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#login');
  const error = document.querySelector('#err');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await Api.post('/auth/login', Object.fromEntries(new FormData(form).entries()));
      sessionStorage.token = data.token;
      sessionStorage.user = JSON.stringify(data.user);
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
