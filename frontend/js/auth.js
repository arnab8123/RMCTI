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

      const menu = document.querySelector('[data-menu]');
      const side = document.querySelector('.side');
      if (menu && side && !menu.dataset.menuBound) {
        menu.type = 'button'; menu.dataset.menuBound='1';
        const closeMenu=()=>side.classList.remove('open');
        menu.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();side.classList.toggle('open');});
        document.addEventListener('click',(event)=>{if(!side.classList.contains('open'))return;if(!side.contains(event.target)&&!menu.contains(event.target))closeMenu();});
        document.addEventListener('touchstart',(event)=>{if(!side.classList.contains('open'))return;if(!side.contains(event.target)&&!menu.contains(event.target))closeMenu();},{passive:true});
        document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu();});
        window.addEventListener('resize',()=>{if(window.innerWidth>800)closeMenu();});
        side.querySelectorAll('a, button').forEach((item)=>item.addEventListener('click',closeMenu));
      }

      return user;
    } catch (error) { console.error(error); return null; }
  }
};
