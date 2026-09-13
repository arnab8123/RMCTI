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

      document.querySelectorAll('[data-user]').forEach((el) => {
        el.textContent = user.name || user.username || '';
      });

      const logout = document.querySelector('[data-logout]');
      if (logout) {
        logout.type = 'button';
        logout.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          sessionStorage.clear();
          location.href = '../login.html';
        }, { once: true });
      }

      const menu = document.querySelector('[data-menu]');
      if (menu && !menu.dataset.menuBound) {
        menu.type = 'button';
        menu.dataset.menuBound = '1';
        menu.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          document.querySelector('.side')?.classList.toggle('open');
        });
      }

      return user;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
};
