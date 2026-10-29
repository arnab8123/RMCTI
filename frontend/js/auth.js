const Notifications = { refresh: async () => {} };

const Auth = {
  async role(role) {
    const token = localStorage.getItem('rmcti_token') || sessionStorage.getItem('token');
    if (!token) {
      location.href = '../login.html';
      return null;
    }
    // Keep the active token available to Api without exposing it in the URL.
    sessionStorage.setItem('token', token);
    try {
      const user = await Api.get('/auth/me');
      if (user.role !== role) {
        location.href = '../login.html';
        return null;
      }
      sessionStorage.setItem('user', JSON.stringify(user));
      document.querySelectorAll('[data-user]').forEach((el) => { el.textContent = user.name || user.username || ''; });
      document.querySelectorAll('[data-admin-name]').forEach((el) => { el.textContent = user.name || user.username || 'Admin'; });

      const logout = document.querySelector('[data-logout]');
      if (logout) {
        logout.type = 'button';
        logout.addEventListener('click', async (event) => {
          event.preventDefault(); event.stopPropagation();
          try { await Api.post('/auth/logout', {}); } catch (_) {}
          sessionStorage.clear();
          localStorage.removeItem('rmcti_token');
          localStorage.removeItem('rmcti_user');
          location.href = '../login.html';
        }, { once: true });
      }

      // Shared sidebar behavior is initialized by app.js after page authentication.
      return user;
    } catch (error) { console.error(error); return null; }
  }
};
