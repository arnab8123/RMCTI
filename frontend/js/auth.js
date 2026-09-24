const Notifications = { refresh: async () => {} };

const Auth = {
  async role(role) {
    if (!sessionStorage.getItem('token')) {
      location.href = '../login.html';
      return null;
    }
    try {
      const user = await Api.get('/auth/me');
      if (user.role !== role) {
        location.href = '../login.html';
        return null;
      }
      sessionStorage.setItem('user', JSON.stringify(user));
      document.querySelectorAll('[data-user]').forEach((el) => { el.textContent = user.name || user.username || ''; });

      const logout = document.querySelector('[data-logout]');
      if (logout) {
        logout.type = 'button';
        logout.addEventListener('click', async (event) => {
          event.preventDefault(); event.stopPropagation();
          try { await Api.post('/auth/logout', {}); } catch (_) {}
          sessionStorage.clear();
          location.href = '../login.html';
        }, { once: true });
      }

      // Shared sidebar behavior is initialized by app.js after page authentication.
      return user;
    } catch (error) { console.error(error); return null; }
  }
};
