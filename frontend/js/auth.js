const Notifications = { refresh: async () => {} };

const Auth = {
  async role(role) {
    if (!sessionStorage.getItem('token')) {
      location.href = '../login.html';
      return null;
    }
    try {
      // Reuse the already-verified profile briefly. The API still validates the JWT
      // on every protected request; this only removes a redundant page-start request.
      let user = null;
      try {
        const cached = JSON.parse(sessionStorage.getItem('user') || 'null');
        const checkedAt = Number(sessionStorage.getItem('user_checked_at') || 0);
        if (cached && cached.role === role && (Date.now() - checkedAt) < 120000) user = cached;
      } catch (_) {}
      if (!user) {
        user = await Api.get('/auth/me');
        if (user.role !== role) {
          location.href = '../login.html';
          return null;
        }
        sessionStorage.setItem('user', JSON.stringify(user));
        sessionStorage.setItem('user_checked_at', String(Date.now()));
      }
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
